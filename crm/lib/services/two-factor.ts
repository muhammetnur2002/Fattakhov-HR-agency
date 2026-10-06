import { randomInt } from "node:crypto";

import { AGENCY_ROLES, assertCanDo, type Actor } from "@/lib/access";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { maskPhone } from "@/lib/auth/phone";
import { generateSecret, matchTotpStep, otpauthUrl, verifyTotp } from "@/lib/auth/totp";
import {
  needsSealing,
  openTotpSecret,
  sealTotpSecret,
  TotpKeyMissingError,
} from "@/lib/auth/totp-secret";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import {
  clearAllTwoFactorAttempts,
  clearTwoFactorConfirmAttempts,
  clearTwoFactorProofAttempts,
  reserveSecondFactorAttempt,
  reserveTwoFactorConfirmAttempt,
  reserveTwoFactorProofAttempt,
} from "@/lib/security/login-throttle";
import { recordAuthEvent } from "@/lib/services/auth-events";
import { checkPhoneCode, consumePhoneCode, PhoneCodeError } from "@/lib/services/phone-auth";

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

/**
 * Чем человек подтверждает, что это он, при включении 2FA:
 * password — текущим паролем; sms — кодом на проверенный телефон
 * (у вошедших по SMS пароля нет); none — нечем, сначала пароль.
 */
export type SetupProof = "password" | "sms" | "none";

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: Date | null;
  /** Сколько кодов восстановления ещё не использовано. */
  recoveryCodesLeft: number;
  /** Обязательна ли 2FA этому человеку: сотрудникам агентства — да, отключить нельзя. */
  required: boolean;
  proof: SetupProof;
  /** Маска проверенного телефона, если подтверждать придётся кодом из SMS. */
  maskedPhone: string | null;
};

/** Роль агентства: у неё 2FA обязательна. */
export function isAgencyRole(role: UserRole): boolean {
  return (AGENCY_ROLES as readonly UserRole[]).includes(role);
}

/**
 * Ворота обязательной настройки: нужна ли человеку настройка 2FA прежде,
 * чем пускать его в рабочее место. Только по роли и по тому, включена ли
 * 2FA, — и больше ни от чего: ни от окружения, ни от переменной. Обхода
 * нет намеренно: тестовые учётки (seed) проходят ворота тем, что у них
 * 2FA включена с известным тестовым секретом, а не исключением из правила.
 */
export function twoFactorGate(user: {
  role: UserRole;
  totpEnabledAt: Date | null;
}): "ok" | "setup" {
  return isAgencyRole(user.role) && !user.totpEnabledAt ? "setup" : "ok";
}

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [user, left] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId },
      select: { totpEnabledAt: true, role: true, passwordHash: true, phoneVerified: true },
    }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);

  return {
    enabled: user?.totpEnabledAt !== null && user?.totpEnabledAt !== undefined,
    enabledAt: user?.totpEnabledAt ?? null,
    recoveryCodesLeft: left,
    required: user ? isAgencyRole(user.role) : false,
    proof: user?.passwordHash ? "password" : user?.phoneVerified ? "sms" : "none",
    maskedPhone: !user?.passwordHash && user?.phoneVerified ? maskPhone(user.phoneVerified) : null,
  };
}

export type TwoFactorSetup = { secret: string; otpauthUrl: string };

/**
 * Начало подключения: выдаём секрет, но второй фактор ещё не требуем.
 *
 * Секрет сохраняется сразу, а totpEnabledAt остаётся пустым. Так человек,
 * закрывший вкладку на середине, ничего себе не сломал: войти по-прежнему
 * можно паролем, а подключение он начнёт заново.
 *
 * Включение требует подтверждения личности: текущий пароль, а у тех, у кого
 * пароля нет (вход по SMS), — код из SMS на проверенный телефон. Без этого
 * украденная сессия (забытая вкладка, перехваченная кука) включала бы
 * 2FA на телефоне вора и запирала владельца снаружи. Попытки подтверждения
 * считаются и ограничены (см. reserveTwoFactorProofAttempt): через это окно
 * пароль не подбирается.
 */
