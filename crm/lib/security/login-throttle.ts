import { headers } from "next/headers";

import { prismaRaw as db } from "@/lib/db/prisma";
import { clearAttempts, reserveAttempt } from "@/lib/security/db-limit";
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
  await clearAttempts([accountKey(email), secondFactorKey(userId)]);
}

/**
 * Занять попытку кода 2FA — до проверки кода, а не после неё.
 *
 * Прежний порядок «посмотреть счётчик, проверить, записать неудачу» под
 * одновременными запросами не держал: все они видели чистый счётчик и все
 * проверяли шесть цифр. Теперь запись попытки и проверка лимита —
 * одна операция под замком (db-limit.ts), и кода проверяется не больше,
 * чем попыток разрешено. Успешный вход стирает записи (clearLoginFailures).
 *
 * false — попыток не осталось: код проверять нельзя вовсе.
 */
export async function reserveSecondFactorAttempt(userId: string): Promise<boolean> {
  const result = await reserveAttempt(secondFactorKey(userId), {
    limit: SECOND_FACTOR_LIMIT,
    windowMs: WINDOW_MS,
  });
  return result.allowed;
}

/**
 * Попытки подтвердить личность при включении 2FA (пароль или код из SMS).
 *
 * Свой счётчик, не общий с вводом кода из приложения: сотруднику со сбитым
 * временем на телефоне нужно несколько попыток ввести код, и они не должны
 * отнимать у него возможность начать заново. Успешное подтверждение личности
 * счётчик стирает (clearTwoFactorProofAttempts) — успех попыткой не считается.
 */
export async function reserveTwoFactorProofAttempt(userId: string): Promise<boolean> {
  const result = await reserveAttempt(`login:2fa-setup-proof:${userId}`, {
    limit: SECOND_FACTOR_LIMIT,
    windowMs: WINDOW_MS,
  });
  return result.allowed;
}

export async function clearTwoFactorProofAttempts(userId: string): Promise<void> {
  await clearAttempts([`login:2fa-setup-proof:${userId}`]);
}

/** Неверных кодов из приложения при включении: запас на сбитые часы, но не бесконечный. */
const SETUP_CONFIRM_LIMIT = 10;

/**
 * Попытки ввести код из приложения при включении 2FA. Шесть цифр
 * перебираются и здесь, поэтому предел есть; он выше, чем у входа: человек
 * только что настраивает приложение и ошибается чаще. Подобрать код может
 * лишь тот, кто уже в сессии, а чтобы взять секрет в работу, ему нужен
 * пароль (см. startTwoFactorSetup).
 */
export async function reserveTwoFactorConfirmAttempt(userId: string): Promise<boolean> {
  const result = await reserveAttempt(`login:2fa-setup-confirm:${userId}`, {
    limit: SETUP_CONFIRM_LIMIT,
    windowMs: WINDOW_MS,
  });
  return result.allowed;
}

export async function clearTwoFactorConfirmAttempts(userId: string): Promise<void> {
  await clearAttempts([`login:2fa-setup-confirm:${userId}`]);
}

/** Забыть все счётчики 2FA человека — после сброса 2FA владельцем. */
export async function clearAllTwoFactorAttempts(userId: string): Promise<void> {
  await clearAttempts([
    secondFactorKey(userId),
    `login:2fa-setup-proof:${userId}`,
    `login:2fa-setup-confirm:${userId}`,
  ]);
}
