import {
  assertCanDo,
  CLIENT_ROLES,
  isClient,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { hashPassword } from "@/lib/auth/password";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/services/agreements";
import { InviteError } from "@/lib/services/invitations";
import { presenceFor } from "@/lib/services/messages";
import type { ClientInput } from "@/lib/validation/client";
import { recordAuthEvent } from "@/lib/services/auth-events";
import { passwordProblem } from "@/lib/validation/password";

export class ClientUserError extends Error {}

/** Сотрудник клиента для списков: поля строки плюс то, что нужно для «в сети». */
const TEAM_USER_SELECT = {
  id: true,
  organizationId: true,
  clientId: true,
  fullName: true,
  email: true,
  role: true,
  position: true,
  lastLoginAt: true,
  showPresence: true,
  lastSeenAt: true,
} as const;

/** Строка человека без сырых полей присутствия — вместо них готовое решение сервера. */
function withPresence<
  U extends {
    id: string;
    organizationId: string;
    clientId: string | null;
    role: string;
    showPresence: boolean;
    lastSeenAt: Date | null;
  },
>(viewer: Actor | undefined, user: U) {
  const { organizationId, clientId, showPresence, lastSeenAt, ...rest } = user;
  const { role } = user;
  return {
    ...rest,
    presence: viewer
      ? presenceFor(viewer, { id: user.id, organizationId, clientId, role, showPresence, lastSeenAt })
      : null,
  };
}

/**
 * Своя команда — для кабинета клиента (org.manageClientUsers).
 *
 * Ровно те же два запроса, что и в getClient, но без агентской части
 * (договоры, счётчик вакансий): клиенту на странице настроек это не
 * нужно, а тянуть лишнее ради переиспользования одной функции того
 * не стоит.
 */
export async function listClientTeam(clientId: string, viewer?: Actor) {
  const [users, invitations] = await Promise.all([
    prisma.user.findMany({
      where: { clientId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: TEAM_USER_SELECT,
    }),

    prisma.invitation.findMany({
      where: { clientId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, token: true, expiresAt: true },
    }),
  ]);

  return {
    // Без смотрящего статус не отдаётся вовсе: presence: null
    users: users.map((user) => withPresence(viewer, user)),
    invitations,
  };
}

/**
 * Отозвать неотвеченное приглашение пользователя клиента.
 *
 * Зачем — то же, что у сотрудников агентства (revokeStaffInvitation):
 * опечатка в адресе. Пока приглашение живо, повторно позвать того же
 * человека нельзя — createInvitation отвечает «на этот адрес уже есть
 * действующее приглашение», — а ссылка из неверного письма всю неделю
 * пускает в кабинет клиента любого, кто её откроет, с указанной ролью.
 * И место в команде из пяти человек оно занимает так же, как принятое.
 *
 * Зовут отсюда обе стороны, и право у них разное: агентство ведёт
 * пользователей любого своего клиента (client.manage), администратор
 * клиента — только своих коллег (org.manageClientUsers, ownClient).
 * Поэтому сторона задаёт и проверку права, и границу поиска. Границу —
 * обязательно: чужая компания должна не находиться вовсе, а не
 * отказывать по правам. Отказ подтвердил бы, что такое приглашение
 * существует (BR-28), а id приглашения виден в разметке своей же
 * страницы и подставляется в форму руками.
 *
 * Удаление физическое, и это не нарушение BR-26: мягкое удаление бережёт
 * историю, а у непринятого приглашения её нет — по нему никто не вошёл
 * и ссылаться на него нечему.
 */
export async function revokeClientInvitation(
  actor: Actor,
  invitationId: string,
): Promise<void> {
  const own = isClient(actor);

  /*
    Клиентский пользователь без компании — в продукте такого нет, но
    ценой одной строки исключаем случай, когда `clientId: null` ниже
    превратит поиск в «любое приглашение сотрудника агентства».
  */
  if (own && !actor.clientId) throw new InviteError("Приглашение не найдено");

  const invitation = await prisma.invitation.findFirst({
    where: {
      id: invitationId,
      organizationId: actor.organizationId,
      acceptedAt: null,
      // Сотрудники агентства сюда не относятся: у них своё право
      // и свой экран (lib/services/staff.ts)
      clientId: own ? actor.clientId : { not: null },
    },
    select: { id: true, clientId: true },
  });
  if (!invitation) throw new InviteError("Приглашение не найдено");

  assertCanDo(actor, own ? "org.manageClientUsers" : "client.manage", {
    clientId: invitation.clientId,
  });

  await prisma.invitation.delete({ where: { id: invitation.id } });
}

/** Список клиентов для кабинета агентства. */
export async function listClients(actor: Actor, filters: { query?: string } = {}) {
  const clients = await prisma.client.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(filters.query && {
        OR: [
          { name: { contains: filters.query, mode: "insensitive" } },
          { city: { contains: filters.query, mode: "insensitive" } },
          { industry: { contains: filters.query, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      city: true,
      industry: true,
      status: true,
      accountManagerId: true,
      _count: { select: { vacancies: true, users: true } },
    },
  });

  // Договоры отдельным запросом: нужен только актуальный статус, а тянуть
  // всю историю в список ради одного бейджа незачем.
  const agreements = await prisma.agreement.findMany({
    where: {
      organizationId: actor.organizationId,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: { clientId: true, status: true },
  });

  const agreementByClient = new Map(agreements.map((a) => [a.clientId, a.status]));

  return clients.map((c) => ({
    ...c,
    agreementStatus: agreementByClient.get(c.id) ?? null,
  }));
}

/**
 * Карточка клиента. Возвращает null, если клиента нет или он в другой
 * организации — вызывающий обязан превратить это в 404 (BR-28).
 */
export async function getClient(actor: Actor, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: actor.organizationId },
    select: {
      id: true,
      name: true,
      legalName: true,
      inn: true,
      industry: true,
      website: true,
      description: true,
      city: true,
      status: true,
      accountManagerId: true,
      createdAt: true,
    },
  });

  if (!client) return null;

  const [users, agreements, invitations, vacancyCount] = await Promise.all([
    prisma.user.findMany({
      where: { clientId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: TEAM_USER_SELECT,
    }),

    prisma.agreement.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        pricingModel: true,
        percentRate: true,
        monthsCount: true,
        fixedAmount: true,
        subscriptionAmount: true,
        subscriptionSlots: true,
        hourlyRate: true,
        guaranteeDays: true,
        prepaymentPercent: true,
        paymentTerms: true,
        status: true,
        startsAt: true,
        acceptedAt: true,
      },
    }),

    // Неиспользованные приглашения — кого клиент уже позвал сам. Без токена:
    // ссылка — пропуск в чужой кабинет, агентству она не нужна (своих людей
    // клиенту оно заводит аккаунтом с паролем), а карточка уходит в браузер
    // целиком — ClientForm получает её как есть
    prisma.invitation.findMany({
      where: { clientId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true },
    }),

    prisma.vacancy.count({
      where: { ...visibleVacanciesFilter(actor), clientId },
    }),
  ]);

  return {
    ...client,
    // «В сети» — только то, что агентству можно видеть (presenceFor); сырые
    // lastSeenAt и showPresence в карточку, уходящую в браузер, не попадают
    users: users.map((user) => withPresence(actor, user)),
    // Ставки — Decimal, а карточку клиента рисует клиентский компонент
    agreements: agreements.map((a) => ({
      ...a,
      percentRate: decimalToNumber(a.percentRate),
      fixedAmount: decimalToNumber(a.fixedAmount),
      subscriptionAmount: decimalToNumber(a.subscriptionAmount),
      hourlyRate: decimalToNumber(a.hourlyRate),
    })),
    invitations,
    vacancyCount,
  };
}

