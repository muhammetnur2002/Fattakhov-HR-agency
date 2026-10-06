import { randomBytes } from "node:crypto";

import { hashPassword } from "@/lib/auth/password";
import { isUniqueViolation } from "@/lib/db/errors";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/labels";
import { channelStatus, getEmailTransport } from "@/lib/notifications/channels";
import { appUrl } from "@/lib/urls";
import { passwordProblem } from "@/lib/validation/password";
import { brandedEmail } from "@/lib/notifications/email-brand";

/** Срок жизни ссылки-приглашения. */
const INVITE_TTL_DAYS = 7;

export type InviteDetails = {
  token: string;
  email: string;
  role: UserRole;
  organizationName: string;
  /** Название компании-клиента — только для ролей CLIENT_*. */
  clientName: string | null;
  /** null у первичной настройки — приглашение создала система. */
  invitedByName: string | null;
};

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Создаёт приглашение — единственный путь появления нового пользователя
 * внутри агентства и команды клиента. Публичная регистрация существует
 * отдельно (см. lib/services/registration.ts) и заводит не сотрудника,
 * а сам аккаунт компании: она создаёт Client + первого CLIENT_ADMIN,
 * а не добавляет человека к уже существующему клиенту.
 *
 * Занятость адреса проверяется здесь, а не при приёме ссылки: иначе
 * человек узнаёт о проблеме, уже придумав пароль и заполнив форму,
 * а исправить её может только тот, кто приглашал.
 *
 * Должность и доступы сотрудника агентства записываются в приглашение
 * и переходят в учётную запись при приёме: человек входит уже с тем,
 * что ему выдали, без второго захода к владельцу.
 */
