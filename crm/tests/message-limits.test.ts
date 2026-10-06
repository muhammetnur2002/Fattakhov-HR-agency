/**
 * Потолок на личные сообщения.
 *
 * Клиенту без договора можно написать команде агентства — так решил
 * владелец, и это правило видимости остаётся. Но без потолка любая
 * зарегистрировавшаяся компания засыпала бы сотрудников; поэтому минутный
 * потолок всем, а суточный — клиентам.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: { id: "u1", organizationId: "o", role: "CLIENT_ADMIN", clientId: "c" } as {
    id: string;
    organizationId: string;
    role: string;
    clientId: string | null;
  },
  sent: 0,
}));

vi.mock("@/lib/auth/session", () => ({ requireActor: async () => state.actor }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
}));
vi.mock("@/lib/services/messages", () => ({
  MessageError: class MessageError extends Error {},
  markConversationRead: async () => {},
  sendDirectMessage: async () => {
    state.sent++;
  },
}));

import { sendMessageAction } from "@/app/actions/messages";
import { prismaRaw as db } from "@/lib/db/prisma";
import { resetRateLimits } from "@/lib/security/rate-limit";

function form(): FormData {
  const data = new FormData();
  data.set("recipientId", "someone");
  data.set("body", "Здравствуйте");
  return data;
}

const send = () => sendMessageAction({}, form());

beforeEach(async () => {
  resetRateLimits();
  state.sent = 0;
  await db.authFailure.deleteMany({ where: { key: { startsWith: "message:day:" } } });
  // Только часы: настоящие таймеры нужны драйверу базы (суточный счётчик живёт в ней)
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await db.authFailure.deleteMany({ where: { key: { startsWith: "message:day:" } } });
  await db.$disconnect();
});

describe("минутный потолок", () => {
  it("тридцать сообщений в минуту проходят, тридцать первое — нет", async () => {
    state.actor = { id: "staff", organizationId: "o", role: "RECRUITER", clientId: null };
    for (let i = 0; i < 30; i++) expect(await send()).toEqual({ ok: true });

    const blocked = await send();
    expect(blocked.error).toMatch(/Слишком много попыток/);
    expect(state.sent).toBe(30);

    // Через минуту окно освободилось
    vi.setSystemTime(Date.now() + 61_000);
    expect(await send()).toEqual({ ok: true });
  });

  it("у каждого человека свой счётчик", async () => {
    state.actor = { id: "a", organizationId: "o", role: "RECRUITER", clientId: null };
    for (let i = 0; i < 30; i++) await send();
    expect((await send()).error).toBeTruthy();

    state.actor = { id: "b", organizationId: "o", role: "RECRUITER", clientId: null };
    expect(await send()).toEqual({ ok: true });
  });
});

describe("суточный потолок клиента", () => {
  it("двести сообщений за сутки проходят, двести первое — нет", { timeout: 60_000 }, async () => {
    state.actor = { id: "client", organizationId: "o", role: "CLIENT_ADMIN", clientId: "c" };
    for (let i = 0; i < 200; i++) {
      expect(await send(), `сообщение ${i + 1}`).toEqual({ ok: true });
      // Минутный потолок обходим временем: проверяется именно суточный
      if ((i + 1) % 30 === 0) vi.setSystemTime(Date.now() + 61_000);
    }
    vi.setSystemTime(Date.now() + 61_000);

    const blocked = await send();
    expect(blocked.error).toMatch(/Сегодня вы отправили много сообщений/);
    expect(state.sent).toBe(200);
  });

  it("сотрудников агентства суточный потолок не касается", { timeout: 60_000 }, async () => {
    state.actor = { id: "staff2", organizationId: "o", role: "RECRUITER", clientId: null };
    for (let i = 0; i < 210; i++) {
      expect(await send(), `сообщение ${i + 1}`).toEqual({ ok: true });
      if ((i + 1) % 30 === 0) vi.setSystemTime(Date.now() + 61_000);
    }
    expect(state.sent).toBe(210);
  });
});
