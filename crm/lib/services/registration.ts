import { randomInt } from "node:crypto";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { REGISTRATION_CONSENT_VERSION } from "@/lib/legal/registration-consent";
import { getEmailTransport } from "@/lib/notifications/channels";

export class RegistrationError extends Error {}

/** Код живёт 15 минут — этого хватает, чтобы дойти до почты и вернуться. */
const CODE_TTL_MINUTES = 15;

/** После стольких неверных попыток заявка гасится — код нужно запросить заново. */
const MAX_ATTEMPTS = 5;

/**
 * Название компании здесь не собирается — как и на студенческой платформе,
 * это отдельный шаг после входа. Иначе форма регистрации превращается
 * в анкету, а самый частый повод отвалиться посреди неё — необязательные поля.
 */
export const COMPANY_NAME_PLACEHOLDER = "Название компании не указано";

function generateCode(): string {
  // 6 цифр, старший разряд не ноль незачем — "042817" читается и вводится
  // ровно так же, как "142817"
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Запрос на самостоятельную регистрацию компании: экран 1.
 *
 * Пароль хешируется уже здесь — plaintext не переживает один запрос.
 * Прежние неиспользованные заявки на этот адрес гасятся: иначе на руках
 * оказывается несколько кодов сразу, и непонятно, какой из них верный.
 */
export async function requestCompanyRegistration(params: {
  email: string;
  phone: string;
  password: string;
  ip?: string | null;
}): Promise<void> {
  const email = params.email.toLowerCase().trim();

  const taken = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true },
  });
  if (taken) {
    // Кому именно принадлежит адрес — не сообщаем: в отличие от приглашения,
    // эту форму заполняет аноним, и раскрывать имя владельца ему нельзя
    throw new RegistrationError(
      "Этот email уже зарегистрирован. Войдите или восстановите пароль.",
    );
  }

  await prisma.pendingClientRegistration.updateMany({
    where: { email, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateCode();
  const [passwordHash, codeHash] = await Promise.all([
    hashPassword(params.password),
    hashPassword(code),
  ]);

  await prisma.pendingClientRegistration.create({
    data: {
      email,
      phone: params.phone,
      passwordHash,
      codeHash,
      consentVersion: REGISTRATION_CONSENT_VERSION,
      consentAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      requestedIp: params.ip ?? null,
    },
  });

  await getEmailTransport().send({
    to: email,
    subject: "Код подтверждения регистрации",
    text: [
      "Код для завершения регистрации в CRM Fattakhov HR:",
      "",
      code,
      "",
      `Код действует ${CODE_TTL_MINUTES} минут.`,
      "",
      "Если вы не запрашивали регистрацию, просто удалите письмо.",
    ].join("\n"),
  });
}

export type RegistrationResult = { email: string };

/**
 * Подтверждение кода: экран 2. Создаёт Client (LEAD, без договора) и
 * пользователя CLIENT_ADMIN одной транзакцией.
 */
export async function confirmCompanyRegistration(params: {
  email: string;
  code: string;
}): Promise<RegistrationResult> {
  const email = params.email.toLowerCase().trim();

  const pending = await prisma.pendingClientRegistration.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) {
    throw new RegistrationError(
      "Код устарел или уже использован. Запросите регистрацию заново.",
    );
  }

  if (pending.attempts >= MAX_ATTEMPTS) {
    await prisma.pendingClientRegistration.update({
      where: { id: pending.id },
      data: { usedAt: new Date() },
    });
    throw new RegistrationError(
      "Слишком много попыток. Запросите регистрацию заново.",
    );
  }

  const ok = await verifyPassword(pending.codeHash, params.code);
  if (!ok) {
    await prisma.pendingClientRegistration.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
    });
    throw new RegistrationError("Код не подошёл. Проверьте письмо.");
  }

  // Та же гонка, что и при приёме приглашения: адрес заняли, пока человек
  // вводил код из письма
  const taken = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true },
  });
  if (taken) {
    throw new RegistrationError(
      "Этот email уже зарегистрирован. Войдите или восстановите пароль.",
    );
  }

  const organization = await prisma.organization.findFirst({
    select: { id: true },
  });
  if (!organization) {
    throw new RegistrationError("Регистрация временно недоступна");
  }

  await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        organizationId: organization.id,
        name: COMPANY_NAME_PLACEHOLDER,
        status: "LEAD",
        fromStudentsPlatform: false,
      },
    });

    await tx.user.create({
      data: {
        organizationId: organization.id,
        clientId: client.id,
        email,
        phone: pending.phone,
        // Настоящее имя контакта тоже собирается после входа — тем же
        // шагом, что и название компании
        fullName: "Представитель компании",
        role: "CLIENT_ADMIN",
        passwordHash: pending.passwordHash,
      },
    });

    await tx.pendingClientRegistration.update({
      where: { id: pending.id },
      data: { usedAt: new Date() },
    });
  });

  return { email };
}