export async function startTwoFactorSetup(params: {
  userId: string;
  issuer: string;
  /** Текущий пароль. */
  password?: string;
  /** Код из SMS — для тех, у кого пароля нет. */
  smsCode?: string;
}): Promise<TwoFactorSetup> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { email: true, totpEnabledAt: true, passwordHash: true, phoneVerified: true },
  });
  if (!user) throw new TwoFactorError("Пользователь не найден");
  if (user.totpEnabledAt) {
    throw new TwoFactorError("Двухфакторная аутентификация уже включена");
  }

  let smsCodeId: string | null = null;
  if (user.passwordHash) {
    if (!params.password) throw new TwoFactorError("Введите текущий пароль");
    if (!(await reserveTwoFactorProofAttempt(params.userId))) {
      throw new TwoFactorError("Слишком много неверных паролей. Подождите 15 минут");
    }
    if (!(await verifyPassword(user.passwordHash, params.password))) {
      throw new TwoFactorError("Пароль неверен");
    }
    // Верный пароль попыткой не считается: счётчик нужен против подбора,
    // а не против того, кто ввёл пароль правильно
    await clearTwoFactorProofAttempts(params.userId);
  } else if (user.phoneVerified) {
    if (!params.smsCode?.trim()) {
      throw new TwoFactorError("Подтвердите кодом из SMS: у вашей учётной записи нет пароля");
    }
    try {
      smsCodeId = (await checkPhoneCode(user.phoneVerified, params.smsCode)).codeId;
    } catch (error) {
      if (error instanceof PhoneCodeError) throw new TwoFactorError(error.message);
      throw error;
    }
  } else {
    throw new TwoFactorError(
      "Сначала задайте пароль: на странице входа нажмите «Забыли пароль» — ссылка придёт на вашу почту",
    );
  }

  const secret = generateSecret();

  let sealed: string;
  try {
    sealed = sealTotpSecret(secret);
  } catch (error) {
    // В проде без ключа шифрования секрет открытым текстом не сохраняем
    if (error instanceof TotpKeyMissingError) {
      throw new TwoFactorError(
        "Двухфакторная аутентификация временно недоступна: на сервере не задан ключ шифрования. Сообщите администратору",
      );
    }
    throw error;
  }

  // Код из SMS одноразовый: гасим после того, как всё проверено
  if (smsCodeId && !(await consumePhoneCode(smsCodeId))) {
    throw new TwoFactorError("Код уже использован — запросите новый");
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { totpSecret: sealed },
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

  // Шесть цифр перебираются и здесь: попытка занимается до проверки,
  // как у кода при входе (см. checkSecondFactor). Счётчик свой, не общий
  // с подтверждением пароля при старте
  if (!(await reserveTwoFactorConfirmAttempt(params.userId))) {
    throw new TwoFactorError("Слишком много неверных кодов. Подождите 15 минут и начните заново");
  }

  const plainSecret = openTotpSecret(user.totpSecret);
  if (!plainSecret || !verifyTotp(plainSecret, params.code)) {
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

  await clearTwoFactorConfirmAttempts(params.userId);
  await recordAuthEvent({
    kind: "TWO_FACTOR_ENABLED",
    userId: params.userId,
    details: { method: "totp" },
  });

  return codes;
}

/**
 * Отключение — только клиентам. Пароль обязателен: иначе доступ к открытой
 * вкладке позволяет снять второй фактор, ради которого его и включали.
 */
export async function disableTwoFactor(params: {
  userId: string;
  password: string;
}): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { passwordHash: true, totpEnabledAt: true, role: true },
  });
  if (!user?.totpEnabledAt) {
    throw new TwoFactorError("Двухфакторная аутентификация и так выключена");
  }
  // У сотрудников агентства 2FA обязательна: отключить её нельзя вообще,
  // иначе обязательность держалась бы на честном слове владельца сессии
  if (isAgencyRole(user.role)) {
    throw new TwoFactorError(
      "Для сотрудников агентства двухфакторная аутентификация обязательна и не отключается",
    );
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

  const plainSecret = openTotpSecret(user.totpSecret);
  const step = plainSecret ? matchTotpStep(plainSecret, clean) : null;
  if (step !== null) {
    // Старый секрет открытым текстом — при первом успешном входе пересохраняем зашифрованным
    if (plainSecret && needsSealing(user.totpSecret)) {
      await prisma.user.update({ where: { id: params.userId }, data: { totpSecret: sealTotpSecret(plainSecret) } });
    }
    // Шаг принимаем один раз: условие в самом UPDATE, чтобы два одновременных входа
    // с одним кодом не прошли оба
    const taken = await prisma.user.updateMany({
      where: { id: params.userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return taken.count === 1;
  }

  // Не подошло как код из приложения — пробуем как код восстановления
  const candidates = await prisma.recoveryCode.findMany({
    where: { userId: params.userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  const normalized = clean.toUpperCase();
  for (const candidate of candidates) {
    if (await verifyPassword(candidate.codeHash, normalized)) {
      // Погашаем условием в самом UPDATE: два одновременных входа с одним
      // кодом восстановления не должны пройти оба
      const used = await prisma.recoveryCode.updateMany({
        where: { id: candidate.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return used.count === 1;
    }
  }

  return false;
}

/**
 * Сброс 2FA сотруднику агентства — для потерявшего и телефон, и коды.
 *
 * Только владелец (staff.resetTwoFactor) и только чужой учётке: себе сбросить
 * нельзя — тот, у кого украли сессию, сбросил бы фактор сам. Единственный
 * владелец, потерявший доступ, сбрасывает вручную в базе (инструкция в
 * AGENTS.md и README.md). Сброс стирает секрет, коды восстановления и
 * счётчики попыток, а passwordChangedAt гасит все выпущенные сессии
 * сотрудника; при следующем входе его встречают те же ворота, что и всех,
 * и он настраивает 2FA заново. Событие пишется в журнал входов.
 */
export async function resetStaffTwoFactor(actor: Actor, targetUserId: string): Promise<void> {
  assertCanDo(actor, "staff.resetTwoFactor");

  if (targetUserId === actor.id) {
    throw new TwoFactorError(
      "Себе сбросить нельзя: попросите другого владельца или сделайте это вручную по инструкции из README",
    );
  }

  const target = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      organizationId: actor.organizationId,
      role: { in: [...AGENCY_ROLES] },
    },
    select: { id: true, email: true },
  });
  if (!target) throw new TwoFactorError("Сотрудник не найден");

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: target.id } }),
    prisma.user.update({
      where: { id: target.id },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        // Гасит все выпущенные ранее сессии сотрудника
        passwordChangedAt: new Date(),
      },
    }),
  ]);
  await clearAllTwoFactorAttempts(target.id);

  await recordAuthEvent({
    kind: "TWO_FACTOR_RESET",
    userId: target.id,
    organizationId: actor.organizationId,
    email: target.email,
    details: { by: actor.id },
  });
}

export type SecondFactorResult = "ok" | "wrong" | "blocked";

/**
 * Проверка кода при входе с учётом числа попыток.
 *
 * Попытка занимается ДО проверки кода (reserveSecondFactorAttempt):
 * счётчик «прочитать, проверить, записать» под одновременными запросами
 * пропускал их все. blocked — попыток не осталось, код не проверялся;
 * wrong — код не подошёл, попытка потрачена; ok — вход разрешён.
 * После успеха вызывающий сбрасывает счётчик (clearLoginFailures).
 */
export async function checkSecondFactor(
  userId: string,
  code: string,
): Promise<SecondFactorResult> {
  if (!(await reserveSecondFactorAttempt(userId))) return "blocked";
  return (await verifySecondFactor({ userId, code })) ? "ok" : "wrong";
}

/** Нужен ли этому человеку второй фактор. Спрашивается формой входа. */
export async function requiresSecondFactor(userId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { totpEnabledAt: true },
  });
  return Boolean(user?.totpEnabledAt);
}
