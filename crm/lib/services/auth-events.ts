import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { assertCanDo, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import type { AuthEventKind } from "@/lib/generated/prisma/enums";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";

/**
 * Журнал входов в CRM.
 *
 * Пишется из auth.ts и из мест, где меняется доступ (сброс пароля,
 * включение 2FA). Запись не должна ни ронять вход, ни тормозить его:
 * сбой журнала — это строка в логе, а не отказ человеку, который ввёл
 * верный пароль. Поэтому recordAuthEvent никогда не бросает, а на пути
 * входа вызывается recordAuthEventSoon, который не ждёт базы.
 */

/** Сколько символов браузера сохраняем: хватает, чтобы узнать устройство, не хватает на отпечаток. */
const USER_AGENT_MAX = 255;

export type AuthEventInput = {
  kind: AuthEventKind;
  userId?: string | null;
  /** Организация пользователя. Не передана, а userId есть — берётся из базы. */
  organizationId?: string | null;
  /** Почта, как её ввели: в журнал уйдёт только отпечаток. */
  email?: string | null;
  /** Откуда пришёл запрос. Не передан — берётся из заголовков текущего запроса. */
  ip?: string | null;
  userAgent?: string | null;
  /** Способ и причина, без секретов: ни паролей, ни кодов, ни ссылок. */
  details?: Record<string, string | number | boolean | null>;
};

/**
 * Отпечаток почты: HMAC-SHA256 на AUTH_SECRET.
 *
 * Не просто sha256: адреса сотрудников угадываются списком, и по
 * простому хешу утёкший журнал раскрывал бы, кто пытался войти.
 * С ключом из AUTH_SECRET подобрать адрес по отпечатку нельзя, а сравнить
 * две попытки на один адрес — можно, ради этого он и нужен.
 * Регистр и пробелы не различаются, как и при входе.
 */
export function emailFingerprint(email: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`auth-event-email:${email.trim().toLowerCase()}`)
    .digest("hex");
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const head = await headers();
    const ip = clientIp(head);
    return { ip: ip === "unknown" ? null : ip, userAgent: head.get("user-agent") };
  } catch {
    // Вне запроса (тесты, скрипты) заголовков нет
    return { ip: null, userAgent: null };
  }
}

/** Записать событие. Никогда не бросает. */
export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    const meta =
      input.ip !== undefined || input.userAgent !== undefined ? null : await requestMeta();
    const ip = input.ip !== undefined ? input.ip : (meta?.ip ?? null);
    const userAgent = input.userAgent !== undefined ? input.userAgent : (meta?.userAgent ?? null);

    let organizationId = input.organizationId ?? null;
    if (!organizationId && input.userId) {
      organizationId =
        (await db.user.findUnique({ where: { id: input.userId }, select: { organizationId: true } }))
          ?.organizationId ?? null;
    }

    await db.authEvent.create({
      data: {
        kind: input.kind,
        userId: input.userId ?? null,
        organizationId,
        emailHash: input.email ? emailFingerprint(input.email) : null,
        ip,
        userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null,
        details: input.details ?? undefined,
      },
    });
  } catch (error) {
    console.error("[журнал входов] событие не записано", error);
  }
}

/**
 * То же, но не ждёт базы: для пути входа, где лишние миллисекунды
 * на запись журнала не нужны. Заголовки читаются сразу — в момент вызова,
 * пока запрос ещё жив, а сама запись идёт в фоне.
 */
export function recordAuthEventSoon(input: AuthEventInput): void {
  const pending =
    input.ip !== undefined || input.userAgent !== undefined
      ? Promise.resolve(null)
      : requestMeta();
  void pending
    .then((meta) =>
      recordAuthEvent({
        ...input,
        ip: input.ip !== undefined ? input.ip : (meta?.ip ?? null),
        userAgent: input.userAgent !== undefined ? input.userAgent : (meta?.userAgent ?? null),
      }),
    )
    .catch((error) => console.error("[журнал входов] событие не записано", error));
}

export const AUTH_EVENT_LABELS: Record<AuthEventKind, string> = {
  LOGIN_OK: "Вход",
  LOGIN_FAIL: "Неудачный вход",
  TWO_FACTOR_FAIL: "Неверный код 2FA",
  PASSWORD_RESET: "Сброс пароля",
  TWO_FACTOR_ENABLED: "Включена 2FA",
  TWO_FACTOR_RESET: "Сброшена 2FA",
};

/** События, о которых стоит задуматься: неудачи входа и неверные коды. */
export const FAILED_AUTH_KINDS: AuthEventKind[] = ["LOGIN_FAIL", "TWO_FACTOR_FAIL"];

export type AuthEventRow = {
  id: string;
  createdAt: Date;
  kind: AuthEventKind;
  ip: string | null;
  userAgent: string | null;
  details: unknown;
  user: { fullName: string; email: string } | null;
  /** Первые символы отпечатка — чтобы узнать «тот же неизвестный адрес», не раскрывая его. */
  emailHashShort: string | null;
};

