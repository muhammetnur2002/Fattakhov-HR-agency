import { headers } from "next/headers";

import { prismaRaw as db } from "@/lib/db/prisma";
import { clientIp } from "@/lib/security/rate-limit";

/**
 * Блокировка перебора при входе.
 *
 * Auth.js принимает POST /api/auth/callback/credentials напрямую, минуя server action формы,
 * поэтому лимит стоит здесь, в самой проверке учётных данных. Счётчик — в базе: на Vercel
 * память процесса у каждого инстанса своя.
 */

const WINDOW_MS = 15 * 60_000;
/** Неудачных попыток пароля на один аккаунт за окно. */
const ACCOUNT_LIMIT = 10;
/** Неудачных попыток с одного адреса за окно (по всем аккаунтам). */
const IP_LIMIT = 30;
/** Неверных кодов 2FA на один аккаунт за окно. */
const SECOND_FACTOR_LIMIT = 5;

const accountKey = (email: string) => `login:acct:${email.toLowerCase().trim()}`;
const ipKey = (ip: string) => `login:ip:${ip}`;
const secondFactorKey = (userId: string) => `login:2fa:${userId}`;

async function currentIp(): Promise<string> {
  try {
    return clientIp(await headers());
  } catch {
    // Вне запроса (тесты, скрипты) адреса нет — считаем только по аккаунту
    return "unknown";
  }
}

async function failuresSince(key: string): Promise<number> {
  return db.authFailure.count({ where: { key, at: { gt: new Date(Date.now() - WINDOW_MS) } } });
}

/** true — вход временно закрыт: слишком много неудачных попыток по аккаунту или с адреса. */
export async function isLoginBlocked(email: string): Promise<boolean> {
  const ip = await currentIp();
  const [byAccount, byIp] = await Promise.all([
    failuresSince(accountKey(email)),
    ip === "unknown" ? Promise.resolve(0) : failuresSince(ipKey(ip)),
  ]);
  return byAccount >= ACCOUNT_LIMIT || byIp >= IP_LIMIT;
}

export async function recordLoginFailure(email: string): Promise<void> {
  const ip = await currentIp();
  const keys = [accountKey(email), ...(ip === "unknown" ? [] : [ipKey(ip)])];
  await db.authFailure.createMany({ data: keys.map((key) => ({ key })) });
  // Старые записи не нужны ни для лимита, ни для разбора: чистим по ходу дела
  if (Math.random() < 0.05) {
    await db.authFailure.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
  }
}

export async function clearLoginFailures(email: string, userId: string): Promise<void> {
  await db.authFailure.deleteMany({ where: { key: { in: [accountKey(email), secondFactorKey(userId)] } } });
}

export async function isSecondFactorBlocked(userId: string): Promise<boolean> {
  return (await failuresSince(secondFactorKey(userId))) >= SECOND_FACTOR_LIMIT;
}

export async function recordSecondFactorFailure(userId: string): Promise<void> {
  await db.authFailure.create({ data: { key: secondFactorKey(userId) } });
}
