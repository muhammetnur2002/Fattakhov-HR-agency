import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

/**
 * Привязка ВКонтакте через сообщество: человек сам пишет код сообществу.
 *
 * Почему так, а не вставкой ссылки на страницу. Прежняя форма принимала
 * любую ссылку и сохраняла id страницы без проверки: чужой id — и
 * уведомления о кандидатах уходили бы незнакомому человеку. Здесь id
 * берём из самого сообщения: ВК сообщает, от какой страницы оно пришло,
 * и только тот, кто написал код, получает привязку.
 *
 * Как устроено.
 *   1. В настройках выдаётся шестизначный код, живёт 15 минут.
 *   2. Человек пишет его сообществу в ВК.
 *   3. ВК присылает событие в /api/webhooks/vk (Callback API) — там
 *      проверяется секрет и вызывается consumeVkLinkCode().
 *   4. Код в базе — только подпись, сам код не храним.
 *
 * Перебор. Шесть цифр — миллион вариантов. Поэтому: код уникален среди
 * действующих, а неудачные вводы с одной страницы ВК ограничены
 * (VK_LINK_FAILURE_LIMIT за час), см. consumeVkLinkCode().
 */

/** Сколько живёт код: хватает, чтобы открыть ВК и написать. */
export const VK_LINK_TTL_MS = 15 * 60 * 1000;

/** Неудачных вводов с одной страницы ВК за час — дальше молчим. */
export const VK_LINK_FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;

/** Шесть цифр — то, что человек может написать без опечаток. */
const CODE_PATTERN = /^\d{6}$/;

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не задан — код привязки подписать нечем");
  return secret;
}

/** Подпись кода. Тот же секрет, что у прочих одноразовых кодов, но своя метка. */
export function vkLinkCodeHash(code: string): string {
  return createHmac("sha256", signingSecret())
    .update(`vk-link:${code}`)
    .digest("hex");
}

/**
 * Что пришло в сообщении: код или нет. Пробелы и «FHR-»-подобный мусор
 * не нужны — человек пишет цифры, и мы принимаем только их.
 */
export function parseLinkCode(text: string): string | null {
  const trimmed = text.trim();
  return CODE_PATTERN.test(trimmed) ? trimmed : null;
}

/** Выдать код привязки. Прежние неиспользованные коды этого человека гаснут. */
export async function issueVkLinkCode(
  userId: string,
  now: Date = new Date(),
): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + VK_LINK_TTL_MS);

  // Уникальность среди действующих: два человека с одним кодом — ошибка
  // привязки. На миллион вариантов коллизия редка, но проверка дешёвая.
  let code = "";
  let codeHash = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    codeHash = vkLinkCodeHash(code);
    const busy = await prisma.vkLinkCode.findFirst({
      where: { codeHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (!busy) break;
  }

  await prisma.$transaction([
    prisma.vkLinkCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.vkLinkCode.create({
      data: { userId, codeHash, expiresAt },
    }),
  ]);

  return { code, expiresAt };
}

/**
 * Человек пришёл поздороваться или нажал кнопку «Начать» в чате с сообществом.
 *
 * Кнопка «Начать» шлёт сообщение с текстом «Начать» и служебным payload
 * {"command":"start"}; пишут и руками — «начать», «привет», «помощь».
 * Сравниваем без регистра и знаков препинания: «Привет!» и «привет» — одно.
 */
const START_WORDS = new Set([
  "начать",
  "старт",
  "start",
  "/start",
  "привет",
  "здравствуйте",
  "здравствуй",
  "добрый день",
  "добрый вечер",
  "доброе утро",
  "помощь",
  "help",
  "меню",
]);

export function isStartMessage(text: string, payload?: string): boolean {
  if (payload) {
    try {
      const parsed = JSON.parse(payload) as { command?: unknown };
      if (parsed.command === "start") return true;
    } catch {
      // не наш payload — смотрим на текст
    }
  }
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/ ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return START_WORDS.has(normalized);
}

export type VkLinkOutcome =
  /** fullName — для ответа «аккаунт такой-то привязан»: человек видит, к чему именно. */
  | { status: "linked"; userId: string; fullName: string }
  /** «Начать», «привет», кнопка «Начать» в чате: человек пришёл и ждёт, что делать. */
  | { status: "greeting" }
  /** Написали не шесть цифр и не приветствие: вопрос, всё что угодно. Не ошибка человека. */
  | { status: "not-a-code" }
  | { status: "bad-code" }
  | { status: "expired" }
  | { status: "taken" }
  | { status: "too-many-attempts" };

/**
 * Принять код из сообщения ВК от страницы `vkUserId`.
 *
 * Не бросает на неверном вводе — возвращает исход, по которому webhook
 * ответит человеку по-человечески.
 */
export async function consumeVkLinkCode(
  vkUserId: string,
  text: string,
  now: Date = new Date(),
  options: { payload?: string } = {},
): Promise<VkLinkOutcome> {
  // Не шесть цифр — человек просто пишет сообществу. Это не попытка угадать
  // код: в лимит неудач не идёт, иначе «привет» пять раз подряд закрывало
  // привязку на час. Приветствию объясним, что делать, остальным — коротко напомним
  const code = parseLinkCode(text);
  if (!code) {
    return { status: isStartMessage(text, options.payload) ? "greeting" : "not-a-code" };
  }

  const since = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const key = `vk-link:${vkUserId}`;
  const failures = await prisma.authFailure.count({
    where: { key, at: { gt: since } },
  });
  if (failures >= VK_LINK_FAILURE_LIMIT) return { status: "too-many-attempts" };

  const row = code
    ? await prisma.vkLinkCode.findFirst({
        where: { codeHash: vkLinkCodeHash(code), usedAt: null },
        orderBy: { createdAt: "desc" },
      })
    : null;

  if (!row) {
    await prisma.authFailure.create({ data: { key } });
    return { status: "bad-code" };
  }
  if (row.expiresAt <= now) {
    await prisma.authFailure.create({ data: { key } });
    return { status: "expired" };
  }

  // Страница ВК — одному кабинету. Чужую не перехватываем молча.
  const owner = await prisma.user.findFirst({
    where: { vkUserId, NOT: { id: row.userId } },
    select: { id: true },
  });
  if (owner) return { status: "taken" };

  // Гасим код условно: два одновременных сообщения с одним кодом не
  // должны привязать дважды.
  const claimed = await prisma.vkLinkCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return { status: "bad-code" };

  const linkedUser = await prisma.user.update({
    where: { id: row.userId },
    data: { vkUserId },
    select: { fullName: true },
  });
  return { status: "linked", userId: row.userId, fullName: linkedUser.fullName };
}

/**
 * Снять привязку по желанию человека. Код на это не нужен — он вошедший.
 *
 * Выданные, но ещё не использованные коды гасятся вместе с привязкой:
 * иначе код, выданный до отвязки, привязал бы страницу обратно сам,
 * когда человек уже передумал.
 */
export async function unlinkVk(userId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { vkUserId: null } }),
    prisma.vkLinkCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);
}

