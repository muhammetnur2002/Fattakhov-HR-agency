"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { plural } from "@/lib/notifications/events";
import { resolveLink } from "@/lib/notifications/links";
import {
  deleteOtherPushSubscriptions,
  deletePushSubscription,
  pushServiceName,
  savePushSubscription,
  sendPushToSubscription,
  sendPushToUserDevices,
  type PushOutcome,
} from "@/lib/notifications/push";
import { pushConfigured } from "@/lib/notifications/push-config";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import {
  keepEndpointSchema,
  pushEndpointSchema,
  pushSubscriptionSchema,
} from "@/lib/validation/push";

/**
 * Пуш-уведомления: включить и выключить на устройстве.
 *
 * Подписка всегда за тем, кто вошёл, — ни id пользователя, ни чего-либо
 * ещё о человеке из браузера не принимается: только сама подписка.
 */

export type PushActionResult = {
  ok?: string;
  /** Подписка сохранена, но проверочное уведомление не ушло. */
  warning?: string;
  error?: string;
  /**
   * Служба уведомлений не узнала подписку: браузер держит отмершую
   * (служба её уже погасила, а браузер ещё нет). Странице стоит
   * отписаться в браузере и подписаться заново — один раз, без
   * участия человека.
   */
  resubscribe?: boolean;
};

export async function subscribePushAction(input: unknown): Promise<PushActionResult> {
  const actor = await requireActor();
  // Блок в настройках без канала не показывается — сюда только в обход
  if (!pushConfigured()) {
    return { error: "Уведомления на устройства на сервере не подключены." };
  }

  const rate = await guardRate("pushSubscribe", actor.id);
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        "Браузер прислал подписку, которую нельзя принять. Обновите страницу и попробуйте ещё раз.",
    };
  }

  const userAgent = (await headers()).get("user-agent");
  const subscription = await savePushSubscription(actor.id, parsed.data, userAgent);

  /*
    Проверочное уведомление — сразу и на это же устройство. Уведомления,
    включённые «на словах», которые на деле не доходят, хуже выключенных:
    человек на них рассчитывает. Так он видит результат сразу, а отмершая
    подписка обнаруживается до первого настоящего события, а не после.
  */
  const outcome = await sendPushToSubscription(subscription, {
    title: "Уведомления включены",
    body: "Уведомления кабинета будут приходить на это устройство.",
    url: resolveLink({ agency: "/a/settings", client: "/settings" }, actor.role),
    tag: "push-enabled",
  });
  revalidateSettings();

  const service = pushServiceName(subscription.endpoint);
  switch (outcome.state) {
    case "sent":
      return { ok: "Готово: на это устройство отправлено проверочное уведомление." };
    case "gone":
      // Подписку отправка уже удалила — на её место встанет новая
      return {
        resubscribe: true,
        error: `Служба уведомлений (${service}) не узнала подписку этого браузера. Нажмите «Включить» ещё раз.`,
      };
    case "rejected":
      return {
        warning:
          `Подписка сохранена, но служба уведомлений (${service}) не приняла проверочное ` +
          `уведомление (код ${outcome.status}). Если оно не придёт, отключите и включите уведомления снова.`,
      };
    case "unreachable":
      return {
        warning:
          `Подписка сохранена, но сервер не смог связаться со службой уведомлений (${service}). ` +
          "Если проверочное уведомление не придёт, на это устройство уведомления пока не доходят — письма приходят как обычно.",
      };
  }
}

/** Результат проверки по одному устройству. */
export type PushTestDevice = {
  /** «Chrome · Windows» — какое именно устройство. */
  label: string;
  service: string;
  state: PushOutcome["state"];
  /** Что это значит для человека и что делать. */
  text: string;
};

export type PushTestResult = {
  error?: string;
  /** Итог одной строкой: «Принято службой: 1 из 2». */
  summary?: string;
  /** Предупреждение поверх итога — например, снята общая галочка. */
  note?: string;
  devices?: PushTestDevice[];
};

