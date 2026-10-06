import {
  AccessDeniedError,
  AGENCY_ROLES,
  assertCanDo,
  canAssignStaff,
  canManageStaffMember,
  effectiveGrants,
  STAFF_GRANTS,
  type Actor,
  type StaffGrant,
  type StaffRole,
} from "@/lib/access";
import { hashPassword } from "@/lib/auth/password";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { createInvitation } from "@/lib/services/invitations";
import { presenceFor } from "@/lib/services/messages";
import type { Presence } from "@/lib/presence";
import { recordAuthEvent } from "@/lib/services/auth-events";
import { passwordProblem } from "@/lib/validation/password";

/**
 * Команда агентства: аккаунты, роли, должности и доступы.
 *
 * Кто кого может трогать и что раздавать — решает lib/access
 * (canManageStaffMember, canAssignStaff). Здесь только данные.
 */

export class StaffError extends Error {}

export type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  position: string | null;
  grants: StaffGrant[];
  isActive: boolean;
  lastLoginAt: Date | null;
  /** «В сети» / «был(а)…»; null — человек скрыл статус или это сам смотрящий. */
  presence: Presence | null;
  isSelf: boolean;
  /** Включена ли у сотрудника 2FA (у агентства она обязательна, пока не настроена — кабинет закрыт). */
  twoFactorEnabled: boolean;
  /** Может ли текущий пользователь менять этого сотрудника. */
  manageable: boolean;
};

/** Только известные коды: строка из базы могла пережить удалённый доступ. */
function knownGrants(grants: readonly string[]): StaffGrant[] {
  return STAFF_GRANTS.filter((grant) => grants.includes(grant));
}

export async function listStaff(
  actor: Actor,
): Promise<{ members: StaffMember[] }> {
  const users = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      role: { in: [...AGENCY_ROLES] },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      position: true,
      grants: true,
      isActive: true,
      lastLoginAt: true,
      organizationId: true,
      clientId: true,
      showPresence: true,
      lastSeenAt: true,
      totpEnabledAt: true,
    },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
  });

  return {
    members: users.map(({ organizationId, clientId, showPresence, lastSeenAt, totpEnabledAt, ...user }) => ({
      ...user,
      twoFactorEnabled: totpEnabledAt !== null,
      // Отключённому доступ закрыт — «в сети» у него быть не может
      presence: user.isActive
        ? presenceFor(actor, { id: user.id, organizationId, clientId, role: user.role, showPresence, lastSeenAt })
        : null,
      // У владельца всё и так: в базе у него пусто, а показывать надо правду
      grants:
        user.role === "OWNER" ? [...STAFF_GRANTS] : knownGrants(user.grants),
      isSelf: user.id === actor.id,
      manageable: canManageStaffMember(actor, { id: user.id, role: user.role }),
    })),
  };
}

/**
 * Аккаунт сотрудника. Пароль задаёт тот, кто заводит учётку, и сообщает
 * его человеку лично — письмо и ссылка-приглашение здесь не нужны, вход
 * возможен сразу.
 *
 * Занятость адреса проверяется под тем же замком, что и у приглашений
 * клиента (lib/services/invitations.ts): без него два одновременных
 * нажатия «Создать» на один адрес завели бы двух пользователей.
 */
