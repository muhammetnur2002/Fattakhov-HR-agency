import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Вход в CRM из студенческой платформы — обратное направление от
 * lib/students-sso.ts (тот выпускает билеты CRM → студенческая
 * платформа, этот принимает билеты студенческая платформа → CRM).
 *
 * Билет получает представитель компании, которую сотрудник CRM уже
 * объединил с профилем на студенческой платформе (см. страницу заявок
 * в «Клиентах»): дальше он входит в CRM тем же паролем, что и там,
 * второй пароль не заводится.
 */

const ISSUER = "fattakhov-students";
const AUDIENCE = "fattakhov-crm";
/** Билет выпускается на минуту; дольше пяти не принимаем ни при каких часах. */
const MAX_LIFETIME_SECONDS = 300;
/** Часы серверов расходятся — выпуск «из будущего» в пределах получаса не ошибка. */
const CLOCK_SKEW_SECONDS = 30;

export interface StudentsEntryTicket {
  crmClientId: string;
  email: string;
  jti: string;
  exp: number;
}

export type TicketCheck =
  | { ok: true; ticket: StudentsEntryTicket }
  | { ok: false; reason: "FORMAT" | "SIGNATURE" | "EXPIRED" | "CLAIMS" };

/** Секрет из окружения; null — вход из студенческой платформы выключен. */
export function crmEntrySecret(): string | null {
  const raw = process.env.CRM_ENTRY_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

export function verifyStudentsEntryTicket(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TicketCheck {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "FORMAT" };

  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const given = Buffer.from(parts[1], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "SIGNATURE" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "FORMAT" };
  }

  if (payload.v !== 1 || payload.iss !== ISSUER || payload.aud !== AUDIENCE) {
    return { ok: false, reason: "CLAIMS" };
  }
  const iat = Number(payload.iat);
  const exp = Number(payload.exp);
  if (
    !Number.isFinite(iat) ||
    !Number.isFinite(exp) ||
    exp - iat > MAX_LIFETIME_SECONDS ||
    iat > nowSeconds + CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, reason: "CLAIMS" };
  }
  if (exp <= nowSeconds) return { ok: false, reason: "EXPIRED" };

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (
    typeof payload.crmClientId !== "string" ||
    !payload.crmClientId ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof payload.jti !== "string" ||
    payload.jti.length < 16
  ) {
    return { ok: false, reason: "CLAIMS" };
  }

  return { ok: true, ticket: { crmClientId: payload.crmClientId, email, jti: payload.jti, exp } };
}

/**
 * Разовость билета — в памяти процесса, не в базе. Приложение живёт на
 * одной ВМ (см. AGENTS.md, «Боевая инфраструктура»), а билет живёт минуту:
 * для этого масштаба лишняя таблица ничего не добавляет, только риск
 * рассинхронизации со схемой. Понадобится второй инстанс — переносить сюда.
 */
const consumedTickets = new Map<string, number>();

export function consumeTicketOnce(jti: string, exp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, expiry] of consumedTickets) {
    if (expiry <= now) consumedTickets.delete(key);
  }
  if (consumedTickets.has(jti)) return false;
  consumedTickets.set(jti, exp);
  return true;
}
