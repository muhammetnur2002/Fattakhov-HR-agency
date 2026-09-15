import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { appUrl } from "@/lib/urls";

export class PasswordError extends Error {}

/** Сколько живёт ссылка восстановления. Час: этого хватает, чтобы дойти до почты. */
const RESET_TTL_MINUTES = 60;

/**
 * Хеш токена для хранения.
 *
 * sha256, а не argon2: токен и так 32 случайных байта, подбирать его
 * бессмысленно, а искать по нему надо на каждом открытии ссылки.
 * Медленный хеш здесь дал бы нагрузку без выигрыша в стойкости.
 */
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Смена пароля тем, кто уже вошёл.
 *
 * Текущий пароль спрашивается обязательно: без него любой, кто получил
 * доступ к незаблокированному компьютеру, меняет пароль и запирает
 * владельца из системы с персональными данными.
 */
export async function changePassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    throw new PasswordError("Пароль сменить нельзя, обратитесь к владельцу");
  }

  const ok = await verifyPassword(user.passwordHash, params.currentPassword);
  if (!ok) throw new PasswordError("Текущий пароль неверен");

  if (params.currentPassword === params.newPassword) {
    throw new PasswordError("Новый пароль совпадает с текущим");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(params.newPassword),
      // Отметка гасит все выпущенные ранее сессии
      passwordChangedAt: new Date(),
    },
  });
}

/**
 * Запрос ссылки восстановления.
 *
 * Ничего не сообщает о том, есть ли такой адрес в системе: иначе форма
 * превращается в способ проверить, работает ли человек в компании.
 * Поэтому функция ничего не возвращает и на несуществующем адресе
 * ведёт себя так же, как на существующем.
 */
export async function requestPasswordReset(params: {
  email: string;
  ip?: string | null;
}): Promise<void> {
  const email = params.email.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) return;

  // Прежние неиспользованные ссылки гасим: иначе у человека на руках
  // оказывается несколько рабочих, и отозвать их нечем
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt,
      requestedIp: params.ip ?? null,
    },
  });

  const link = appUrl(`/reset/${token}`);

  await getEmailTransport().send({
    to: user.email,
    subject: "Восстановление доступа к платформе",
    text: [
      `${user.fullName}, вы запросили смену пароля.`,
      "",
      `Ссылка действует ${RESET_TTL_MINUTES} минут и открывается один раз:`,
      link,
      "",
      "Если вы этого не делали, просто удалите письмо. Пароль останется прежним.",
    ].join("\n"),
  });
}

export type ResetTarget = { userId: string; email: string; fullName: string };

/**
 * Проверка ссылки. Возвращает null на любой негодный токен: истёкший,
 * использованный, выдуманный. Страница показывает одно и то же на все
 * случаи, чтобы по ответу нельзя было выяснить, существовала ли ссылка.
 */
export async function getResetTarget(
  token: string,
): Promise<ResetTarget | null> {
  const record = await prisma.passwordReset.findFirst({
    where: {
      tokenHash: tokenHash(token),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      user: { select: { id: true, email: true, fullName: true, isActive: true } },
    },
  });

  if (!record?.user?.isActive) return null;

  return {
    userId: record.user.id,
    email: record.user.email,
    fullName: record.user.fullName,
  };
}

/**
 * Установка нового пароля по ссылке.
 *
 * Гашение ссылки и смена пароля идут одной транзакцией: иначе сбой между
 * ними оставит рабочую ссылку при уже смененном пароле.
 */
export async function resetPassword(params: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const hash = tokenHash(params.token);

  const record = await prisma.passwordReset.findFirst({
    where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });
  if (!record) throw new PasswordError("Ссылка недействительна или истекла");

  const passwordHash = await hashPassword(params.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordReset.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
}

/**
 * Сравнение секретов постоянным временем.
 *
 * Держим рядом с остальной работой с секретами, чтобы не появилось
 * второй реализации в другом месте.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
