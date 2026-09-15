import { randomInt } from "node:crypto";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";
import { prisma } from "@/lib/db/prisma";

export class TwoFactorError extends Error {}

/** Сколько кодов выдаём за раз. Десять — обычная практика. */
const RECOVERY_CODE_COUNT = 10;

/**
 * Алфавит кодов восстановления.
 *
 * Без 0, O, 1, I и L: код переписывают с экрана на бумагу, а потом
 * набирают руками, и эти символы путают именно в таком сценарии.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRecoveryCode(): string {
  const part = (length: number) =>
    Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  // Две группы по пять: так его реально переписать без ошибок
  return `${part(5)}-${part(5)}`;
}

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: Date | null;
  /** Сколько кодов восстановления ещё не использовано. */
  recoveryCodesLeft: number;
};

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [user, left] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId },
      select: { totpEnabledAt: true },
    }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);

  return {
    enabled: user?.totpEnabledAt !== null && user?.totpEnabledAt !== undefined,
    enabledAt: user?.totpEnabledAt ?? null,
    recoveryCodesLeft: left,
  };
}

export type TwoFactorSetup = { secret: string; otpauthUrl: string };

/**
 * Начало подключения: выдаём секрет, но второй фактор ещё не требуем.
 *
 * Секрет сохраняется сразу, а totpEnabledAt остаётся пустым. Так человек,
 * закрывший вкладку на середине, ничего себе не сломал: войти по-прежнему
 * можно паролем, а подключение он начнёт заново.
 */
export async function startTwoFactorSetup(params: {
  userId: string;
  issuer: string;
}): Promise<TwoFactorSetup> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { email: true, totpEnabledAt: true },
  });
  if (!user) throw new TwoFactorError("Пользователь не найден");
  if (user.totpEnabledAt) {
    throw new TwoFactorError("Двухфакторная аутентификация уже включена");
  }

  const secret = generateSecret();

  await prisma.user.update({
    where: { id: params.userId },
    data: { totpSecret: secret },
  });

  return {
    secret,
    otpauthUrl: otpauthUrl({
      secret,
      account: user.email,
      issuer: params.issuer,
    }),
  };
}

/**
 * Подтверждение подключения кодом из приложения.
 *
 * Возвращает коды восстановления. Показать их можно только здесь и
 * только один раз: в базе лежат хеши, восстановить исходные значения
 * нельзя, и это намеренно.
 */
export async function confirmTwoFactor(params: {
  userId: string;
  code: string;
}): Promise<string[]> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret) {
    throw new TwoFactorError("Подключение не начато, откройте настройки заново");
  }
  if (user.totpEnabledAt) {
    throw new TwoFactorError("Двухфакторная аутентификация уже включена");
  }

  if (!verifyTotp(user.totpSecret, params.code)) {
    throw new TwoFactorError(
      "Код не подошёл. Проверьте, что время на телефоне выставлено автоматически",
    );
  }

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const hashes = await Promise.all(codes.map((code) => hashPassword(code)));

  await prisma.$transaction([
    // Прежние коды гасим: перевыпуск должен обесценивать старый список
    prisma.recoveryCode.deleteMany({ where: { userId: params.userId } }),
    prisma.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId: params.userId, codeHash })),
    }),
    prisma.user.update({
      where: { id: params.userId },
      data: { totpEnabledAt: new Date() },
    }),
  ]);

  return codes;
}

/**
 * Отключение. Пароль обязателен: иначе доступ к открытой вкладке
 * позволяет снять второй фактор, ради которого его и включали.
 */
export async function disableTwoFactor(params: {
  userId: string;
  password: string;
}): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { passwordHash: true, totpEnabledAt: true },
  });
  if (!user?.totpEnabledAt) {
    throw new TwoFactorError("Двухфакторная аутентификация и так выключена");
  }
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, params.password))) {
    throw new TwoFactorError("Пароль неверен");
  }

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: params.userId } }),
    prisma.user.update({
      where: { id: params.userId },
      data: { totpSecret: null, totpEnabledAt: null },
    }),
  ]);
}

/** Перевыпуск кодов восстановления. Тоже под паролем и тоже показывается один раз. */
export async function regenerateRecoveryCodes(params: {
  userId: string;
  password: string;
}): Promise<string[]> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { passwordHash: true, totpEnabledAt: true },
  });
  if (!user?.totpEnabledAt) {
    throw new TwoFactorError("Двухфакторная аутентификация не включена");
  }
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, params.password))) {
    throw new TwoFactorError("Пароль неверен");
  }

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const hashes = await Promise.all(codes.map((code) => hashPassword(code)));

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: params.userId } }),
    prisma.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId: params.userId, codeHash })),
    }),
  ]);

  return codes;
}

/**
 * Проверка второго фактора при входе.
 *
 * Принимает и код из приложения, и код восстановления: человек у формы
 * входа не должен выбирать, что именно он вводит. Использованный код
 * восстановления гасится сразу.
 */
export async function verifySecondFactor(params: {
  userId: string;
  code: string;
}): Promise<boolean> {
  const clean = params.code.trim();
  if (!clean) return false;

  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpEnabledAt || !user.totpSecret) return false;

  if (verifyTotp(user.totpSecret, clean)) return true;

  // Не подошло как код из приложения — пробуем как код восстановления
  const candidates = await prisma.recoveryCode.findMany({
    where: { userId: params.userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  const normalized = clean.toUpperCase();
  for (const candidate of candidates) {
    if (await verifyPassword(candidate.codeHash, normalized)) {
      await prisma.recoveryCode.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }

  return false;
}

/** Нужен ли этому человеку второй фактор. Спрашивается формой входа. */
export async function requiresSecondFactor(userId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { totpEnabledAt: true },
  });
  return Boolean(user?.totpEnabledAt);
}
