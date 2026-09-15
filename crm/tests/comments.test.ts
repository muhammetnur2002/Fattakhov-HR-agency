/**
 * Комментарии и порог видимости.
 *
 * Внутренняя переписка рекрутеров — самое чувствительное, что есть
 * в системе после контактов кандидата. Один пропущенный фильтр, и клиент
 * читает, что о нём думают. Поэтому проверяется и выборка, и запись.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  CommentError,
  createComment,
  deleteComment,
  editComment,
  listApplicationComments,
  listConversations,
  markCommentsRead,
} from "@/lib/services/comments";

const ORG = "org_fattakhov";
/** Заявка представленного кандидата — клиент её видит. */
const APPLICATION = "app_13";
/** Вакансия заявки APPLICATION, клиент cl_starfish. */
const VACANCY = "vac_1";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

const clientAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

const clientViewer: Actor = {
  id: "usr_cl_viewer",
  organizationId: ORG,
  role: "CLIENT_VIEWER",
  clientId: "cl_starfish",
};

const otherClientAdmin: Actor = {
  id: "usr_cl2_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_technopark",
};

const MARK = "[тест]";

async function cleanup() {
  const ids = (
    await db.comment.findMany({
      where: { body: { startsWith: MARK } },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (ids.length === 0) return;

  await db.commentRead.deleteMany({ where: { commentId: { in: ids } } });
  // Сначала ответы, потом родители — иначе упрёмся в внешний ключ
  await db.comment.deleteMany({ where: { parentId: { in: ids } } });
  await db.comment.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("порог видимости переписки", () => {
  it("клиент не получает внутренние комментарии", async () => {
    await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} кандидат торгуется, реальный потолок 250`,
      visibility: "INTERNAL",
    });
    await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} готов выйти через две недели`,
      visibility: "SHARED",
    });

    const forClient = await listApplicationComments(clientAdmin, APPLICATION);
    const forAgency = await listApplicationComments(recruiter, APPLICATION);

    const clientBodies = forClient!.map((c) => c.body);
    expect(clientBodies).toContain(`${MARK} готов выйти через две недели`);
    expect(clientBodies.join(" ")).not.toContain("торгуется");

    // Агентство видит оба
    expect(forAgency!.length).toBeGreaterThan(forClient!.length);
    expect(forAgency!.some((c) => c.visibility === "INTERNAL")).toBe(true);
    expect(forClient!.every((c) => c.visibility === "SHARED")).toBe(true);
  });

  it("чужой клиент не получает переписку вообще", async () => {
    const result = await listApplicationComments(
      otherClientAdmin,
      APPLICATION,
    );
    // null → страница отдаст 404 (BR-28)
    expect(result).toBeNull();
  });
});

describe("кто что может написать", () => {
  it("клиент не может создать внутренний комментарий", async () => {
    await expect(
      createComment(clientAdmin, {
        applicationId: APPLICATION,
        body: `${MARK} попытка`,
        visibility: "INTERNAL",
      }),
    ).rejects.toThrow(CommentError);
  });

  it("наблюдатель не пишет вовсе", async () => {
    await expect(
      createComment(clientViewer, {
        applicationId: APPLICATION,
        body: `${MARK} попытка наблюдателя`,
        visibility: "SHARED",
      }),
    ).rejects.toThrow(/Наблюдатель/);
  });

  it("ответ во внутренней ветке не может стать общим", async () => {
    // Иначе клиент увидит реплику без исходного сообщения и не поймёт,
    // о чём речь — а рекрутер не заметит, что вынес внутренний контекст
    const parent = await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} внутренняя ветка`,
      visibility: "INTERNAL",
    });

    await expect(
      createComment(recruiter, {
        applicationId: APPLICATION,
        parentId: parent.id,
        body: `${MARK} ответ наружу`,
        visibility: "SHARED",
      }),
    ).rejects.toThrow(/не может быть виден клиенту/);
  });

  it("ответ во внутренней ветке остаётся внутренним", async () => {
    const parent = await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} внутренняя ветка 2`,
      visibility: "INTERNAL",
    });

    const reply = await createComment(recruiter, {
      applicationId: APPLICATION,
      parentId: parent.id,
      body: `${MARK} внутренний ответ`,
      visibility: "INTERNAL",
    });

    expect(reply.id).toBeTruthy();

    const forClient = await listApplicationComments(clientAdmin, APPLICATION);
    expect(forClient!.map((c) => c.id)).not.toContain(reply.id);
  });

  it("ответ нельзя подвесить к комментарию из другой заявки", async () => {
    const parent = await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} родитель`,
      visibility: "SHARED",
    });

    await expect(
      createComment(recruiter, {
        applicationId: "app_14",
        parentId: parent.id,
        body: `${MARK} чужой ответ`,
        visibility: "SHARED",
      }),
    ).rejects.toThrow(/не найдена/);
  });

  it("пустой комментарий не сохраняется", async () => {
    await expect(
      createComment(recruiter, {
        applicationId: APPLICATION,
        body: "   ",
        visibility: "SHARED",
      }),
    ).rejects.toThrow(CommentError);
  });
});

describe("правка и удаление", () => {
  it("править можно только свой комментарий", async () => {
    const own = await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} мой`,
      visibility: "SHARED",
    });

    await editComment(recruiter, own.id, `${MARK} мой, поправленный`);
    const edited = await db.comment.findUnique({
      where: { id: own.id },
      select: { body: true, editedAt: true },
    });
    expect(edited?.body).toBe(`${MARK} мой, поправленный`);
    expect(edited?.editedAt).not.toBeNull();

    // Чужой — нельзя, даже владельцу
    await expect(
      editComment(owner, own.id, `${MARK} подмена`),
    ).rejects.toThrow(/только свои/);
  });

  it("владелец может удалить чужой комментарий, рекрутер — нет", async () => {
    const byOwner = await createComment(owner, {
      applicationId: APPLICATION,
      body: `${MARK} от владельца`,
      visibility: "SHARED",
    });

    await expect(deleteComment(recruiter, byOwner.id)).rejects.toThrow(
      /автор или владелец/,
    );

    await deleteComment(owner, byOwner.id);

    // Мягкое удаление: запись осталась, но из выборок ушла (BR-26)
    const still = await db.comment.findUnique({
      where: { id: byOwner.id },
      select: { deletedAt: true },
    });
    expect(still?.deletedAt).not.toBeNull();

    const visible = await listApplicationComments(recruiter, APPLICATION);
    expect(visible!.map((c) => c.id)).not.toContain(byOwner.id);
  });
});

