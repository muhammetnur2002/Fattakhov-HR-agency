/**
 * Переключатель «Показывать, что я в сети» (savePresenceAction).
 *
 * Скрыть статус может только владелец агентства. Выключенная галочка в форму
 * не попадает — отсутствие поля и есть «выключено»; владелец, выключая,
 * скрывается целиком: статус не виден никому, а прежняя отметка «был(а)»
 * стирается. Любой другой (сотрудник агентства, клиент) отклоняется сервером
 * даже при прямом вызове действия: статус у них виден всегда.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: null as unknown as Record<string, unknown>,
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: async () => state.actor }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { savePresenceAction } from "@/app/actions/profile";
import { prismaRaw as db } from "@/lib/db/prisma";
import { listCorrespondents } from "@/lib/services/messages";
import { resetPresenceThrottle, touchPresence } from "@/lib/services/presence";

const ORG = "org_fattakhov";
const owner = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null, grants: [] };
const recruiter = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null, grants: [] };
const clientAdmin = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
  grants: [],
};
const IDS = [owner.id, recruiter.id, clientAdmin.id];

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function row(id: string) {
  return db.user.findUniqueOrThrow({ where: { id }, select: { showPresence: true, lastSeenAt: true } });
}

async function reset() {
  resetPresenceThrottle();
  await db.user.updateMany({
    where: { id: { in: IDS } },
    data: { showPresence: true, lastSeenAt: null },
  });
}

beforeEach(async () => {
  state.actor = owner;
  await reset();
});

afterAll(async () => {
  await reset();
  await db.$disconnect();
});

describe("переключатель в настройках: владелец", () => {
  it("по умолчанию статус включён — у каждого нового пользователя", async () => {
    expect((await row(owner.id)).showPresence).toBe(true);
    expect((await row(recruiter.id)).showPresence).toBe(true);
  });

  it("галочка снята (поля в форме нет) — статус выключен, прежняя отметка стёрта", async () => {
    await touchPresence(owner.id);
    expect((await row(owner.id)).lastSeenAt).not.toBeNull();

    const result = await savePresenceAction({}, form({}));

    expect(result.ok).toContain("Статус скрыт");
    expect(await row(owner.id)).toEqual({ showPresence: false, lastSeenAt: null });
  });

  it("галочка поставлена — статус снова включён", async () => {
    await savePresenceAction({}, form({}));

    const result = await savePresenceAction({}, form({ showPresence: "on" }));

    expect(result.ok).toContain("видят");
    expect((await row(owner.id)).showPresence).toBe(true);
  });

  it("меняется только своя строка", async () => {
    await savePresenceAction({}, form({}));

    expect((await row(owner.id)).showPresence).toBe(false);
    expect((await row(recruiter.id)).showPresence).toBe(true);
    expect((await row(clientAdmin.id)).showPresence).toBe(true);
  });

  it("после выключения владельца не видно другим — ни в сети, ни «давно»", async () => {
    await touchPresence(owner.id);
    await savePresenceAction({}, form({}));

    const listed = await listCorrespondents({
      id: clientAdmin.id,
      organizationId: ORG,
      role: "CLIENT_ADMIN",
      clientId: "cl_starfish",
    });

    expect(listed.find((c) => c.id === owner.id)?.presence).toBeNull();
  });
});

describe("переключатель в настройках: все остальные", () => {
  for (const [name, actor] of [
    ["сотрудник агентства", recruiter],
    ["клиент", clientAdmin],
  ] as const) {
    it(`${name} не может скрыть статус: ошибка, в базе ничего не меняется`, async () => {
      state.actor = actor;
      await touchPresence(actor.id);
      const before = await row(actor.id);

      const result = await savePresenceAction({}, form({}));

      expect(result.error).toMatch(/только владелец агентства/);
      expect(result.ok).toBeUndefined();
      expect(await row(actor.id)).toEqual(before);
      expect(before.showPresence).toBe(true);
      expect(before.lastSeenAt).not.toBeNull();
    });

    it(`${name}: прямой вызов с галочкой тоже отклоняется, чужие строки не тронуты`, async () => {
      state.actor = actor;

      const result = await savePresenceAction({}, form({ showPresence: "on" }));

      expect(result.error).toBeTruthy();
      expect((await row(owner.id)).showPresence).toBe(true);
    });
  }

  it("прежнее скрытие не-владельца (из времени, когда переключатель был у всех) не мешает быть видимым", async () => {
    await db.user.update({ where: { id: recruiter.id }, data: { showPresence: false } });
    await touchPresence(recruiter.id);

    const listed = await listCorrespondents({
      id: clientAdmin.id,
      organizationId: ORG,
      role: "CLIENT_ADMIN",
      clientId: "cl_starfish",
    });

    const seen = (await row(recruiter.id)).lastSeenAt;
    expect(seen).not.toBeNull();
    expect(listed.find((c) => c.id === recruiter.id)?.presence).toEqual({ lastSeenAt: seen });
  });
});
