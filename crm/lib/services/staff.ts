import {
  AccessDeniedError,
  AGENCY_ROLES,
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
  isSelf: boolean;
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
    },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
  });

  return {
    members: users.map((user) => ({
      ...user,
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
    select: { id: true, role: true },
  });
  if (!target) throw new StaffError("Сотрудник не найден");
  if (!canManageStaffMember(actor, target)) {
    throw new AccessDeniedError("staff.manage");
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(password),
      // Гасит все выпущенные ранее сессии этого сотрудника
      passwordChangedAt: new Date(),
    },
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