describe("прочитано и непрочитано", () => {
  it("свежий комментарий помечается непрочитанным, отметка снимает", async () => {
    const created = await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} для проверки прочтения`,
      visibility: "SHARED",
    });

    const before = await listApplicationComments(clientAdmin, APPLICATION);
    expect(before!.find((c) => c.id === created.id)?.isRead).toBe(false);

    await markCommentsRead(clientAdmin, [created.id]);

    const after = await listApplicationComments(clientAdmin, APPLICATION);
    expect(after!.find((c) => c.id === created.id)?.isRead).toBe(true);
  });

  it("повторная отметка не падает", async () => {
    const created = await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} дважды прочитанный`,
      visibility: "SHARED",
    });

    await markCommentsRead(clientAdmin, [created.id]);
    await expect(
      markCommentsRead(clientAdmin, [created.id]),
    ).resolves.toBeUndefined();
  });
});

describe("список переписок (Сообщения)", () => {
  it("внутренняя переписка не показывается клиенту как последнее сообщение, но видна агентству", async () => {
    await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} только для своих`,
      visibility: "INTERNAL",
    });

    const forClient = await listConversations(clientAdmin);
    const forAgency = await listConversations(recruiter);

    const clientThread = forClient.find(
      (c) => c.type === "application" && c.id === APPLICATION,
    );
    const agencyThread = forAgency.find(
      (c) => c.type === "application" && c.id === APPLICATION,
    );

    expect(clientThread?.lastMessage.body).not.toContain("только для своих");
    expect(agencyThread?.lastMessage.body).toContain("только для своих");
  });

  it("чужой клиент не видит переписку", async () => {
    await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} видно только старфишу`,
      visibility: "SHARED",
    });

    const conversations = await listConversations(otherClientAdmin);
    expect(
      conversations.some((c) => c.type === "application" && c.id === APPLICATION),
    ).toBe(false);
  });

  it("непрочитанное считается по чужим сообщениям, свои не в счёт", async () => {
    await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} первое непрочитанное`,
      visibility: "SHARED",
    });
    await createComment(recruiter, {
      applicationId: APPLICATION,
      body: `${MARK} второе непрочитанное`,
      visibility: "SHARED",
    });

    const conversations = await listConversations(clientAdmin);
    const thread = conversations.find(
      (c) => c.type === "application" && c.id === APPLICATION,
    );
    expect(thread?.unreadCount).toBeGreaterThanOrEqual(2);

    // Собственный автор не считает свои сообщения непрочитанными
    const ownView = await listConversations(recruiter);
    const ownThread = ownView.find(
      (c) => c.type === "application" && c.id === APPLICATION,
    );
    expect(ownThread?.unreadCount).toBe(0);
  });

  it("обсуждение вакансии попадает в список отдельной строкой от заявки", async () => {
    await createComment(recruiter, {
      vacancyId: VACANCY,
      body: `${MARK} вопрос по брифу`,
      visibility: "SHARED",
    });

    const conversations = await listConversations(clientAdmin);
    const thread = conversations.find(
      (c) => c.type === "vacancy" && c.id === VACANCY,
    );
    expect(thread).toBeDefined();
    expect(thread?.lastMessage.body).toContain("вопрос по брифу");
  });
});
