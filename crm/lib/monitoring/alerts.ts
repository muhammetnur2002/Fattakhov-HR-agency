import { prisma } from "@/lib/db/prisma";
import { getEmailTransport, getVkTransport } from "@/lib/notifications/channels";
import { sendPushToUser } from "@/lib/notifications/push";
import { pushConfigured } from "@/lib/notifications/push-config";

/**
 * Сообщения о сбоях владельцу.
 *
 * Зачем. До этого модуля о поломке узнавали от пострадавшего: страница
 * отдавала пятисотку, человек писал в чат, и только тогда кто-то шёл
 * в журнал сервера. Журнал при этом есть, но в него никто не смотрит
 * без повода — а повод и есть та самая жалоба.
 *
 * Почему не Sentry. Это зарубежный сервис, и отправка туда отчётов
 * об ошибках — передача данных за пределы страны со всеми вопросами
 * 152-ФЗ. Заказчик отказалась.
 *
 * Два канала, и они разные по назначению:
 *
 *   ПОЧТА — отдельный ящик под сбои (ALERT_EMAIL), на том же российском
 *     хостинге, что и остальная почта продукта. Сюда идёт разбор:
 *     заголовок ошибки и начало стека, то есть достаточно, чтобы понять,
 *     куда смотреть, не заходя на сервер. Отдельный ящик, а не рабочий,
 *     намеренно: сбои не должны теряться среди писем от людей.
 *
 *   ВКОНТАКТЕ — короткий сигнал «посмотри почту», на телефон. Туда уходит
 *     только заголовок, а не содержимое: сообщение живёт в переписке
 *     дольше, чем нужно. Рядом пуш на устройства. В пуше и заголовка нет:
 *     только где случилось — уведомление видно на экране блокировки.
 *
 * Текст чистится (см. scrub) для ОБОИХ каналов. Почтовый ящик наш,
 * но лежит он у хостинг-провайдера, и складывать туда телефоны
 * кандидатов ради удобства разбора незачем: для диагностики нужны
 * строки стека, а не значения полей.
 *
 * Все каналы необязательны: нет ALERT_EMAIL — не шлём письма, нет
 * токена бота — не шлём во ВКонтакте. Приложение от этого не падает,
 * подробности в любом случае остаются в журнале контейнера.
 */

/** Одинаковые сбои не спамят: одно сообщение на ключ за это время. */
const SILENCE_MS = 15 * 60_000;

/** Ключ → когда в последний раз отправляли. Процесс один, память сойдёт. */
const lastSent = new Map<string, number>();

/**
 * Вычистить из текста то, что похоже на персональные данные.
 *
 * Сообщения библиотек не стесняются подставлять значения: ошибка
 * уникальности покажет адрес почты, ошибка проверки — введённый телефон.
 * Отправлять такое в мессенджер нельзя, а полностью
 * отказаться от текста значит получать сообщения вида «что-то упало».
 *
 * Поэтому маскируем по образцам, а не по списку полей: почты, телефоны,
 * длинные цепочки цифр и токены из ссылок. Остаётся тип ошибки и суть.
 */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<почта>")
    .replace(/\+?\d[\d\s()-]{9,}\d/g, "<телефон>")
    // Токен — длинная строка, в которой есть и буквы, и цифры. Условие
    // про цифру существенное: без него под правило попадали названия
    // классов ошибок вроде PrismaClientKnownRequestError, а это ровно
    // то, ради чего сообщение и отправляется
    .replace(/\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g, "<токен>")
    .replace(/\b\d{6,}\b/g, "<цифры>");
}

/**
 * Начало стека, очищенное и обрезанное.
 *
 * Полный стек в письме не нужен: первые строки показывают наш код,
 * дальше идут кадры фреймворка, одинаковые у любой ошибки.
 */
function stackFor(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  return scrub(error.stack.split("\n").slice(0, 12).join("\n"));
}

