import { CLIENT_ROLES, visibleVacanciesFilter, type Actor } from "@/lib/access";
import { hashPassword } from "@/lib/auth/password";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/services/agreements";
import type { ClientInput } from "@/lib/validation/client";

export class ClientUserError extends Error {}

/**
 * Своя команда — для кабинета клиента (org.manageClientUsers).
 *
 * Ровно те же два запроса, что и в getClient, но без агентской части
 * (договоры, счётчик вакансий): клиенту на странице настроек это не
 * нужно, а тянуть лишнее ради переиспользования одной функции того
 * не стоит.
 */
export async function listClientTeam(clientId: string) {
  const [users, invitations] = await Promise.all([
    prisma.user.findMany({
      where: { clientId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        position: true,
        lastLoginAt: true,
      },
    }),

    prisma.invitation.findMany({
      where: { clientId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, token: true, expiresAt: true },
    }),
  ]);

  return { users, invitations };
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
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        position: true,
        lastLoginAt: true,
      },
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

    // Неиспользованные приглашения — чтобы менеджер видел, кого уже позвали
    prisma.invitation.findMany({
      where: { clientId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, token: true, expiresAt: true },
    }),

    prisma.vacancy.count({
      where: { ...visibleVacanciesFilter(actor), clientId },
    }),
  ]);

  return {
    ...client,
    users,
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

export async function createClient(actor: Actor, input: ClientInput) {
  return prisma.client.create({
    data: {
      ...input,
      organizationId: actor.organizationId,
      // Новый клиент — лид: активным его делает подтверждённый договор
      status: "LEAD",
      accountManagerId: input.accountManagerId ?? actor.id,
    },
    select: { id: true },
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
    select: { id: true },
  });
  if (!target) throw new ClientUserError("Пользователь не найден");

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(params.password),
      passwordChangedAt: new Date(),
    },
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
