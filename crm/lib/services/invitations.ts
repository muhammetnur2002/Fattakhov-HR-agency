import { randomBytes } from "node:crypto";

import { hashPassword } from "@/lib/auth/password";
import { isUniqueViolation } from "@/lib/db/errors";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";

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
 * Создаёт приглашение. Публичной регистрации в продукте нет (ТЗ 2.2):
 * это единственный путь появления нового пользователя.
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
  return prismaRaw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${params.organizationId} FOR UPDATE`;

    const taken = await tx.user.findFirst({
      where: { email },
      select: { fullName: true, clientId: true },
    });
    if (taken) {
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
      select: { id: true },
    });
    if (pending) {
      throw new InviteError(
        `На ${email} уже есть действующее приглашение. ` +
          `Отправьте человеку прежнюю ссылку или дождитесь, пока она истечёт.`,
      );
    }

    const token = generateToken();
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
        token,
        expiresAt,
        createdById: params.createdById,
      },
    });

    return token;
  });
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