/** Короткий заголовок ошибки: класс и первая непустая строка. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    // Непустая, а не просто первая: сообщения Prisma начинаются с перевода
    // строки, и заголовок выходил голым «PrismaClientKnownRequestError: ».
    // А заголовок — ещё и ключ тишины: любые сбои базы в одном месте
    // склеивались в один, и второй, другой, молчал 15 минут
    const first =
      (error.message || "").split("\n").find((line) => line.trim()) ?? "";
    return `${error.name}: ${scrub(first.trim()).slice(0, 300)}`;
  }
  return scrub(String(error)).slice(0, 300);
}

/**
 * Кому писать.
 *
 * Только владельцам и только тем, кто привязал страницу ВК или включил
 * уведомления на устройстве: это рабочее сообщение о состоянии системы,
 * а не уведомление по кандидату. Рекрутеру оно не поможет, а разбираться
 * всё равно владельцу.
 */
async function recipients(): Promise<{
  vk: string[];
  /** Владельцы с подписанными устройствами — id пользователей. */
  push: string[];
}> {
  const withPush = pushConfigured();
  const users = await prisma.user.findMany({
    where: {
      role: "OWNER",
      isActive: true,
      OR: [
        { vkUserId: { not: null } },
        ...(withPush ? [{ pushSubscriptions: { some: {} } }] : []),
      ],
    },
    select: {
      id: true,
      vkUserId: true,
      _count: { select: { pushSubscriptions: true } },
    },
  });
  return {
    vk: users.map((u) => u.vkUserId).filter((id): id is string => Boolean(id)),
    push: withPush
      ? users.filter((u) => u._count.pushSubscriptions > 0).map((u) => u.id)
      : [],
  };
}

/**
 * Сообщить о сбое.
 *
 * Не бросает никогда. Сбой отправки сообщения о сбое не должен
 * превращаться во второй сбой — это верный способ получить петлю.
 */
export async function reportFailure(params: {
  /** Где случилось: «запрос», «планировщик», имя задачи. */
  where: string;
  error: unknown;
  /** Путь без параметров запроса: в них бывают токены и идентификаторы. */
  path?: string;
}): Promise<void> {
  try {
    const title = describe(params.error);
    const key = `${params.where}|${title}`;
    const now = Date.now();
    const previous = lastSent.get(key);
    if (previous !== undefined && now - previous < SILENCE_MS) return;
    lastSent.set(key, now);

    const header = [
      `Где: ${params.where}`,
      params.path ? `Адрес: ${params.path}` : null,
      title,
    ].filter(Boolean) as string[];

    // Письмо: с разбором. Ящик под сбои, читать его будут за этим
    const alertEmail = process.env.ALERT_EMAIL?.trim();
    if (alertEmail) {
      const stack = stackFor(params.error);
      const body = [
        ...header,
        "",
        stack ? "Начало стека:" : "Стека нет: ошибка не из класса Error.",
        stack ?? "",
        "",
        "Значения полей вычищены намеренно — почты, телефоны и токены",
        "заменены метками. Полный текст есть в журнале контейнера:",
        "sudo docker logs coi-app-1 (или coi-worker-1 для планировщика).",
        "",
        "Повтор той же ошибки не придёт ещё 15 минут.",
      ].join("\n");

      await getEmailTransport().send({
        to: alertEmail,
        subject: `⚠️ Сбой: ${title.slice(0, 120)}`,
        text: body,
      });
    }

    // ВК: короткий сигнал на телефон, без разбора — иначе о сбое
    // узнают тогда, когда откроют почту
    const to = await recipients();
    const whereToLook = alertEmail
      ? "Разбор — в почте по сбоям."
      : "Подробности — в журнале сервера.";
    if (to.vk.length > 0) {
      const short = ["⚠️ Сбой в платформе", ...header, "", whereToLook].join("\n");

      const vk = getVkTransport();
      for (const userId of to.vk) {
        await vk.send({ userId, text: short });
      }
    }

    // Пуш — без заголовка ошибки и адреса: экран блокировки видят все,
    // кто рядом с телефоном. Где случилось и куда смотреть — достаточно
    for (const userId of to.push) {
      await sendPushToUser(userId, {
        title: "⚠️ Сбой в платформе",
        body: `Где: ${params.where}. ${whereToLook}`,
        url: "/a",
        tag: "platform-failure",
        urgency: "high",
      });
    }
  } catch (error) {
    // Только в журнал: писать о неудаче сообщения о неудаче некуда
    console.error("[сбой] не удалось сообщить о сбое", error);
  }
}

/** Для тестов: забыть, о чём уже сообщали. */
export function resetAlertSilence(): void {
  lastSent.clear();
}