export async function createClient(
  actor: Actor,
  input: ClientInput,
  options: { fromStudentsPlatform?: boolean } = {},
) {
  return prisma.client.create({
    data: {
      ...input,
      organizationId: actor.organizationId,
      // Новый клиент — лид: активным его делает подтверждённый договор
      status: "LEAD",
      accountManagerId: input.accountManagerId ?? actor.id,
      fromStudentsPlatform: options.fromStudentsPlatform ?? false,
    },
    select: { id: true },
  });
}

/** Клиент уже существовал в CRM, но его связали с профилем со студенческой платформы. */
export async function markClientFromStudentsPlatform(clientId: string): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: { fromStudentsPlatform: true },
  });
}

export async function updateClient(
  actor: Actor,
  clientId: string,
  input: ClientInput,
) {
  const existing = await prisma.client.findFirst({
    where: { id: clientId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.client.update({
    where: { id: clientId },
    data: input,
    select: { id: true },
  });
}

/**
 * Аккаунт пользователя клиента. Пароль задаёт аккаунт-менеджер и сообщает
 * его человеку лично — ссылка-приглашение здесь не нужна, вход возможен
 * сразу же.
 *
 * Занятость адреса проверяется под тем же замком, что и у сотрудников
 * агентства (lib/services/staff.ts): без него два одновременных нажатия
 * «Создать» на один адрес завели бы двух пользователей.
 */
export async function createClientUserAccount(params: {
  organizationId: string;
  clientId: string;
  email: string;
  fullName: string;
  password: string;
  role: (typeof CLIENT_ROLES)[number];
}): Promise<{ id: string }> {
  const email = params.email.toLowerCase().trim();
  const passwordHash = await hashPassword(params.password);

  return prismaRaw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${params.organizationId} FOR UPDATE`;

    const taken = await tx.user.findFirst({
      where: { email },
      select: { fullName: true, clientId: true },
    });
    if (taken) {
      const where = taken.clientId ? "в кабинете клиента" : "в агентстве";
      throw new ClientUserError(
        `${email} уже занят: ${taken.fullName}, ${where}. ` +
          `Один адрес — один пользователь. Укажите другой.`,
      );
    }

    return tx.user.create({
      data: {
        organizationId: params.organizationId,
        clientId: params.clientId,
        email,
        fullName: params.fullName.trim(),
        role: params.role,
        passwordHash,
      },
      select: { id: true },
    });
  });
}

/** Аккаунт-менеджер перевыдаёт пароль пользователю клиента, который его забыл. */
export async function resetClientUserPassword(params: {
  organizationId: string;
  clientId: string;
  userId: string;
  password: string;
}): Promise<void> {
  const target = await prisma.user.findFirst({
    where: {
      id: params.userId,
      organizationId: params.organizationId,
      clientId: params.clientId,
    },
    select: { id: true, email: true },
  });
  if (!target) throw new ClientUserError("Пользователь не найден");

  // Правило слабых паролей одно на все формы; почта пользователя в контексте — из базы
  const problem = passwordProblem(params.password, { email: target.email });
  if (problem) throw new ClientUserError(problem);

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(params.password),
      passwordChangedAt: new Date(),
    },
  });

  await recordAuthEvent({
    kind: "PASSWORD_RESET",
    userId: target.id,
    email: target.email,
    details: { method: "by_admin" },
  });
}

/** Сотрудники агентства, которых можно назначить аккаунт-менеджером. */
export async function listAccountManagers(actor: Actor) {
  return prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      role: { in: ["OWNER", "ACCOUNT", "HEAD"] },
      isActive: true,
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true },
  });
}