export async function createStaffAccount(
  actor: Actor,
  input: {
    email: string;
    fullName: string;
    password: string;
    role: StaffRole;
    position?: string;
    grants: StaffGrant[];
  },
): Promise<{ id: string }> {
  if (!canAssignStaff(actor, { role: input.role }, input.grants)) {
    throw new AccessDeniedError("staff.manage");
  }

  const email = input.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.password);

  return prismaRaw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`;

    const taken = await tx.user.findFirst({
      where: { email },
      select: { fullName: true, clientId: true },
    });
    if (taken) {
      const where = taken.clientId ? "в кабинете клиента" : "в агентстве";
      throw new StaffError(
        `${email} уже занят: ${taken.fullName}, ${where}. ` +
          `Один адрес — один пользователь. Укажите другой.`,
      );
    }

    return tx.user.create({
      data: {
        organizationId: actor.organizationId,
        email,
        fullName: input.fullName.trim(),
        role: input.role,
        position: input.position ?? null,
        grants: input.grants,
        passwordHash,
      },
      select: { id: true },
    });
  });
}

/** Владелец (или тот, кому доверено управление командой) перевыдаёт пароль. */
export async function resetStaffPassword(
  actor: Actor,
  userId: string,
  password: string,
): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, role: true, grants: true, email: true },
  });
  if (!target) throw new StaffError("Сотрудник не найден");
  // Новый пароль — это вход под чужой учёткой со всеми её доступами, поэтому правило то же, что
  // при выдаче доступов: нельзя перевыдать пароль тому, у кого есть то, чего нет у самого управляющего
  if (!canAssignStaff(actor, target, effectiveGrants({ ...actor, id: target.id, role: target.role, grants: target.grants }))) {
    throw new AccessDeniedError("staff.manage");
  }

  // Правило слабых паролей одно на все формы; почта сотрудника в контексте — из базы
  const problem = passwordProblem(password, { email: target.email });
  if (problem) throw new StaffError(problem);

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(password),
      // Гасит все выпущенные ранее сессии этого сотрудника
      passwordChangedAt: new Date(),
    },
  });

  await recordAuthEvent({
    kind: "PASSWORD_RESET",
    userId: target.id,
    email: target.email,
    details: { method: "by_admin", by: actor.id },
  });
}

/**
 * Роль, должность и доступы сотрудника.
 *
 * Доступы, которых нет у самого управляющего, он в форме не видит и не
 * может ни выдать, ни снять: иначе доверенный сотрудник снимал бы с коллеги
 * то, что выдал владелец. Такие доступы остаются как были.
 */
export async function updateStaff(
  actor: Actor,
  input: {
    userId: string;
    role: StaffRole;
    position?: string;
    grants: StaffGrant[];
  },
): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: input.userId, organizationId: actor.organizationId },
    select: { id: true, role: true, grants: true },
  });
  if (!target) throw new StaffError("Сотрудник не найден");
  if (!canManageStaffMember(actor, target)) {
    throw new AccessDeniedError("staff.manage");
  }
  if (!canAssignStaff(actor, { id: target.id, role: input.role }, input.grants)) {
    throw new AccessDeniedError("staff.manage");
  }

  const own = effectiveGrants(actor);
  const kept = knownGrants(target.grants).filter((grant) => !own.includes(grant));

  await prisma.user.update({
    where: { id: target.id },
    data: {
      role: input.role,
      position: input.position ?? null,
      grants: [...new Set([...kept, ...input.grants])],
    },
  });
}

/**
 * Отключить или вернуть доступ. Отключённый теряет вход в CRM сразу:
 * актор читается из базы на каждый запрос (lib/auth/session).
 */
export async function setStaffActive(
  actor: Actor,
  userId: string,
  active: boolean,
): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, role: true },
  });
  if (!target) throw new StaffError("Сотрудник не найден");
  if (!canManageStaffMember(actor, target)) {
    throw new AccessDeniedError("staff.manage");
  }
  await prisma.user.update({ where: { id: target.id }, data: { isActive: active } });
}

// ============ ПРИГЛАШЕНИЯ ПО ССЫЛКЕ ============

/**
 * Неотвеченное приглашение в команду — как его видит тот, кто ведёт команду.
 *
 * `token` есть только у тех, кого смотрящий мог бы пригласить сам
 * (canAssignStaff): ссылка — пропуск с ролью и доступами, и показать её
 * доверенному сотруднику, у которого этих прав нет, значило бы дать ему
 * способ выдать их кому угодно. Без права токен не уходит даже в данные
 * страницы — не только не рисуется.
 */
export type StaffInvitation = {
  id: string;
  email: string;
  role: UserRole;
  position: string | null;
  grants: StaffGrant[];
  expiresAt: Date;
  token: string | null;
  /** Может ли смотрящий отозвать: та же граница, что у отключения сотрудника. */
  revocable: boolean;
};

export async function listStaffInvitations(actor: Actor): Promise<StaffInvitation[]> {
  assertCanDo(actor, "staff.manage");

  const invitations = await prisma.invitation.findMany({
    where: {
      organizationId: actor.organizationId,
      // Приглашения в кабинеты клиентов — не команда агентства
      clientId: null,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      position: true,
      grants: true,
      token: true,
      expiresAt: true,
    },
  });

  return invitations.map((invitation) => {
    const grants = knownGrants(invitation.grants);
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      position: invitation.position,
      grants,
      expiresAt: invitation.expiresAt,
      token: canAssignStaff(actor, { role: invitation.role }, grants) ? invitation.token : null,
      revocable: canManageStaffMember(actor, { role: invitation.role }),
    };
  });
}

/**
 * Позвать сотрудника письмом со ссылкой: пароль человек задаёт сам.
 *
 * Рядом с созданием аккаунта, а не вместо него — у каждого пути свой
 * случай: аккаунт с паролем нужен, когда человек рядом и войти надо
 * сейчас, приглашение — когда пароль передать некому или незачем знать.
 * Права те же, что у создания: роль не выше своей, доступы только свои.
 * Письмо уходит из createInvitation; недоставленное ничего не роняет —
 * ссылка остаётся в списке «Ждут принятия».
 */
export async function inviteStaff(
  actor: Actor,
  input: {
    email: string;
    role: StaffRole;
    position?: string;
    grants: StaffGrant[];
  },
): Promise<{ token: string }> {
  if (!canAssignStaff(actor, { role: input.role }, input.grants)) {
    throw new AccessDeniedError("staff.manage");
  }

  /*
    clientId пустой — и это главное отличие от приглашения в кабинет
    клиента: пользователь без clientId считается сотрудником агентства
    и в матрице прав, и в фильтрах видимости. Из формы его не подставить —
    такого поля в ней нет.
  */
  const token = await createInvitation({
    organizationId: actor.organizationId,
    email: input.email,
    role: input.role,
    clientId: null,
    position: input.position ?? null,
    grants: input.grants,
    createdById: actor.id,
  });

  return { token };
}

/**
 * Отозвать неотвеченное приглашение в команду.
 *
 * Нужно чаще, чем кажется: опечатка в адресе. Пока приглашение живо,
 * повторно позвать того же человека нельзя — createInvitation отвечает
 * «на этот адрес уже есть действующее приглашение», — а ссылка из
 * неверного письма неделю пускает в CRM любого, кто её откроет.
 *
 * Граница та же, что у отключения сотрудника (canManageStaffMember):
 * доверенный рекрутер не отзовёт приглашение руководителя подбора,
 * которое выдал владелец. Приглашение чужой организации или в кабинет
 * клиента не находится вовсе — ответ тот же, что на выдуманный id.
 *
 * Удаление физическое, и это не нарушение BR-26: мягкое удаление бережёт
 * историю, а у непринятого приглашения её нет — по нему никто не вошёл
 * и ссылаться на него нечему. Ссылка после этого ведёт на ту же страницу
 * «Ссылка недействительна», что и истёкшая.
 */
export async function revokeStaffInvitation(
  actor: Actor,
  invitationId: string,
): Promise<void> {
  assertCanDo(actor, "staff.manage");

  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      organizationId: actor.organizationId,
      clientId: null,
      acceptedAt: null,
    },
    select: { id: true, role: true },
  });
  if (!invitation) throw new StaffError("Приглашение не найдено");

  if (!canManageStaffMember(actor, { role: invitation.role })) {
    throw new AccessDeniedError("staff.manage");
  }

  await prisma.invitation.delete({ where: { id: invitation.id } });
}