/**
 * Последние события для владельца агентства.
 *
 * События известных пользователей — только своей организации (в записи
 * лежит organizationId, выборка идёт по индексу, а не по списку всех её
 * пользователей); события по неизвестным адресам (организации нет) видны
 * все: принадлежность им определить нечем, а это как раз то, что владельцу
 * и надо видеть — кто стучится в несуществующие учётки.
 */
export async function listAuthEvents(
  actor: Actor,
  options: { onlyFailed?: boolean; limit?: number } = {},
): Promise<AuthEventRow[]> {
  assertCanDo(actor, "auth.log");

  const events = await db.authEvent.findMany({
    where: {
      OR: [
        { organizationId: actor.organizationId },
        { organizationId: null, userId: null },
      ],
      ...(options.onlyFailed ? { kind: { in: FAILED_AUTH_KINDS } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 200,
  });

  // Имена — только тех, кто попал в выборку
  const ids = [...new Set(events.flatMap((e) => (e.userId ? [e.userId] : [])))];
  const users = await db.user.findMany({
    where: { id: { in: ids }, organizationId: actor.organizationId },
    select: { id: true, fullName: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return events.map((e) => {
    const user = e.userId ? byId.get(e.userId) : undefined;
    return {
      id: e.id,
      createdAt: e.createdAt,
      kind: e.kind,
      ip: e.ip,
      userAgent: e.userAgent,
      details: e.details,
      user: user ? { fullName: user.fullName, email: user.email } : null,
      emailHashShort: e.emailHash ? e.emailHash.slice(0, 8) : null,
    };
  });
}

/**
 * Не засорять журнал: события, которые при переборе сыплются сотнями,
 * пишутся не чаще лимита. Счётчик в памяти процесса — этого достаточно:
 * при перезапуске или втором процессе записей будет чуть больше, а не
 * меньше, и это не дыра, а лишняя строка. Возвращает true, если писать можно.
 *
 * Блокировка входа (reason «blocked») — раз в 5 минут на аккаунт и раз в
 * 5 минут на адрес; неудачи по неизвестным адресам — не чаще 10 в минуту
 * на адрес. Сам отказ входу это не меняет, только запись о нём.
 */
export function shouldLogNoisyFailure(
  kind: "blocked" | "unknown_address",
  keys: { emailFingerprint?: string | null; ip?: string | null },
): boolean {
  const ip = keys.ip ?? "unknown";
  if (kind === "unknown_address") {
    return checkRateLimit(`authlog:unknown:${ip}`, 10, 60).allowed;
  }
  // Оба ключа проверяются всегда: проверка с ранним выходом не списала бы
  // попытку у второго, и тот пропустил бы лишнюю запись
  const byAccount = keys.emailFingerprint
    ? checkRateLimit(`authlog:blocked:acct:${keys.emailFingerprint}`, 1, 300).allowed
    : true;
  const byIp = checkRateLimit(`authlog:blocked:ip:${ip}`, 1, 300).allowed;
  return byAccount && byIp;
}

/**
 * Браузер и система — коротко, для таблицы: «Chrome 126, Windows».
 * Разбор грубый, по самым частым признакам: журналу нужно узнать
 * устройство, а не распознать его точно.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "—";

  const pick = (re: RegExp) => userAgent.match(re)?.[1]?.split(".")[0];

  let browser = "Другой браузер";
  const edge = pick(/Edg(?:e|A|iOS)?\/(\d+[\d.]*)/);
  const opera = pick(/OPR\/(\d+[\d.]*)/);
  const yandex = pick(/YaBrowser\/(\d+[\d.]*)/);
  const firefox = pick(/(?:Firefox|FxiOS)\/(\d+[\d.]*)/);
  const chrome = pick(/(?:Chrome|CriOS)\/(\d+[\d.]*)/);
  const safari = pick(/Version\/(\d+[\d.]*).*Safari/);

  if (edge) browser = `Edge ${edge}`;
  else if (opera) browser = `Opera ${opera}`;
  else if (yandex) browser = `Яндекс Браузер ${yandex}`;
  else if (firefox) browser = `Firefox ${firefox}`;
  else if (chrome) browser = `Chrome ${chrome}`;
  else if (safari) browser = `Safari ${safari}`;
  else if (/curl|python|node|axios|okhttp|Go-http/i.test(userAgent)) browser = "Скрипт";

  let system = "";
  if (/Windows/i.test(userAgent)) system = "Windows";
  else if (/Android/i.test(userAgent)) system = "Android";
  else if (/iPhone|iPad|iPod/i.test(userAgent)) system = "iOS";
  else if (/Mac OS X|Macintosh/i.test(userAgent)) system = "macOS";
  else if (/Linux|X11/i.test(userAgent)) system = "Linux";

  return system ? `${browser}, ${system}` : browser;
}