export type VkLinkStatus = {
  /** waiting — код ещё ждёт сообщения; linked — прошёл; expired — истёк, погашен или чужой. */
  status: "waiting" | "linked" | "expired";
  vkUserId: string | null;
};

/**
 * Что стало с кодом, который человек сейчас видит на экране. По этому
 * опросу кабинет сам понимает, что сообщение дошло, и не просит
 * «проверить привязку» руками.
 *
 * Код смотрим только среди кодов этого человека: чужой код не даёт
 * ни подтверждения, ни отказа — для постороннего он просто «истёк».
 */
export async function vkLinkStatus(
  userId: string,
  code: string,
  now: Date = new Date(),
): Promise<VkLinkStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vkUserId: true },
  });
  const vkUserId = user?.vkUserId ?? null;

  const parsed = parseLinkCode(code);
  if (!parsed) return { status: "expired", vkUserId };

  const row = await prisma.vkLinkCode.findFirst({
    where: { userId, codeHash: vkLinkCodeHash(parsed) },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { status: "expired", vkUserId };

  // Погашен и страница стоит — привязка прошла. Погашен, а страницы нет —
  // его погасила отвязка или новый код, а не сообщение
  if (row.usedAt) return { status: vkUserId ? "linked" : "expired", vkUserId };
  if (row.expiresAt <= now) return { status: "expired", vkUserId };
  return { status: "waiting", vkUserId };
}

/** Сравнение без утечки времени — для секрета из заголовка/тела webhook. */
export function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Название платформы в ответах бота — как называется сообщество и кабинет. */
const PLATFORM = "Fattakhov HR";

/**
 * Приветствие на «Начать»: что это за бот и что делать. Человек, который
 * пришёл в чат с сообществом, не обязан знать, что код берут в кабинете, —
 * а без этого он пишет «привет» в пустоту и не понимает, чего ждать.
 */
export const VK_GREETING =
  `Здравствуйте! Это бот ${PLATFORM}: он присылает сюда уведомления из кабинета — ` +
  "решения по кандидатам, новые комментарии, напоминания о встречах.\n\n" +
  "Чтобы подключить уведомления:\n" +
  "1. Откройте кабинет и зайдите в Настройки, блок «ВКонтакте».\n" +
  "2. Нажмите «Получить код привязки» — появятся шесть цифр.\n" +
  "3. Пришлите эти цифры сюда одним сообщением.\n\n" +
  "Когда аккаунт будет привязан, я напишу «Готово». Код действует 15 минут: " +
  "если не успели, получите новый в кабинете.";

/** Ответы на исходы без подстановок. «Привязано» — отдельно, с именем аккаунта. */
export const VK_LINK_REPLY: Record<Exclude<VkLinkOutcome["status"], "linked">, string> = {
  greeting: VK_GREETING,
  "not-a-code":
    "Не удалось разобрать сообщение. Чтобы привязать уведомления, пришлите шесть цифр кода " +
    "из кабинета (Настройки, блок «ВКонтакте», «Получить код привязки»). " +
    "Напишите «Начать», если нужна подсказка.",
  "bad-code": "Не нашли такой код. Проверьте шесть цифр или получите новый в настройках кабинета.",
  expired: "Код истёк. Получите новый в настройках кабинета и напишите его сюда снова.",
  taken:
    "Эта страница ВКонтакте уже привязана к другому кабинету. Откройте настройки того кабинета, " +
    "нажмите «Отвязать» в блоке ВКонтакте и получите новый код.",
  "too-many-attempts": "Слишком много неверных кодов с этой страницы. Попробуйте через час.",
};

/** Текст ответа человеку на исход — один на весь продукт. */
export function vkLinkReply(outcome: VkLinkOutcome): string {
  if (outcome.status === "linked") {
    return (
      `Готово! Аккаунт «${outcome.fullName}» в кабинете ${PLATFORM} привязан к этой странице ВКонтакте. ` +
      "Теперь сюда будут приходить срочные уведомления.\n\n" +
      "Отключить можно в кабинете: Настройки, блок «ВКонтакте», «Отвязать»."
    );
  }
  return VK_LINK_REPLY[outcome.status];
}
