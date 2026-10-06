import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "@/lib/security/login-throttle";
import {
  emailFingerprint,
  recordAuthEventSoon,
  requestMeta,
  shouldLogNoisyFailure,
} from "@/lib/services/auth-events";
import { checkSecondFactor, requiresSecondFactor } from "@/lib/services/two-factor";

/**
 * Вход по почте, паролю и (если включена) коду второго фактора.
 *
 * Вынесено из auth.ts, чтобы проверяться без Auth.js: там остаётся только
 * перевод наших отказов в коды ошибок, которые понимает форма.
 */

/** Чем кончился отказ. auth.ts превращает код в ошибку Auth.js. */
export type LoginFailureCode = "invalid" | "second_factor_required" | "second_factor_invalid";

export class LoginError extends Error {
  constructor(readonly code: LoginFailureCode) {
    super(code);
  }
}

/** Хэш для сверки, когда пользователя нет: время ответа не должно выдавать, какие адреса заведены. */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$3wRJDPBLYSMPmwLmFvxNPHFTJZFTh9tXPFmzeXKXUeQ";

export type LoginUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: UserRole;
  clientId: string | null;
};

export async function authenticateWithPassword(input: {
  email: string;
  password: string;
  /** Второй фактор. Приходит вторым шагом той же формы. */
  code?: string;
}): Promise<LoginUser> {
  const { email, password, code } = input;

  // Лимит здесь, а не только в форме: Auth.js принимает запрос и напрямую
  if (await isLoginBlocked(email)) {
    // Блокировка бьёт по каждой попытке — в журнал она идёт раз в 5 минут
    // на аккаунт и на адрес, иначе перебор забил бы им всю ленту
    const { ip, userAgent } = await requestMeta();
    if (shouldLogNoisyFailure("blocked", { emailFingerprint: emailFingerprint(email), ip })) {
      recordAuthEventSoon({
        kind: "LOGIN_FAIL",
        email,
        ip,
        userAgent,
        details: { method: "password", reason: "blocked" },
      });
    }
    throw new LoginError("invalid");
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), isActive: true },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      organizationId: true,
      role: true,
      clientId: true,
    },
  });

  // Пароль сверяем даже когда пользователь не найден — иначе разница
  // во времени ответа выдаёт, какие email заведены в системе.
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !user.passwordHash || !ok) {
    await recordLoginFailure(email);
    // Перебор несуществующих адресов — не чаще 10 записей в минуту с одного адреса;
    // неудачи у настоящих учёток пишутся всегда: они и есть то, что ищут в журнале
    const { ip, userAgent } = await requestMeta();
    if (user || shouldLogNoisyFailure("unknown_address", { ip })) {
      recordAuthEventSoon({
        kind: "LOGIN_FAIL",
        userId: user?.id ?? null,
        email,
        ip,
        userAgent,
        details: { method: "password", reason: "bad_credentials" },
      });
    }
    throw new LoginError("invalid");
  }

  // Второй фактор проверяется только после пароля: до этого мы
  // не должны даже подтверждать, что такой человек есть
  const secondFactor = await requiresSecondFactor(user.id);
  if (secondFactor) {
    if (!code?.trim()) throw new LoginError("second_factor_required");
    // Шесть цифр перебираются быстро, поэтому код считаем отдельно и строже пароля;
    // попытка занимается до проверки — иначе параллельные запросы обгоняют счётчик
    const result = await checkSecondFactor(user.id, code);
    if (result !== "ok") {
      recordAuthEventSoon({
        kind: "TWO_FACTOR_FAIL",
        userId: user.id,
        email,
        details: { method: "password", reason: result },
      });
      throw new LoginError("second_factor_invalid");
    }
  }

  await clearLoginFailures(email, user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  recordAuthEventSoon({
    kind: "LOGIN_OK",
    userId: user.id,
    email,
    details: { method: "password", secondFactor },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    organizationId: user.organizationId,
    role: user.role,
    clientId: user.clientId,
  };
}