export async function createInvitation(params: {
  organizationId: string;
  email: string;
  role: UserRole;
  clientId?: string | null;
  position?: string | null;
  grants?: readonly string[];
  createdById: string;
}): Promise<string> {
  const email = params.email.toLowerCase().trim();

  /*
    Обе проверки и создание — под одним замком.

    Порознь два нажатия «Пригласить» подряд проходили проверки оба
    и заводили на один адрес два действующих приглашения: человек
    получал два письма с разными ссылками, а в списке приглашений
    висела пара одинаковых строк. Уникального индекса на адрес
    у приглашений нет и быть не может — приглашать повторно после
    того, как прежнее истекло, нужно уметь.

    Замок на строке организации — тот же приём, что у номеров вакансий,
    счетов и у выбора условий сотрудничества.
  */
  const token = await prismaRaw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${params.organizationId} FOR UPDATE`;

    /*
      Подробности отказа — только своим: сотрудник агентства видит всё,
      клиент — лишь про свою компанию. Иначе форма приглашения
      превращается в проверку «кто и где зарегистрирован или приглашён»
      по всей системе. Правило одно на обе проверки ниже: раньше оно
      стояло только у занятого адреса, а «уже есть действующее
      приглашение» отвечал любому — и администратор одной компании
      узнавал, что адрес позвали в другую (BR-28).
    */
    const inviter = await tx.user.findFirst({
      where: { id: params.createdById },
      select: { clientId: true },
    });
    const mayDisclose = (clientId: string | null) =>
      !inviter?.clientId || clientId === inviter.clientId;
    const unavailable = () =>
      new InviteError(`Не удалось пригласить ${email}: адрес недоступен. Укажите другой.`);

    const taken = await tx.user.findFirst({
      where: { email },
      select: { fullName: true, clientId: true },
    });
    if (taken) {
      if (!mayDisclose(taken.clientId)) throw unavailable();
      // Где именно занят адрес — важно: чаще всего это сам приглашающий
      // или сотрудник, которого уже завели в другой роли
      const where = taken.clientId ? "в кабинете клиента" : "в агентстве";
      throw new InviteError(
        `${email} уже занят: ${taken.fullName}, ${where}. ` +
          `Один адрес — один пользователь. Укажите другой.`,
      );
    }

    const pending = await tx.invitation.findFirst({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { clientId: true },
    });
    if (pending) {
      if (!mayDisclose(pending.clientId)) throw unavailable();
      throw new InviteError(
        `На ${email} уже есть действующее приглашение — оно в списке «Ждут принятия». ` +
          `Нужно пригласить заново — отзовите там прежнее.`,
      );
    }

    const newToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    await tx.invitation.create({
      data: {
        organizationId: params.organizationId,
        email,
        role: params.role,
        clientId: params.clientId ?? null,
        position: params.position ?? null,
        grants: [...(params.grants ?? [])],
        token: newToken,
        expiresAt,
        createdById: params.createdById,
      },
    });

    return newToken;
  });

  // Письмо — вне транзакции: недоставленное не должно откатывать уже
  // созданное приглашение, ссылку всё равно можно передать вручную.
  await sendInvitationMail(token);

  return token;
}

/**
 * Что сказать пригласившему — одинаково на всех экранах, откуда зовут.
 *
 * «Отправлено» без оговорок было бы неправдой: транспорт молча глотает
 * отказ доставки, а без SMTP письмо уходит только в журнал сервера.
 * Наверняка известно одно — подключена ли почта вообще, и от этого
 * зависит, нужно ли человеку самому передавать ссылку.
 */
export function inviteResultMessage(email: string): string {
  return channelStatus().email
    ? `Приглашение отправлено на ${email}. Не дойдёт письмо — ссылку можно скопировать в списке «Ждут принятия».`
    : `Приглашение для ${email} готово, но почта на сервере не подключена и письмо не ушло — скопируйте ссылку в списке «Ждут принятия» и передайте сами.`;
}

/**
 * Письмо со ссылкой приглашения. Раньше приглашение только создавалось
 * в базе, а ссылку передавали руками — «Письма пока не отправляются»
 * было написано прямо в кабинете клиента.
 *
 * Молча проглатывает недоставленное: ссылка остаётся рабочей, и её
 * всё ещё можно скопировать из кабинета и передать самому.
 */
async function sendInvitationMail(token: string): Promise<void> {
  const invite = await getInvitation(token);
  if (!invite) return;

  await getEmailTransport().send({ to: invite.email, ...invitationMail(invite) });
}

/**
 * Тема и текст письма-приглашения. Отдельно от отправки — чтобы текст
 * можно было проверить без почты и без базы.
 *
 * Компания-клиент по имени не называется, и это не забывчивость. Адрес
 * до принятия приглашения никем не подтверждён: опечатка в домене —
 * и посторонний узнаёт, что такая-то компания работает с агентством.
 * Связка «кто с кем работает» — ровно то, что бережёт BR-28. Настоящему
 * получателю имя его собственной компании ничего не добавляет, а на
 * странице по ссылке оно есть. Название агентства не скрыть: оно и есть
 * отправитель письма. Так было в CRM агентства — здесь вернули.
 */
export function invitationMail(invite: InviteDetails): {
  subject: string;
  text: string;
  html: string;
} {
  const place = invite.clientName
    ? "в кабинет вашей компании"
    : `в агентство «${invite.organizationName}»`;
  const from = invite.invitedByName ? `${invite.invitedByName} приглашает вас` : "Вас приглашают";
  const link = appUrl(`/invite/${invite.token}`);

  const subject = `Приглашение ${place}`;
  return {
    subject,
    text: [
      `${from} ${place} — роль «${ROLE_LABELS[invite.role]}».`,
      "",
      `Ссылка действует ${INVITE_TTL_DAYS} дней и открывается один раз:`,
      link,
      "",
      "Если вы не ожидали этого приглашения, просто не переходите по ссылке" +
        " и сообщите тому, кто его прислал.",
    ].join("\n"),
    html: brandedEmail({
      title: subject,
      preview: `${from} ${place}`,
      heading: "Приглашение в Fattakhov HR",
      paragraphs: [`${from} ${place} — роль «${ROLE_LABELS[invite.role]}».`],
      action: { href: link, label: "Принять приглашение" },
      note:
        `Ссылка действует ${INVITE_TTL_DAYS} дней и открывается один раз. ` +
        "Если вы не ожидали этого приглашения, просто не переходите по ней" +
        " и сообщите тому, кто его прислал.",
    }),
  };
}

/**
 * Данные приглашения для страницы приёма.
 * Возвращает null на любой негодный токен — просроченный, использованный
 * или несуществующий. Страница показывает одно и то же сообщение на все
 * случаи, чтобы по ссылке нельзя было выяснить, существовала ли она.
 */
export async function getInvitation(
  token: string,
): Promise<InviteDetails | null> {
  const invite = await prisma.invitation.findFirst({
    where: { token, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: {
      token: true,
      email: true,
      role: true,
      clientId: true,
      organizationId: true,
      createdBy: { select: { fullName: true } },
    },
  });

  if (!invite) return null;

  const [organization, client] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    }),
    invite.clientId
      ? prisma.client.findFirst({
          where: { id: invite.clientId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    token: invite.token,
    email: invite.email,
    role: invite.role,
    organizationName: organization?.name ?? "",
    clientName: client?.name ?? null,
    // Пусто у первичной настройки: первого владельца звать некому
    invitedByName: invite.createdBy?.fullName ?? null,
  };
}

export class InviteError extends Error {}

/**
 * Приём приглашения: создаёт пользователя и гасит токен.
 *
 * Обе операции в одной транзакции — иначе при сбое между ними ссылка
 * останется рабочей и по ней заведут второго пользователя.
 */
export async function acceptInvitation(params: {
  token: string;
  fullName: string;
  password: string;
}): Promise<{ email: string }> {
  const invite = await getInvitation(params.token);
  if (!invite) throw new InviteError("Ссылка недействительна или истекла");

  const existing = await prisma.user.findFirst({
    where: { email: invite.email },
    select: { id: true },
  });
  // Сюда доходит только гонка: адрес заняли, пока человек заполнял форму.
  // Обычный случай перехвачен ещё при создании приглашения.
  if (existing) {
    throw new InviteError(
      `${invite.email} уже занят другим пользователем. ` +
        `Попросите отправить приглашение на другой адрес.`,
    );
  }

  // Правило слабых паролей одно на все формы; почта — та, на которую пришло приглашение
  const problem = passwordProblem(params.password, { email: invite.email });
  if (problem) throw new InviteError(problem);

  const passwordHash = await hashPassword(params.password);

  const full = await prisma.invitation.findFirst({
    where: { token: params.token },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      role: true,
      position: true,
      grants: true,
    },
  });
  if (!full) throw new InviteError("Ссылка недействительна или истекла");

  // Та же гонка, что и с проверкой выше, только уже неотличимо близкая:
  // два нажатия «Принять» подряд читают приглашение до того, как первое
  // успело записаться. Отказ уникального индекса называем теми же
  // словами — сбоем это не является
  try {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          organizationId: full.organizationId,
          clientId: full.clientId,
          email: invite.email,
          fullName: params.fullName.trim(),
          role: full.role,
          position: full.position,
          grants: full.grants,
          passwordHash,
        },
      }),
      prisma.invitation.update({
        where: { id: full.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new InviteError(
        `${invite.email} уже занят другим пользователем. ` +
          `Попросите отправить приглашение на другой адрес.`,
      );
    }
    throw error;
  }

  return { email: invite.email };
}
