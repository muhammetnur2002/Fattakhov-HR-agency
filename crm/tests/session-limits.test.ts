/**
 * Срок сессии, который задаёт владелец: от 20 минут до 30 суток,
 * отдельно для сотрудников агентства и для клиентов.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "", issuedAt: 0 }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: state.userId, issuedAt: state.issuedAt } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import type { Actor } from "@/lib/access";
import { AccessDeniedError } from "@/lib/access";
import { hashPassword } from "@/lib/auth/password";
import { requireActor } from "@/lib/auth/session";
import {
  MIN_SESSION_MINUTES,
  SESSION_CHOICES,
  isSessionTooOld,
  parseSessionMinutes,
  readSessionLimits,
  sessionMaxAgeSeconds,
} from "@/lib/auth/session-policy";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  SessionSettingsError,
  getSessionLimits,
  setSessionLimits,
} from "@/lib/services/session-settings";

const MARK = "test-sesslimits";
const ORG = "org_fattakhov";
const nowSec = () => Math.floor(Date.now() / 1000);

let originalSettings: unknown;

const owner = (): Actor => ({ id: "owner-x", organizationId: ORG, role: "OWNER", clientId: null, grants: [] });
const recruiter = (): Actor => ({ id: "rec-x", organizationId: ORG, role: "RECRUITER", clientId: null, grants: [] });

beforeAll(async () => {
  originalSettings = (await db.organization.findUniqueOrThrow({ where: { id: ORG }, select: { settings: true } })).settings;
});

async function restore() {
  await db.organization.update({ where: { id: ORG }, data: { settings: originalSettings as never } });
}

beforeEach(async () => {
  await restore();
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
});

afterAll(async () => {
  await restore();
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
  await db.$disconnect();
});

describe("границы и разбор", () => {
  it("20 минут — нижняя граница, меньше и мусор отклоняются", () => {
    expect(MIN_SESSION_MINUTES).toBe(20);
    expect(parseSessionMinutes(20)).toBe(20);
    expect(parseSessionMinutes("20")).toBe(20);
    expect(parseSessionMinutes(30 * 24 * 60)).toBe(30 * 24 * 60);
    for (const bad of [19, 0, -5, 1.5, 30 * 24 * 60 + 1, "abc", "", null, undefined, NaN]) {
      expect(parseSessionMinutes(bad)).toBeNull();
    }
  });

  it("все варианты из списка настроек допустимы, и 20 минут среди них первый", () => {
    expect(SESSION_CHOICES[0].minutes).toBe(20);
    for (const choice of SESSION_CHOICES) expect(parseSessionMinutes(choice.minutes)).toBe(choice.minutes);
  });

  it("из настроек организации читаются только допустимые значения", () => {
    expect(readSessionLimits({ sessionMinutesAgency: 20, sessionMinutesClient: 600 })).toEqual({ agency: 20, client: 600 });
    expect(readSessionLimits({ sessionMinutesAgency: 5, sessionMinutesClient: "мусор" })).toEqual({ agency: null, client: null });
    expect(readSessionLimits(null)).toEqual({ agency: null, client: null });
    expect(readSessionLimits("строка")).toEqual({ agency: null, client: null });
  });

  it("предел владельца сильнее умолчания, без него действует умолчание", () => {
    expect(sessionMaxAgeSeconds("agency", { agency: 20, client: null })).toBe(20 * 60);
    expect(sessionMaxAgeSeconds("client", { agency: 20, client: null })).toBe(14 * 24 * 3600);
    expect(isSessionTooOld(nowSec() - 21 * 60, "agency", Date.now(), { agency: 20, client: null })).toBe(true);
    expect(isSessionTooOld(nowSec() - 19 * 60, "agency", Date.now(), { agency: 20, client: null })).toBe(false);
  });
});

describe("настройка владельцем", () => {
  it("владелец сохраняет, пустое значение возвращает умолчание, чужие настройки не страдают", async () => {
    const before = (await db.organization.findUniqueOrThrow({ where: { id: ORG }, select: { settings: true } })).settings as Record<string, unknown>;

    expect(await setSessionLimits(owner(), { agency: "20", client: "" })).toEqual({ agency: 20, client: null });
    expect(await getSessionLimits(ORG)).toEqual({ agency: 20, client: null });

    const after = (await db.organization.findUniqueOrThrow({ where: { id: ORG }, select: { settings: true } })).settings as Record<string, unknown>;
    expect(after.sessionMinutesAgency).toBe(20);
    expect("sessionMinutesClient" in after).toBe(false);
    // остальные настройки организации остались прежними
    for (const [key, value] of Object.entries(before)) {
      if (key !== "sessionMinutesAgency" && key !== "sessionMinutesClient") expect(after[key]).toEqual(value);
    }

    expect(await setSessionLimits(owner(), { agency: "", client: "" })).toEqual({ agency: null, client: null });
    expect(await getSessionLimits(ORG)).toEqual({ agency: null, client: null });
  });

  it("меньше 20 минут и мусор отклоняются, ничего не записывается", async () => {
    await expect(setSessionLimits(owner(), { agency: "10", client: "" })).rejects.toBeInstanceOf(SessionSettingsError);
    await expect(setSessionLimits(owner(), { agency: "", client: "abc" })).rejects.toBeInstanceOf(SessionSettingsError);
    expect(await getSessionLimits(ORG)).toEqual({ agency: null, client: null });
  });

  it("остальным ролям нельзя", async () => {
    await expect(setSessionLimits(recruiter(), { agency: "20", client: "" })).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await getSessionLimits(ORG)).toEqual({ agency: null, client: null });
  });
});

describe("предел владельца на живой сессии", () => {
  it("сессия клиента старше предела отклоняется, моложе — проходит; смена предела действует сразу", async () => {
    const client = await db.client.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const user = await db.user.create({
      data: {
        organizationId: ORG,
        email: `${MARK}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        fullName: "Тест Предел",
        role: "CLIENT_ADMIN",
        clientId: client.id,
        passwordHash: await hashPassword("kofe-s-molokom-v-pyatnitsu"),
      },
      select: { id: true },
    });
    state.userId = user.id;

    // сессия 25 минут назад: по умолчанию (14 суток) живёт
    state.issuedAt = nowSec() - 25 * 60;
    expect((await requireActor()).id).toBe(user.id);

    // владелец поставил 20 минут для клиентов — та же сессия тут же перестаёт действовать
    await setSessionLimits(owner(), { agency: "", client: "20" });
    await expect(requireActor()).rejects.toThrow("REDIRECT:/login");

    // свежая сессия в пределах 20 минут проходит
    state.issuedAt = nowSec() - 15 * 60;
    expect((await requireActor()).id).toBe(user.id);

    // вернули умолчание — старая сессия снова действует
    await setSessionLimits(owner(), { agency: "", client: "" });
    state.issuedAt = nowSec() - 25 * 60;
    expect((await requireActor()).id).toBe(user.id);
  });
});
