/**
 * Кому видно «В сети» и «был(а)…».
 *
 * Статус показывается только тем, кто вправе общаться с человеком — тем же
 * правилом, что решает, кому можно писать (lib/services/messages.ts). Две
 * ошибки здесь неприемлемы: клиент видит активность сотрудников чужой
 * компании, и скрывший статус всё равно виден — даже как «давно». Поэтому
 * проверяется не только список собеседников, но и всё, что ещё отдаёт
 * `lastSeenAt` в браузер: карточка клиента, команда клиента, команда агентства.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { listClientTeam, getClient } from "@/lib/services/clients";
import {
  canCommunicateWith,
  getCorrespondent,
  listCorrespondents,
  listDirectConversations,
  presenceFor,
} from "@/lib/services/messages";
import { effectiveShowPresence } from "@/lib/presence";
import { listStaff } from "@/lib/services/staff";

const ORG = "org_fattakhov";
const MARK = "[тест-присутствие]";

const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const recruiter: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
const starfishAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};
const STARFISH_COLLEAGUE = "usr_cl_hiring1";
const technoparkAdmin: Actor = {
  id: "usr_cl2_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_technopark",
};

const SEEN = new Date("2026-10-04T18:30:00Z");
const TOUCHED = [owner.id, recruiter.id, starfishAdmin.id, STARFISH_COLLEAGUE, technoparkAdmin.id, "usr_head"];

async function setAll(data: { lastSeenAt?: Date | null; showPresence?: boolean }) {
  await db.user.updateMany({ where: { id: { in: TOUCHED } }, data });
}

beforeAll(async () => {
  await setAll({ lastSeenAt: SEEN, showPresence: true });
});

afterAll(async () => {
  await setAll({ lastSeenAt: null, showPresence: true });
  await db.directMessage.deleteMany({ where: { body: { startsWith: MARK } } });
  await db.$disconnect();
});

describe("список собеседников", () => {
  it("клиент видит статус агентства и своих коллег", async () => {
    await setAll({ lastSeenAt: SEEN, showPresence: true });
    const list = await listCorrespondents(starfishAdmin);
    const byId = new Map(list.map((c) => [c.id, c]));

    expect(byId.get(recruiter.id)?.presence).toEqual({ lastSeenAt: SEEN });
    expect(byId.get(STARFISH_COLLEAGUE)?.presence).toEqual({ lastSeenAt: SEEN });
  });

  it("клиент не видит сотрудников другой компании — ни имени, ни статуса", async () => {
    const list = await listCorrespondents(starfishAdmin);

    expect(list.map((c) => c.id)).not.toContain(technoparkAdmin.id);
    // Ни в одной строке ответа нет отметки чужого человека
    expect(JSON.stringify(list)).not.toContain(technoparkAdmin.id);
  });

  it("агентство видит статус и клиентов, и коллег", async () => {
    const byId = new Map((await listCorrespondents(recruiter)).map((c) => [c.id, c]));

    expect(byId.get(starfishAdmin.id)?.presence).toEqual({ lastSeenAt: SEEN });
    expect(byId.get(technoparkAdmin.id)?.presence).toEqual({ lastSeenAt: SEEN });
    expect(byId.get("usr_head")?.presence).toEqual({ lastSeenAt: SEEN });
  });

  it("владелец скрыл статус — в списке, но без статуса: даже «давно» не показывается", async () => {
    await db.user.update({ where: { id: owner.id }, data: { showPresence: false } });
    try {
      const forClient = await listCorrespondents(starfishAdmin);
      const forAgency = await listCorrespondents(recruiter);

      expect(forClient.find((c) => c.id === owner.id)?.presence).toBeNull();
      expect(forAgency.find((c) => c.id === owner.id)?.presence).toBeNull();
      // Остальные не затронуты
      expect(forClient.find((c) => c.id === recruiter.id)?.presence).not.toBeNull();
    } finally {
      await db.user.update({ where: { id: owner.id }, data: { showPresence: true } });
    }
  });

  it("не владелец с showPresence=false в базе всё равно виден: клиент, сотрудник агентства", async () => {
    const ids = [STARFISH_COLLEAGUE, recruiter.id, starfishAdmin.id];
    await db.user.updateMany({ where: { id: { in: ids } }, data: { showPresence: false } });
    try {
      const forClient = await listCorrespondents(starfishAdmin);
      const forAgency = await listCorrespondents(recruiter);

      expect(forClient.find((c) => c.id === STARFISH_COLLEAGUE)?.presence).toEqual({ lastSeenAt: SEEN });
      expect(forClient.find((c) => c.id === recruiter.id)?.presence).toEqual({ lastSeenAt: SEEN });
      expect(forAgency.find((c) => c.id === STARFISH_COLLEAGUE)?.presence).toEqual({ lastSeenAt: SEEN });
      expect(forAgency.find((c) => c.id === starfishAdmin.id)?.presence).toEqual({ lastSeenAt: SEEN });
    } finally {
      await db.user.updateMany({ where: { id: { in: ids } }, data: { showPresence: true } });
    }
  });

  it("человек без единой отметки — статус есть, и это честное «давно» (lastSeenAt: null)", async () => {
    await db.user.update({ where: { id: recruiter.id }, data: { lastSeenAt: null } });
    try {
      const entry = (await listCorrespondents(starfishAdmin)).find((c) => c.id === recruiter.id);
      expect(entry?.presence).toEqual({ lastSeenAt: null });
    } finally {
      await db.user.update({ where: { id: recruiter.id }, data: { lastSeenAt: SEEN } });
    }
  });

  it("себя в списке нет, а у шапки собственной переписки статуса нет", async () => {
    expect((await listCorrespondents(recruiter)).map((c) => c.id)).not.toContain(recruiter.id);
    expect(presenceFor(recruiter, { ...asSource(recruiter.id, null), organizationId: ORG })).toBeNull();
  });
});

describe("шапка беседы", () => {
  it("клиенту — статус агентства; чужой компании — null без утечки", async () => {
    const own = await getCorrespondent(starfishAdmin, recruiter.id);
    expect(own?.presence).toEqual({ lastSeenAt: SEEN });

    expect(await getCorrespondent(starfishAdmin, technoparkAdmin.id)).toBeNull();
  });

  it("владелец скрыл статус: шапка открывается, статуса нет", async () => {
    await db.user.update({ where: { id: owner.id }, data: { showPresence: false } });
    try {
      const header = await getCorrespondent(starfishAdmin, owner.id);
      expect(header).not.toBeNull();
      expect(header?.presence).toBeNull();
    } finally {
      await db.user.update({ where: { id: owner.id }, data: { showPresence: true } });
    }
  });

  it("сотрудник агентства с showPresence=false в базе: статус в шапке есть", async () => {
    await db.user.update({ where: { id: recruiter.id }, data: { showPresence: false } });
    try {
      const header = await getCorrespondent(starfishAdmin, recruiter.id);
      expect(header?.presence).toEqual({ lastSeenAt: SEEN });
    } finally {
      await db.user.update({ where: { id: recruiter.id }, data: { showPresence: true } });
    }
  });
});

describe("список диалогов", () => {
  it("собеседник, которому писать уже нельзя (чужая компания), отдаётся без статуса", async () => {
    // Старая переписка: сообщение от сотрудника другой компании. Через сервис
    // такое не создать (canWriteTo), поэтому — прямо в базе
    await db.directMessage.create({
      data: {
        organizationId: ORG,
        senderId: technoparkAdmin.id,
        recipientId: starfishAdmin.id,
        body: `${MARK} из прошлой жизни`,
      },
    });

    const conversation = (await listDirectConversations(starfishAdmin)).find(
      (c) => c.user.id === technoparkAdmin.id,
    );

    expect(conversation).toBeDefined();
    expect(conversation?.user.presence).toBeNull();
  });

  it("своему собеседнику — статус", async () => {
    await db.directMessage.create({
      data: {
        organizationId: ORG,
        senderId: recruiter.id,
        recipientId: starfishAdmin.id,
        body: `${MARK} привет`,
      },
    });

    const conversation = (await listDirectConversations(starfishAdmin)).find(
      (c) => c.user.id === recruiter.id,
    );

    expect(conversation?.user.presence).toEqual({ lastSeenAt: SEEN });
  });
});

describe("правило видимости едино для списка и для статуса", () => {
  it("canCommunicateWith совпадает с listCorrespondents для каждого человека организации", async () => {
    const everyone = await db.user.findMany({
      where: { organizationId: ORG, isActive: true, deletedAt: null },
      select: { id: true, organizationId: true, clientId: true },
    });

    for (const actor of [recruiter, owner, starfishAdmin, technoparkAdmin]) {
      const listed = new Set((await listCorrespondents(actor)).map((c) => c.id));
      for (const person of everyone) {
        if (person.id === actor.id) continue;
        expect(
          canCommunicateWith(actor, person),
          `${actor.id} → ${person.id}`,
        ).toBe(listed.has(person.id));
      }
    }
  });

  it("человек из другой организации не виден никому, даже агентству", () => {
    const stranger = {
      id: "usr_x",
      organizationId: "org_other",
      clientId: null,
      role: "RECRUITER",
      showPresence: true,
      lastSeenAt: SEEN,
    };
    expect(presenceFor(recruiter, stranger)).toBeNull();
    expect(presenceFor(starfishAdmin, stranger)).toBeNull();
  });

  it("клиент не видит чужого клиента, даже если сам список подсунули", () => {
    const foreign = {
      id: technoparkAdmin.id,
      organizationId: ORG,
      clientId: "cl_technopark",
      role: "CLIENT_ADMIN",
      showPresence: true,
      lastSeenAt: SEEN,
    };
    expect(presenceFor(starfishAdmin, foreign)).toBeNull();
    expect(presenceFor(technoparkAdmin, { ...foreign, id: "x", clientId: "cl_technopark" })).toEqual({ lastSeenAt: SEEN });
    expect(presenceFor(recruiter, foreign)).toEqual({ lastSeenAt: SEEN });
  });
});

describe("остальные места, где человека видно", () => {
  it("карточка клиента у агентства: статус сотрудников клиента (и с showPresence=false в базе), без сырых полей", async () => {
    await setAll({ lastSeenAt: SEEN, showPresence: true });
    await db.user.update({ where: { id: STARFISH_COLLEAGUE }, data: { showPresence: false } });
    try {
      const client = await getClient(recruiter, "cl_starfish");
      const byId = new Map(client!.users.map((u) => [u.id, u]));

      expect(byId.get(starfishAdmin.id)?.presence).toEqual({ lastSeenAt: SEEN });
      expect(byId.get(STARFISH_COLLEAGUE)?.presence).toEqual({ lastSeenAt: SEEN });
      // Сырые поля в браузер не уходят: решение уже принял сервер
      for (const user of client!.users) {
        expect(user).not.toHaveProperty("lastSeenAt");
        expect(user).not.toHaveProperty("showPresence");
        expect(user).not.toHaveProperty("organizationId");
      }
    } finally {
      await db.user.update({ where: { id: STARFISH_COLLEAGUE }, data: { showPresence: true } });
    }
  });

  it("команда клиента: коллега видит статус, агентство — тоже, чужая компания — нет", async () => {
    const forColleague = await listClientTeam("cl_starfish", starfishAdmin);
    const forAgency = await listClientTeam("cl_starfish", recruiter);
    const forStranger = await listClientTeam("cl_starfish", technoparkAdmin);
    const withoutViewer = await listClientTeam("cl_starfish");

    expect(forColleague.users.find((u) => u.id === STARFISH_COLLEAGUE)?.presence).toEqual({ lastSeenAt: SEEN });
    expect(forAgency.users.find((u) => u.id === STARFISH_COLLEAGUE)?.presence).toEqual({ lastSeenAt: SEEN });
    for (const team of [forStranger, withoutViewer]) {
      for (const user of team.users) expect(user.presence).toBeNull();
    }
    // Себя клиент в своей команде «в сети» не видит
    expect(forColleague.users.find((u) => u.id === starfishAdmin.id)?.presence).toBeNull();
  });

  it("команда агентства: статус у не-владельцев (и с showPresence=false), у скрывшего владельца и у себя — нет", async () => {
    await db.user.updateMany({ where: { id: { in: ["usr_head", owner.id] } }, data: { showPresence: false } });
    try {
      // Смотрит рекрутёр: владельца он видит в команде, но тот скрыт
      const { members } = await listStaff(recruiter);
      const byId = new Map(members.map((m) => [m.id, m]));

      expect(byId.get("usr_head")?.presence).toEqual({ lastSeenAt: SEEN });
      expect(byId.get(owner.id)?.presence).toBeNull();
      expect(byId.get(recruiter.id)?.presence).toBeNull();
      for (const member of members) {
        expect(member).not.toHaveProperty("lastSeenAt");
        expect(member).not.toHaveProperty("showPresence");
        if (!member.isActive) expect(member.presence).toBeNull();
      }
    } finally {
      await db.user.updateMany({ where: { id: { in: ["usr_head", owner.id] } }, data: { showPresence: true } });
    }
  });
});

describe("effectiveShowPresence: скрыть статус может только владелец", () => {
  it("владелец — как сохранено; все остальные роли — всегда true", () => {
    expect(effectiveShowPresence({ role: "OWNER", showPresence: false })).toBe(false);
    expect(effectiveShowPresence({ role: "OWNER", showPresence: true })).toBe(true);
    for (const role of ["HEAD", "RECRUITER", "ACCOUNT", "CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"]) {
      expect(effectiveShowPresence({ role, showPresence: false }), role).toBe(true);
      expect(effectiveShowPresence({ role, showPresence: true }), role).toBe(true);
    }
  });

  it("presenceFor: не владельцу с false статус отдаётся, владельцу — нет", () => {
    const base = { organizationId: ORG, lastSeenAt: SEEN, showPresence: false };
    expect(presenceFor(starfishAdmin, { ...base, id: "a", clientId: null, role: "RECRUITER" })).toEqual({
      lastSeenAt: SEEN,
    });
    expect(presenceFor(starfishAdmin, { ...base, id: "b", clientId: "cl_starfish", role: "CLIENT_VIEWER" })).toEqual({
      lastSeenAt: SEEN,
    });
    expect(presenceFor(starfishAdmin, { ...base, id: "c", clientId: null, role: "OWNER" })).toBeNull();
  });
});

function asSource(id: string, clientId: string | null) {
  return { id, organizationId: ORG, clientId, role: "RECRUITER", showPresence: true, lastSeenAt: SEEN };
}
