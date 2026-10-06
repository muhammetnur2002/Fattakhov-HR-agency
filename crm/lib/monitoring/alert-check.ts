import { createTransport } from "nodemailer";

import { assertCanDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { plural } from "@/lib/notifications/events";
import { sendPushToUser, type PushOutcome } from "@/lib/notifications/push";
import { pushConfigured } from "@/lib/notifications/push-config";
import { vkHumanError, vkSendMessage } from "@/lib/notifications/vk-api";

/**
 * Проверка канала оповещений о сбоях.
 *
 * Зачем отдельный путь, а не вызов обычной отправки. Боевые транспорты
 * (lib/notifications/transport.ts) намеренно глотают отказы: недоставленное
 * письмо не должно ронять действие, ради которого оно отправлялось. Для
 * рабочего пути это правильно, но проверка, построенная на них, отвечала бы
 * «отправлено» всегда — и при неверном пароле, и при чужой странице
 * ВК. Инструмент, который подтверждает сам себя, хуже его отсутствия:
 * на него полагаются.
 *
 * Поэтому здесь своя ветка, которая ошибку НЕ прячет, а показывает причину.
 * Для почты — `verify()` перед отправкой: он открывает соединение и входит
 * под тем же логином, то есть ловит неверный пароль и порт до письма
 * (приём из scripts/bootstrap-owner.ts). Для ВК — разбор тела ответа
 * (lib/notifications/vk-api.ts): отказ там приходит и с кодом 200.
 *
 * Проверка нужна не один раз: сменили пароль от ящика, завели другой ящик
 * под сбои, перевыпустили токен бота — и канал молча перестал работать.
 * Молча, потому что снаружи он ничем себя не проявляет, пока не случится
 * настоящий сбой.
 */

export type ChannelState = "sent" | "failed" | "not-configured";

export type ChannelResult = {
  state: ChannelState;
  /** Человеческое объяснение: что именно произошло и что делать. */
  detail: string;
};

export type AlertCheckResult = {
  email: ChannelResult;
  vk: ChannelResult;
  push: ChannelResult;
};

/**
 * Убрать логин и пароль из текста ошибки.
 *
 * Ошибки nodemailer охотно цитируют строку подключения целиком, а она
 * вида smtp://ящик:пароль@хост. Показать её на экране — отдать пароль
 * от почты любому, кто заглянет через плечо или в журнал браузера.
 */
export function hideCredentials(text: string): string {
  return text.replace(/([a-z]+):\/\/[^@\s/]+@/gi, "$1://<логин:пароль>@");
}

/**
 * Что пошло не так с почтой.
 *
 * Два текста, и это не дублирование. На экране человек должен увидеть
 * причину и понять, что делать; коды, ответы сервера и идентификаторы
 * писем ему не говорят ничего, а выглядят как поломка сами по себе.
 * Поэтому подробности уходят в журнал контейнера, где их и ищут.
 */
export function smtpReason(error: unknown): {
  human: string;
  technical: string;
} {
  const e = error as {
    code?: string;
    response?: string;
    message?: string;
  };

  const human: Record<string, string> = {
    EAUTH: "Почтовый сервер не принял логин или пароль.",
    ECONNECTION: "Не удалось соединиться с почтовым сервером.",
    ETIMEDOUT: "Почтовый сервер не ответил вовремя.",
    ESOCKET: "Соединение с почтовым сервером оборвалось.",
    EENVELOPE: "Почтовый сервер отклонил адрес отправителя или получателя.",
    EDNS: "Не удалось найти почтовый сервер по имени.",
  };

  return {
    human: (e.code && human[e.code]) || "Письмо отправить не удалось.",
    technical: describeSmtpError(error),
  };
}

/** Полный разбор — для журнала сервера, не для экрана. */
export function describeSmtpError(error: unknown): string {
  const e = error as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };

  // Коды nodemailer говорят о причине точнее любого текста
  const known: Record<string, string> = {
    EAUTH: "сервер не принял логин или пароль",
    ECONNECTION: "не удалось соединиться с сервером",
    ETIMEDOUT: "сервер не ответил вовремя",
    ESOCKET: "соединение оборвалось — обычно несовпадение порта и шифрования",
    EENVELOPE: "сервер отклонил адрес отправителя или получателя",
    EDNS: "адрес сервера не разрешается в IP",
  };

  const reason = e.code ? known[e.code] : undefined;
  const server = e.response ? ` Ответ сервера: ${e.response}` : "";
  const raw = e.message ?? String(error);

  return hideCredentials(
    reason
      ? `${reason} (${e.code}).${server}`
      : `${raw}${server}`.slice(0, 300),
  );
}

