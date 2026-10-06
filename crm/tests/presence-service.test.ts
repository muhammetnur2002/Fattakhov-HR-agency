/**
 * Пульс присутствия: запись lastSeenAt (lib/services/presence.ts) и маршрут
 * /api/presence.
 *
 * Главное — не нагрузка и не приватность: запись не чаще раза в минуту на
 * человека (иначе каждая вкладка писала бы в базу каждую минуту), и у
 * владельца, скрывшего статус, отметка не пишется вовсе и прежняя стирается;
 * у всех остальных статус пишется всегда, что бы ни лежало в showPresence.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import {
  resetPresenceThrottle,
  setShowPresence,
  touchPresence,
  WRITE_INTERVAL_MS,
} from "@/lib/services/presence";

const state = vi.hoisted(() => ({
  actor: null as null | { id: string; organizationId: string; role: string; clientId: string | null },
  rateAllowed: true,
}));
vi.mock("@/lib/auth/session", () => ({ getActor: async () => state.actor }));
vi.mock("@/lib/security/guard", () => ({
  guardRate: async () => ({ allowed: state.rateAllowed, retryAfter: 42 }),
  rateLimitMessage: () => "",
}));

import { POST } from "@/app/api/presence/route";
import { prisma } from "@/lib/db/prisma";

const USER = "usr_rec1";
const OTHER = "usr_cl_admin";
const OWNER = "usr_owner";
const T0 = new Date("2026-10-04T18:00:00Z");

async function seen(id: string) {
  return (await db.user.findUniqueOrThrow({ where: { id }, select: { lastSeenAt: true } })).lastSeenAt;
}

async function reset() {
  resetPresenceThrottle();
  await db.user.updateMany({
    where: { id: { in: [USER, OTHER, OWNER] } },
    data: { lastSeenAt: null, showPresence: true },
  });
}

beforeEach(async () => {
  state.actor = { id: USER, organizationId: "org_fattakhov", role: "RECRUITER", clientId: null };
  state.rateAllowed = true;
  await reset();
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await reset();
  await db.$disconnect();
});

describe("запись не чаще раза в минуту", () => {
  it("первый пульс пишет отметку", async () => {
    expect(await touchPresence(USER, T0)).toBe(true);
    expect(await seen(USER)).toEqual(T0);
  });

  it("повтор через 30 секунд не доходит до базы: отметка прежняя", async () => {
    const spy = vi.spyOn(prisma.user, "updateMany");
    await touchPresence(USER, T0);
    expect(spy).toHaveBeenCalledTimes(1);

    expect(await touchPresence(USER, new Date(T0.getTime() + 30_000))).toBe(false);

    expect(await seen(USER)).toEqual(T0);
    // Второго запроса в базу нет вовсе — это и есть «без нагрузки»
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("через минуту пишет снова, даже если пульс пришёл на долю секунды раньше", async () => {
    await touchPresence(USER, T0);
    const next = new Date(T0.getTime() + WRITE_INTERVAL_MS - 400);

    expect(await touchPresence(USER, next)).toBe(true);
    expect(await seen(USER)).toEqual(next);
  });

  it("рубеж в базе: после перезапуска (память пуста) свежая отметка не перезаписывается", async () => {
    await touchPresence(USER, T0);
    resetPresenceThrottle();

    // Процесс «перезапущен», но в базе отметке 20 секунд — условный UPDATE отказывает
    expect(await touchPresence(USER, new Date(T0.getTime() + 20_000))).toBe(false);
    expect(await seen(USER)).toEqual(T0);
  });

  it("у каждого человека своя отметка", async () => {
    await touchPresence(USER, T0);
    expect(await touchPresence(OTHER, new Date(T0.getTime() + 1_000))).toBe(true);
    expect(await seen(OTHER)).toEqual(new Date(T0.getTime() + 1_000));
  });

  it("владелец, скрывший статус, не записывается вовсе", async () => {
    await db.user.update({ where: { id: OWNER }, data: { showPresence: false } });

    expect(await touchPresence(OWNER, T0)).toBe(false);
    expect(await seen(OWNER)).toBeNull();
  });

  it("не владелец с showPresence=false в базе записывается всегда", async () => {
    await db.user.update({ where: { id: USER }, data: { showPresence: false } });
    await db.user.update({ where: { id: OTHER }, data: { showPresence: false } });

    expect(await touchPresence(USER, T0)).toBe(true);
    expect(await touchPresence(OTHER, T0)).toBe(true);
    expect(await seen(USER)).toEqual(T0);
    expect(await seen(OTHER)).toEqual(T0);
  });
});

describe("переключатель «Показывать, что я в сети»", () => {
  it("выключение владельцем стирает прежнюю отметку и закрывает запись", async () => {
    await touchPresence(OWNER, T0);

    expect(await setShowPresence(OWNER, false)).toBe(true);

    const row = await db.user.findUniqueOrThrow({
      where: { id: OWNER },
      select: { showPresence: true, lastSeenAt: true },
    });
    expect(row).toEqual({ showPresence: false, lastSeenAt: null });
    expect(await touchPresence(OWNER, new Date(T0.getTime() + 5 * 60_000))).toBe(false);
  });

  it("включение возвращает запись — первая отметка сразу, без ожидания минуты", async () => {
    await setShowPresence(OWNER, false);
    await setShowPresence(OWNER, true);

    expect(await touchPresence(OWNER, T0)).toBe(true);
    expect(await seen(OWNER)).toEqual(T0);
  });

  it("не владельцу выключить нельзя: false, база не тронута", async () => {
    await touchPresence(USER, T0);

    expect(await setShowPresence(USER, false)).toBe(false);

    const row = await db.user.findUniqueOrThrow({
      where: { id: USER },
      select: { showPresence: true, lastSeenAt: true },
    });
    expect(row).toEqual({ showPresence: true, lastSeenAt: T0 });
  });
});

describe("POST /api/presence", () => {
  it("вошедший — 204 и отметка в базе", async () => {
    const response = await POST();

    expect(response.status).toBe(204);
    expect(await seen(USER)).not.toBeNull();
  });

  it("не владелец с showPresence=false: пульс всё равно пишет отметку", async () => {
    await db.user.update({ where: { id: USER }, data: { showPresence: false } });

    expect((await POST()).status).toBe(204);

    expect(await seen(USER)).not.toBeNull();
  });

  it("владелец с выключенным показом: 204, но отметка не пишется", async () => {
    await db.user.update({ where: { id: OWNER }, data: { showPresence: false } });
    state.actor = { id: OWNER, organizationId: "org_fattakhov", role: "OWNER", clientId: null };

    expect((await POST()).status).toBe(204);

    expect(await seen(OWNER)).toBeNull();
  });

  it("без входа — 401, и никому ничего не пишется", async () => {
    state.actor = null;
    const spy = vi.spyOn(prisma.user, "updateMany");

    const response = await POST();

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("чья отметка — решает сессия: в тело запроса смотреть нечего", async () => {
    state.actor = {
      id: OTHER,
      organizationId: "org_fattakhov",
      role: "CLIENT_ADMIN",
      clientId: "cl_starfish",
    };

    await POST();

    expect(await seen(OTHER)).not.toBeNull();
    expect(await seen(USER)).toBeNull();
  });

  it("слишком частые стуки — 429 с Retry-After, база не трогается", async () => {
    state.rateAllowed = false;
    const spy = vi.spyOn(prisma.user, "updateMany");

    const response = await POST();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(spy).not.toHaveBeenCalled();
  });
});
