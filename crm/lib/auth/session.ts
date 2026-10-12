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
import { resolveTimeZone } from "@/lib/format-date";
import { TWO_FACTOR_SETUP_PATH } from "@/lib/nav";
import { isSessionTooOld, readSessionLimits } from "@/lib/auth/session-policy";
import { twoFactorGate } from "@/lib/services/two-factor";

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
const loadSession = cache(
  async (): Promise<{ actor: Actor; twoFactor: "ok" | "setup"; timeZone: string } | null> => {
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
        timezone: true,
        passwordChangedAt: true,
        totpEnabledAt: true,
        // Предел сессии задаёт владелец (lib/auth/session-policy.ts)
        organization: { select: { settings: true } },
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

    const actor: Actor = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      clientId: user.clientId,
      grants: user.grants,
    };

    // Предельный возраст сессии: украденная cookie не живёт бесконечно,
    // даже если ею пользуются каждый день (см. lib/auth/session-policy.ts)
    const limits = readSessionLimits(user.organization?.settings);
    if (isSessionTooOld(session.user.issuedAt, isAgency(actor) ? "agency" : "client", Date.now(), limits)) {
      return null;
    }

    return {
      actor,
      // Состояние 2FA читается тем же запросом, что и роль: лишней
      // нагрузки ворота не добавляют (см. twoFactorGate)
      twoFactor: twoFactorGate(user),
      // Часовой пояс человека читается тем же запросом: страницы показывают
      // время в нём, а не в зоне процесса (lib/format-date.ts)
      timeZone: resolveTimeZone(user.timezone),
    };
  },
);

/**
 * Часовой пояс текущего пользователя для показа времени. Без входа (и у
 * пустой или неизвестной зоны) — запасная, одинаковая на сервере и в браузере.
 */
export const getUserTimeZone = cache(async (): Promise<string> => {
  return (await loadSession())?.timeZone ?? resolveTimeZone(null);
});

export const getActor = cache(async (): Promise<Actor | null> => {
  return (await loadSession())?.actor ?? null;
});

/**
 * Актор для маршрутов (route.ts), отдающих данные и действия кабинета.
 *
 * Как getActor, но сотруднику агентства без включённой 2FA — null: у
 * маршрутов нет макета /a, который отправил бы его на настройку, и без
 * этой проверки файлы, выгрузки и вход на студенческую платформу
 * (students/open) оставались бы открытыми для сессии без второго фактора.
 * Маршрутам, которым нужна голая сессия (пульс «в сети»), годится getActor;
 * tests/route-actor-guard.test.ts следит, чтобы остальные не брали его
 * напрямую. Страницы и действия берут актора через requireActor — там
 * ворота уже есть.
 */
export const getGatedActor = cache(async (): Promise<Actor | null> => {
  const session = await loadSession();
  if (!session || session.twoFactor === "setup") return null;
  return session.actor;
});

/**
 * Актор или редирект на вход. Использовать во всех защищённых страницах.
 *
 * Сотрудника агентства без включённой 2FA здесь же отправляет на экран
 * настройки: ворота стоят не только в макете /a, но и в каждом действии
 * и странице, которые берут актора, — иначе серверные действия и маршруты,
 * минующие макет, работали бы для сессии без второго фактора. Экран
 * настройки и его действия просят актора с allowWithoutTwoFactor.
 * Клиентов правило не касается.
 */
export async function requireActor(
  options: { allowWithoutTwoFactor?: boolean } = {},
): Promise<Actor> {
  const session = await loadSession();
  if (!session) redirect("/login");
  if (session.twoFactor === "setup" && !options.allowWithoutTwoFactor) {
    redirect(TWO_FACTOR_SETUP_PATH);
  }
  return session.actor;
}

export async function requireAgencyActor(
  options: { allowWithoutTwoFactor?: boolean } = {},
): Promise<Actor> {
  const actor = await requireActor(options);
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