/** Ограничитель для сетевых вызовов: проверка не должна висеть молча. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${what} не ответил за ${ms / 1000} секунд`)),
        ms,
      ),
    ),
  ]);
}

/** Настоящее письмо на ящик сбоев, с проброшенной ошибкой. */
async function checkEmail(who: string): Promise<ChannelResult> {
  const url = process.env.SMTP_URL?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const to = process.env.ALERT_EMAIL?.trim();

  if (!url || !from) {
    return {
      state: "not-configured",
      detail:
        "Почта не настроена (SMTP_URL, SMTP_FROM) — сообщения о сбоях пишутся только в журнал сервера.",
    };
  }
  if (!to) {
    return {
      state: "not-configured",
      detail:
        "Не задан ящик для сбоев (ALERT_EMAIL) — письму о сбое некуда идти.",
    };
  }

  const transporter = createTransport(url);
  try {
    // Вход под тем же логином: неверный пароль и порт всплывут здесь
    await withTimeout(transporter.verify(), 15_000, "почтовый сервер");

    const info = await withTimeout(
      transporter.sendMail({
        from,
        to,
        subject: "Проверка канала оповещений — это не сбой",
        text: [
          "Это проверочное письмо, отправленное вручную из кабинета.",
          "Платформа работает нормально, разбираться не нужно.",
          "",
          `Кто проверял: ${who}.`,
          "",
          "Если письмо дошло — канал сообщений о сбоях исправен,",
          "и настоящие сообщения об ошибках придут на этот же ящик.",
        ].join("\n"),
      }),
      20_000,
      "почтовый сервер",
    );

    const response = (info as { response?: string }).response;
    console.info(`[оповещения] проверочное письмо для ${to}: ${response ?? "принято"}`);
    return {
      state: "sent",
      detail: `Письмо отправлено на ${to}. Проверьте ящик — в нём должно быть письмо с темой «Проверка канала оповещений».`,
    };
  } catch (error) {
    const reason = smtpReason(error);
    console.error(`[оповещения] письмо не ушло: ${reason.technical}`);
    return { state: "failed", detail: reason.human };
  } finally {
    transporter.close();
  }
}

/** Настоящее сообщение в ВК тому, кто нажал, с разбором отказа. */
async function checkVk(vkUserId: string | null, who: string): Promise<ChannelResult> {
  const token = process.env.VK_BOT_TOKEN?.trim();

  if (!token) {
    return {
      state: "not-configured",
      detail:
        "ВКонтакте на сервере не подключён: нет ключа сообщества (VK_BOT_TOKEN).",
    };
  }
  if (!vkUserId) {
    return {
      state: "not-configured",
      detail:
        "К вашему профилю не привязана страница ВКонтакте — привяжите её в блоке «ВКонтакте» в настройках уведомлений выше (код пишется сообществу в личные сообщения).",
    };
  }

  const result = await vkSendMessage(
    token,
    vkUserId,
    "Проверка канала оповещений. Это не сбой — платформа работает.\n" +
      `Проверку запустили из кабинета: ${who}.`,
  );
  if (result.ok) {
    return { state: "sent", detail: "ВКонтакте принял сообщение." };
  }

  console.error(`[оповещения] ВК отказал: ${result.code ?? "—"} ${result.message}`);
  return {
    state: "failed",
    detail:
      (vkHumanError(result.code) ?? "ВКонтакте не принял сообщение") +
      ". Подробности — в журнале сервера.",
  };
}