/**
 * «Отправить проверочное уведомление» — настоящая отправка на все
 * устройства вошедшего, с исходом по каждому.
 *
 * Зачем. При включении пробное уходит один раз, а дальше проверить
 * доставку было нечем: настоящие события случаются редко и не всем (владелец
 * получает лишь заявки и платформу), и тишина телефона ничего не
 * доказывала. Здесь видно, дошёл ли запрос до службы уведомлений и что она
 * ответила, а на сервере остаётся такая же строка журнала, как у любой
 * рассылки. «Принято службой» — это и есть «ушло»: дальше всё зависит
 * от самого устройства (сеть, разрешения браузера и системы).
 *
 * Идёт мимо галочки «Уведомления на телефон и компьютер» и категорий:
 * проверяется канал, а не настройки; о снятой галочке сказано в ответе.
 */
export async function sendTestPushAction(): Promise<PushTestResult> {
  const actor = await requireActor();
  if (!pushConfigured()) {
    return { error: "Уведомления на устройства на сервере не подключены." };
  }

  const rate = await guardRate("pushTest", actor.id);
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  const { devices } = await sendPushToUserDevices(actor.id, {
    title: "Проверка уведомлений",
    body: "Если вы это видите, уведомления доходят.",
    url: resolveLink({ agency: "/a/settings", client: "/settings" }, actor.role),
    tag: "push-test",
    urgency: "high",
  });

  if (devices.length === 0) {
    return {
      error:
        "Ни на одном устройстве уведомления не включены. Нажмите «Включить» на нужном телефоне или компьютере.",
    };
  }

  const sent = devices.filter((d) => d.outcome.state === "sent").length;
  const user = await prisma.user.findFirst({
    where: { id: actor.id },
    select: { notifyPrefs: true },
  });
  const prefs =
    typeof user?.notifyPrefs === "object" && user.notifyPrefs !== null
      ? (user.notifyPrefs as Record<string, unknown>)
      : {};
  revalidateSettings();

  return {
    summary: `Принято службой уведомлений: ${sent} из ${devices.length}.`,
    note:
      prefs.push === false
        ? "Галочка «Уведомления на телефон и компьютер» снята: проверка дошла, но настоящие события пока не придут."
        : undefined,
    devices: devices.map((device) => ({
      label: device.label,
      service: device.service,
      state: device.outcome.state,
      text: describeOutcome(device.outcome, device.service),
    })),
  };
}

function describeOutcome(outcome: PushOutcome, service: string): string {
  switch (outcome.state) {
    case "sent":
      return (
        `принято службой уведомлений (${service}). Уведомление должно появиться на устройстве; ` +
        "если нет — проверьте, что браузер и телефон не запрещают уведомления и не включён режим «Не беспокоить»."
      );
    case "gone":
      return (
        `подписка погасла — служба (${service}) её больше не узнаёт, устройство удалено из списка. ` +
        "Откройте кабинет на этом устройстве и включите уведомления заново."
      );
    case "rejected":
      return (
        `служба уведомлений (${service}) отказала, код ${outcome.status}. ` +
        "Подробности — в журнале сервера; подписка осталась, повторите проверку позже."
      );
    case "unreachable":
      return (
        `сервер не смог связаться со службой уведомлений (${service}): сеть или таймаут. ` +
        "Подписка осталась; если повторяется, адреса служб недоступны из облака, где стоит платформа."
      );
  }
}

/** Выключить на этом устройстве. Только свою подписку: чужая по адресу не находится. */
export async function unsubscribePushAction(input: unknown): Promise<PushActionResult> {
  const actor = await requireActor();

  const parsed = pushEndpointSchema.safeParse(input);
  if (!parsed.success) return { error: "Не удалось определить подписку этого устройства." };

  await deletePushSubscription(actor.id, parsed.data.endpoint);
  revalidateSettings();
  return { ok: "Уведомления на этом устройстве выключены." };
}

/**
 * Выключить на всех остальных устройствах — для потерянного или
 * отданного телефона, на котором «Отключить» уже не нажать.
 */
export async function removeOtherPushDevicesAction(
  input: unknown,
): Promise<PushActionResult> {
  const actor = await requireActor();

  const parsed = keepEndpointSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Не удалось определить подписку этого устройства." };

  const removed = await deleteOtherPushSubscriptions(actor.id, parsed.data.keepEndpoint);
  revalidateSettings();
  return {
    ok:
      removed > 0
        ? `Выключено ещё на ${removed} ${plural(removed, "устройстве", "устройствах", "устройствах")}.`
        : "Других устройств с уведомлениями нет.",
  };
}

function revalidateSettings(): void {
  revalidatePath("/settings");
  revalidatePath("/a/settings");
}
