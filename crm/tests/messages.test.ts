/**
 * Личная переписка и её изоляция.
 *
 * Главное здесь — не доставка сообщений, а то, кому их вообще можно
 * отправить. Личное сообщение обходит и вакансии, и заявки, поэтому
 * порог видимости у него собственный: ошибка означает, что сотрудник
 * одного клиента пишет сотруднику другого, а заодно видит его имя
 * и должность в списке.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  MessageError,
  canWriteTo,
  countUnreadDirectMessages,
  getCorrespondent,
  listCorrespondents,
  listDirectConversations,
  listDirectMessages,
  markConversationRead,
  sendDirectMessage,
} from "@/lib/services/messages";

const ORG = "org_fattakhov";
const MARK = "[тест]";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const starfishAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

/** Коллега starfishAdmin по той же компании. */
const STARFISH_COLLEAGUE = "usr_cl_hiring1";

const technoparkAdmin: Actor = {
  id: "usr_cl2_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_technopark",
};

async function cleanup() {
  await db.directMessage.deleteMany({ where: { body: { startsWith: MARK } } });
}

afterEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("кому можно писать", () => {
  it("клиент не видит сотрудников другой компании", async () => {
    const forStarfish = await listCorrespondents(starfishAdmin);
    const ids = forStarfish.map((c) => c.id);

    expect(ids).not.toContain(technoparkAdmin.id);
    // Зато видит агентство и своих коллег
    expect(ids).toContain(recruiter.id);
    expect(ids).toContain(STARFISH_COLLEAGUE);
  });

  it("агентство видит и клиентов, и коллег", async () => {
    const ids = (await listCorrespondents(recruiter)).map((c) => c.id);

    expect(ids).toContain(starfishAdmin.id);
    expect(ids).toContain(technoparkAdmin.id);
  });

  it("себя в списке нет", async () => {
    const ids = (await listCorrespondents(recruiter)).map((c) => c.id);
    expect(ids).not.toContain(recruiter.id);
  });

  it("точечная проверка совпадает со списком", async () => {
    expect(await canWriteTo(starfishAdmin, technoparkAdmin.id)).toBe(false);
    expect(await canWriteTo(starfishAdmin, recruiter.id)).toBe(true);
    expect(await canWriteTo(starfishAdmin, STARFISH_COLLEAGUE)).toBe(true);
    expect(await canWriteTo(recruiter, technoparkAdmin.id)).toBe(true);
    // Сам себе не пишем
    expect(await canWriteTo(recruiter, recruiter.id)).toBe(false);
  });
});

describe("отправка", () => {
  it("сообщение чужому клиенту не проходит", async () => {
    await expect(
      sendDirectMessage(starfishAdmin, technoparkAdmin.id, `${MARK} привет`),
    ).rejects.toBeInstanceOf(MessageError);

    const sent = await db.directMessage.count({
      where: { body: { startsWith: MARK } },
    });
    expect(sent).toBe(0);
  });

  it("пустое сообщение не проходит", async () => {
    await expect(
      sendDirectMessage(recruiter, starfishAdmin.id, "   "),
    ).rejects.toBeInstanceOf(MessageError);
  });

  it("переписку видят только двое", async () => {
    await sendDirectMessage(
      recruiter,
      starfishAdmin.id,
      `${MARK} видно только нам двоим`,
    );

    const forRecipient = await listDirectMessages(starfishAdmin, recruiter.id);
    expect(forRecipient!.map((m) => m.body)).toContain(
      `${MARK} видно только нам двоим`,
    );

    // Третий человек той же компании переписку не видит
    const forColleague = await listDirectMessages(
      { ...starfishAdmin, id: STARFISH_COLLEAGUE, role: "CLIENT_HIRING" },
      recruiter.id,
    );
    expect(forColleague!.map((m) => m.body)).not.toContain(
      `${MARK} видно только нам двоим`,
    );
  });

  it("недоступный собеседник — не пустая переписка, а отказ", async () => {
    expect(await listDirectMessages(starfishAdmin, technoparkAdmin.id)).toBeNull();
    expect(await getCorrespondent(starfishAdmin, technoparkAdmin.id)).toBeNull();
  });
});

describe("прочитано и непрочитано", () => {
  it("входящее считается непрочитанным, отметка снимает", async () => {
    await sendDirectMessage(recruiter, starfishAdmin.id, `${MARK} первое`);
    await sendDirectMessage(recruiter, starfishAdmin.id, `${MARK} второе`);

    expect(await countUnreadDirectMessages(starfishAdmin)).toBeGreaterThanOrEqual(2);
    // Своё же сообщение отправителю непрочитанным не считается
    expect(await countUnreadDirectMessages(recruiter)).toBe(0);

    await markConversationRead(starfishAdmin, recruiter.id);
    expect(await countUnreadDirectMessages(starfishAdmin)).toBe(0);
  });

  it("беседа попадает в список с последним сообщением", async () => {
    await sendDirectMessage(recruiter, starfishAdmin.id, `${MARK} раньше`);
    await sendDirectMessage(starfishAdmin, recruiter.id, `${MARK} позже`);

    const forRecruiter = await listDirectConversations(recruiter);
    const withClient = forRecruiter.find((c) => c.user.id === starfishAdmin.id);

    expect(withClient).toBeDefined();
    expect(withClient!.lastMessage.body).toBe(`${MARK} позже`);
    // Последнее написал не я — значит fromMe false
    expect(withClient!.lastMessage.fromMe).toBe(false);
    expect(withClient!.unreadCount).toBeGreaterThanOrEqual(1);
  });
});
