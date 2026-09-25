import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/auth";
import {
  AccessDeniedError,
  canDo,
  isAgency,
  isClient,
  type Action,
  type Actor,
  type Subject,
} from "@/lib/access";
import { prisma } from "@/lib/db/prisma";

/**
 * Текущий пользователь как Actor для слоя прав.
 *
 * Роль и clientId читаются из БД, а не из JWT. Это лишний запрос на рендер,
 * но иначе отключение сотрудника или смена его роли не подействуют до
 * истечения токена — до 30 дней. Для системы с ПДн это неприемлемо.
 *
 * cache() схлопывает вызовы в пределах одного рендера, так что запрос
 * выполняется один раз, сколько бы компонентов ни спросили актора.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, isActive: true },
    select: {
      id: true,
      organizationId: true,
      role: true,
      clientId: true,
      grants: true,
      passwordChangedAt: true,
    },
  });
  if (!user) return null;

  // Сессия, выпущенная до смены пароля, больше не действует. Секунда
  // запаса: время выпуска округляется до секунды, и без неё сессия,
  // созданная тем же запросом, что сменил пароль, погасила бы сама себя.
  if (user.passwordChangedAt) {
    const issuedAt = session.user.issuedAt;
    const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (issuedAt === null || issuedAt === undefined || issuedAt < changedAt - 1) {
      return null;
    }
  }

  return {
    id: user.id,
    organizationId: user.organizationId,
    role: user.role,
    clientId: user.clientId,
    grants: user.grants,
  };
});

/** Актор или редирект на вход. Использовать во всех защищённых страницах. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function requireAgencyActor(): Promise<Actor> {
  const actor = await requireActor();
  if (!isAgency(actor)) notFound();
  return actor;
}

export async function requireClientActor(): Promise<Actor> {
  const actor = await requireActor();
  if (!isClient(actor)) notFound();
  return actor;
}

/**
 * Проверка права с превращением отказа в 404 (BR-28).
 *
 * Именно 404, а не 403: 403 подтверждает, что объект существует, и клиент
 * перебором id может выяснить, сколько вакансий у конкурента в этом же
 * агентстве.
 */
export function authorize(
  actor: Actor,
  action: Action,
  subject: Subject = {},
): void {
  if (!canDo(actor, action, subject)) notFound();
}

/**
 * Обёртка для server actions: там notFound() неуместен, нужна честная ошибка.
 * Пробрасывает AccessDeniedError, которую обработчик действия превращает
 * в сообщение пользователю.
 */
export function authorizeOrThrow(
  actor: Actor,
  action: Action,
  subject: Subject = {},
): void {
  if (!canDo(actor, action, subject)) throw new AccessDeniedError(action);
}

/**
 * Имя актора для чужих журналов аудита (студенческая платформа не хранит
 * профили сотрудников CRM — только строку с тем, кто принял решение).
 */
export async function actorDisplayName(actor: Actor): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { fullName: true, email: true },
  });
  return user?.fullName ?? user?.email ?? actor.id;
}