/**
 * Настоящий пуш на устройства того, кто нажал.
 *
 * Своей ветки, как у почты и ВК, здесь не нужно: отправка
 * пуша и так не прячет исход — служба уведомлений отвечает кодом,
 * и он возвращается по каждому устройству. Заодно проверка чистит
 * отмершие подписки, как и обычная рассылка.
 */
async function checkPush(userId: string, devices: number): Promise<ChannelResult> {
  if (!pushConfigured()) {
    return {
      state: "not-configured",
      detail:
        "Уведомления на устройства на сервере не подключены (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).",
    };
  }
  if (devices === 0) {
    return {
      state: "not-configured",
      detail:
        "Ни на одном вашем устройстве не включены уведомления — включите их в настройках уведомлений выше.",
    };
  }

  const delivery = await sendPushToUser(userId, {
    title: "Проверка канала оповещений",
    body: "Это не сбой — платформа работает.",
    url: "/a/settings",
    tag: "alert-check",
  });

  if (delivery.sent > 0) {
    const missed = delivery.outcomes.length - delivery.sent;
    return {
      state: "sent",
      detail:
        `Служба уведомлений приняла уведомление для ${delivery.sent} ` +
        `${plural(delivery.sent, "устройства", "устройств", "устройств")}` +
        (missed > 0 ? `; не дошло до ${missed}: ${pushFailureReason(delivery.outcomes)}` : "") +
        ". Проверьте телефон или компьютер. Если на компьютере ничего не появилось, " +
        "а служба уведомлений приняла сообщение, дело в самом компьютере: разрешите " +
        "уведомления браузеру в системных настройках (на Mac: Системные настройки, " +
        "Уведомления, ваш браузер) и выключите режим «Не беспокоить».",
    };
  }
  return { state: "failed", detail: pushFailureReason(delivery.outcomes) };
}

/** Почему пуш не дошёл — словами, по самой показательной причине. */
export function pushFailureReason(outcomes: PushOutcome[]): string {
  if (outcomes.some((o) => o.state === "unreachable")) {
    return (
      "Сервер не смог связаться со службой уведомлений браузера. Если это повторяется, " +
      "адреса служб уведомлений недоступны из облака, где стоит платформа."
    );
  }
  const rejected = outcomes.find(
    (o): o is Extract<PushOutcome, { state: "rejected" }> => o.state === "rejected",
  );
  if (rejected) {
    return (
      `Служба уведомлений отказала (код ${rejected.status}). Подробности — в журнале ` +
      "сервера; если ключи VAPID меняли, уведомления придётся включить заново."
    );
  }
  if (outcomes.some((o) => o.state === "gone")) {
    return "Подписка устройства устарела и удалена — включите уведомления на нём заново.";
  }
  return "Уведомление не отправлено. Подробности — в журнале сервера.";
}

/**
 * Проверить каналы.
 *
 * Только владелец: сообщения о сбоях адресованы ему, и проверка шлёт
 * настоящее письмо на общий ящик сбоев.
 */
export async function checkAlertChannels(
  actor: Actor,
): Promise<AlertCheckResult> {
  assertCanDo(actor, "org.settings");

  const user = await prisma.user.findFirst({
    where: { id: actor.id },
    select: {
      fullName: true,
      vkUserId: true,
      _count: { select: { pushSubscriptions: true } },
    },
  });
  const who = user?.fullName ?? "неизвестно кто";

  const [email, vk, push] = await Promise.all([
    checkEmail(who),
    checkVk(user?.vkUserId ?? null, who),
    checkPush(actor.id, user?._count.pushSubscriptions ?? 0),
  ]);

  return { email, vk, push };
}
