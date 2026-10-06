import { createHmac, timingSafeEqual } from "node:crypto";

import { isUniqueViolation } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { isDeliverableEmail } from "@/lib/notifications/deliverable";
import { brandedEmail } from "@/lib/notifications/email-brand";
import { appUrl } from "@/lib/urls";

/**
 * Почта для вошедших по телефону.
 *
 * Адрес, который человек назвал сам (анкета, настройки), не становится
 * рабочим сразу: он лежит в User.pendingEmail, пока человек не перейдёт
 * по ссылке из письма на этот адрес. Иначе опечатка или чужой адрес
 * отдавали бы постороннему уведомления о кандидатах, а через «Забыли
 * пароль» — и сам кабинет: сброс ищет человека по User.email.
 *
 * Ссылка подписана AUTH_SECRET и живёт сутки. Отдельной таблицы нет:
 * в подписи адрес, и ссылка на прежний адрес перестаёт действовать,
 * как только человек назвал другой.
 */

const TTL_HOURS = 24;

export class EmailConfirmError extends Error {}

function signingSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET не задан — ссылку подтверждения подписать нечем");
  return value;
}

function sign(body: string): Buffer {
  return createHmac("sha256", signingSecret()).update(`email-confirm:${body}`).digest();
}

export function emailConfirmToken(userId: string, email: string, now: Date = new Date()): string {
  const expires = Math.floor(now.getTime() / 1000) + TTL_HOURS * 3600;
  const body = Buffer.from(JSON.stringify({ u: userId, e: email, x: expires })).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

/** null — подделана, испорчена или устарела. Причину наружу не различаем. */
export function readEmailConfirmToken(
  token: string,
  now: Date = new Date(),
): { userId: string; email: string } | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = sign(body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims: { u?: unknown; e?: unknown; x?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.u !== "string" || typeof claims.e !== "string" || typeof claims.x !== "number") {
    return null;
  }
  if (claims.x * 1000 <= now.getTime()) return null;
  return { userId: claims.u, email: claims.e };
}

const TAKEN = "Этот адрес уже привязан к другому кабинету. Укажите другой";

async function assertFree(organizationId: string, email: string, userId: string) {
  const taken = await prisma.user.findFirst({
    where: { organizationId, email, id: { not: userId } },
    select: { id: true },
  });
  if (taken) throw new EmailConfirmError(TAKEN);
}

/** Проверка до записи — чтобы анкета сказала «адрес занят» сразу, а не письмом. */
export async function assertEmailAvailable(
  organizationId: string,
  userId: string,
  rawEmail: string,
): Promise<void> {
  await assertFree(organizationId, rawEmail.trim().toLowerCase(), userId);
}

export function confirmationEmail(link: string) {
  const text = [
    "Здравствуйте!",
    "",
    "Этот адрес указали как рабочую почту в кабинете Fattakhov HR.",
    "Подтвердите его — и сюда начнут приходить уведомления о кандидатах:",
    "",
    link,
    "",
    `Ссылка действует ${TTL_HOURS} часа.`,
    "Если это были не вы, просто не открывайте ссылку — адрес не подключится.",
  ].join("\n");

  return {
    subject: "Подтвердите почту для Fattakhov HR",
    text,
    html: brandedEmail({
      title: "Подтвердите почту",
      preview: "Одно нажатие — и уведомления о кандидатах начнут приходить сюда",
      heading: "Подтвердите рабочую почту",
      paragraphs: [
        "Этот адрес указали в кабинете Fattakhov HR. После подтверждения сюда начнут приходить уведомления о кандидатах.",
      ],
      action: { href: link, label: "Подтвердить почту" },
      note:
        `Ссылка действует ${TTL_HOURS} часа. Если это были не вы, просто ` +
        "не открывайте её — адрес не подключится.",
    }),
  };
}

/**
 * Запомнить названный адрес и отправить на него ссылку.
 *
 * Только тем, у кого вместо почты заглушка: у остальных адрес уже проверен —
 * кодом из письма при регистрации по почте или приглашением, — и менять
 * его этим путём мы не даём.
 */
export async function requestEmailConfirmation(params: {
  userId: string;
  organizationId: string;
  email: string;
}): Promise<{ sentTo: string }> {
  const email = params.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { id: params.userId, isActive: true },
    select: { email: true },
  });
  if (!user) throw new EmailConfirmError("Учётная запись не найдена");
  if (isDeliverableEmail(user.email)) {
    throw new EmailConfirmError("Рабочая почта уже подключена");
  }
  await assertFree(params.organizationId, email, params.userId);

  await prisma.user.update({ where: { id: params.userId }, data: { pendingEmail: email } });

  const mail = confirmationEmail(
    appUrl(`/confirm-email/${emailConfirmToken(params.userId, email)}`),
  );
  await getEmailTransport().send({ to: email, ...mail });
  return { sentTo: email };
}

/**
 * Подтвердить адрес по ссылке. Повторный переход по той же ссылке —
 * не ошибка: адрес уже подключён, так и отвечаем.
 */
export async function confirmEmail(token: string): Promise<{ email: string }> {
  const claims = readEmailConfirmToken(token);
  if (!claims) throw new EmailConfirmError("Ссылка устарела или повреждена — запросите новую в настройках");

  const user = await prisma.user.findFirst({
    where: { id: claims.userId, isActive: true },
    select: { id: true, organizationId: true, email: true, pendingEmail: true },
  });
  if (!user) throw new EmailConfirmError("Ссылка устарела или повреждена — запросите новую в настройках");
  if (user.email === claims.email) return { email: user.email };
  if (user.pendingEmail !== claims.email) {
    throw new EmailConfirmError("Эта ссылка больше не действует: после неё указали другой адрес");
  }

  await assertFree(user.organizationId, claims.email, user.id);
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { email: claims.email, pendingEmail: null },
      }),
      prisma.activityLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "email_confirmed",
          diff: { стало: claims.email },
        },
      }),
    ]);
  } catch (error) {
    // Кто-то занял адрес между проверкой и записью
    if (isUniqueViolation(error)) throw new EmailConfirmError(TAKEN);
    throw error;
  }
  return { email: claims.email };
}
