/**
 * Беседы с откликнувшимися студентами и черновики (кабинет клиента,
 * «Студенческая платформа» → «Сообщения»).
 *
 * Правило списка: беседа показывается, только если в ней есть хотя бы одно
 * сообщение или у этого пользователя CRM есть непустой черновик. Просто открытая
 * анкета откликнувшегося студента беседы в списке не создаёт. Черновик —
 * запись на стороне CRM на пару «пользователь — отклик»: студент его не видит,
 * после отправки он удаляется, чужой отклик сохранить нельзя.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: {
    id: "test_drf_user1",
    organizationId: "org_fattakhov",
    role: "CLIENT_ADMIN",
    clientId: "test_drf_client",
    grants: [],
  } as Record<string, unknown>,
  rateAllowed: true,
  /** Отклики, которые платформа отдаёт этому клиенту; всё остальное для неё чужое. */
  threads: [] as Array<Record<string, unknown>>,
  sent: [] as Array<{ applicationId: string; body: string }>,
  sendFails: false,
}));

vi.mock("@/lib/auth/session", () => ({
  requireClientActor: async () => state.actor,
  authorize: () => {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/security/guard", () => ({
  guardRate: async () => ({ allowed: state.rateAllowed, retryAfter: 30 }),
  rateLimitMessage: () => "Слишком много попыток. Попробуйте через минуту.",
}));
vi.mock("@/lib/students-service", () => ({
  fetchStudentThreads: async () => state.threads,
  fetchStudentThread: async (_clientId: string, applicationId: string) =>
    state.threads.find((t) => t.applicationId === applicationId) ?? null,
  sendStudentMessage: async (input: { applicationId: string; body: string }) => {
    if (state.sendFails) return { error: { error: "Платформа недоступна" } };
    state.sent.push({ applicationId: input.applicationId, body: input.body });
    return {};
  },
  markStudentThreadRead: async () => {},
  StudentsServiceError: class extends Error {},
}));

import {
  loadThreadAction,
  loadThreadsAction,
  saveStudentDraftAction,
  sendStudentMessageAction,
} from "@/app/(client)/students/actions";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  DRAFT_MAX_LENGTH,
  deleteStudentDraft,
  getStudentDraft,
  listStudentDrafts,
  saveStudentDraft,
} from "@/lib/services/student-drafts";
import { anonymizeUser } from "@/lib/services/account-deletion";
import { buildThreadList, draftPreview } from "@/lib/students-threads";

const ORG = "org_fattakhov";
const CLIENT = "test_drf_client";
const U1 = "test_drf_user1";
const U2 = "test_drf_user2";

function thread(id: string, extra: Record<string, unknown> = {}) {
  return {
    applicationId: id,
    vacancyId: `vac_${id}`,
    vacancyTitle: "Бариста",
    counterpartName: `Студент ${id}`,
    counterpartSubtitle: "МГУ",
    status: "NEW",
    lastMessageBody: null,
    lastMessageAuthor: null,
    lastMessageAt: null,
    unread: 0,
    canWrite: true,
    lockedReason: null,
    ...extra,
  };
}

async function cleanup() {
  await db.studentMessageDraft.deleteMany({ where: { userId: { in: [U1, U2] } } });
  await db.user.deleteMany({ where: { id: { in: [U1, U2] } } });
  await db.client.deleteMany({ where: { id: CLIENT } });
}

beforeEach(async () => {
  await cleanup();
  await db.client.create({ data: { id: CLIENT, organizationId: ORG, name: "test_drf клиент", status: "LEAD" } });
  await db.user.createMany({
    data: [
      { id: U1, organizationId: ORG, email: "u1@test-drf.example", fullName: "Первый", role: "CLIENT_ADMIN", clientId: CLIENT },
      { id: U2, organizationId: ORG, email: "u2@test-drf.example", fullName: "Второй", role: "CLIENT_HIRING", clientId: CLIENT },
    ],
  });
  state.actor = { ...state.actor, id: U1 };
  state.rateAllowed = true;
  state.sent = [];
  state.sendFails = false;
  state.threads = [thread("app_a"), thread("app_b"), thread("app_c")];
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("список бесед: что показывать", () => {
  const drafts = (...items: Array<[string, string, string?]>) =>
    items.map(([applicationId, body, updatedAt]) => ({
      applicationId,
      body,
      updatedAt: updatedAt ?? "2026-10-05T10:00:00.000Z",
    }));

  it("беседа без сообщений и без черновика скрыта", () => {
    const items = buildThreadList(state.threads as never, []);
    expect(items).toEqual([]);
  });

  it("пустой или пробельный черновик беседу не показывает", () => {
    const items = buildThreadList(state.threads as never, drafts(["app_a", "   \n"]));
    expect(items).toEqual([]);
  });

  it("беседа с сообщением показана, даже если писал только студент", () => {
    const withMessage = thread("app_a", {
      lastMessageBody: "Здравствуйте!",
      lastMessageAuthor: "STUDENT",
      lastMessageAt: "2026-10-05T09:00:00.000Z",
      unread: 1,
    });
    const items = buildThreadList([withMessage, thread("app_b")] as never, []);
    expect(items.map((t) => t.applicationId)).toEqual(["app_a"]);
    expect(items[0].draft).toBeNull();
    expect(items[0].unread).toBe(1);
  });

  it("беседа с черновиком показана с текстом черновика, без непрочитанного", () => {
    const items = buildThreadList(state.threads as never, drafts(["app_b", "Добрый день, приглашаем"]));
    expect(items.map((t) => t.applicationId)).toEqual(["app_b"]);
    expect(items[0].draft).toBe("Добрый день, приглашаем");
    expect(items[0].unread).toBe(0);
  });

  it("черновик чужого отклика (которого платформа не отдала) в список не попадает", () => {
    const items = buildThreadList(state.threads as never, drafts(["app_foreign", "Не мой отклик"]));
    expect(items).toEqual([]);
  });

  it("сортировка по последней активности: сообщение или обновление черновика", () => {
    const list = [
      thread("app_a", { lastMessageBody: "Старое", lastMessageAuthor: "STUDENT", lastMessageAt: "2026-10-05T08:00:00.000Z" }),
      thread("app_b"),
      thread("app_c", { lastMessageBody: "Новое", lastMessageAuthor: "EMPLOYER", lastMessageAt: "2026-10-05T10:00:00.000Z" }),
    ];
    const items = buildThreadList(list as never, drafts(["app_b", "Черновик свежее всех", "2026-10-05T11:00:00.000Z"]));
    expect(items.map((t) => t.applicationId)).toEqual(["app_b", "app_c", "app_a"]);
  });

  it("у беседы и с сообщениями, и с черновиком активность — позднее из двух", () => {
    const list = [
      thread("app_a", { lastMessageBody: "Тут", lastMessageAuthor: "STUDENT", lastMessageAt: "2026-10-05T08:00:00.000Z" }),
      thread("app_c", { lastMessageBody: "Там", lastMessageAuthor: "STUDENT", lastMessageAt: "2026-10-05T09:00:00.000Z" }),
    ];
    const items = buildThreadList(list as never, drafts(["app_a", "дописываю", "2026-10-05T10:00:00.000Z"]));
    expect(items.map((t) => t.applicationId)).toEqual(["app_a", "app_c"]);
    expect(items[0].draft).toBe("дописываю");
  });

  it("предпросмотр черновика — одна строка, без переносов, не длиннее 90 знаков", () => {
    expect(draftPreview("Привет,\n\n  как дела?")).toBe("Привет, как дела?");
    const long = draftPreview("а".repeat(300));
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("хранение черновика", () => {
  it("сохраняется на пару «пользователь — отклик», повторное сохранение обновляет", async () => {
    await saveStudentDraft(U1, "app_a", "первый текст");
    await saveStudentDraft(U1, "app_a", "второй текст");
    expect(await db.studentMessageDraft.count({ where: { userId: U1 } })).toBe(1);
    expect((await getStudentDraft(U1, "app_a"))?.body).toBe("второй текст");
  });

  it("у коллеги по компании — свой черновик на тот же отклик", async () => {
    await saveStudentDraft(U1, "app_a", "мой");
    await saveStudentDraft(U2, "app_a", "коллеги");
    expect((await getStudentDraft(U1, "app_a"))?.body).toBe("мой");
    expect((await getStudentDraft(U2, "app_a"))?.body).toBe("коллеги");
    expect(await listStudentDrafts(U1)).toHaveLength(1);
  });

  it("пустой текст удаляет черновик", async () => {
    await saveStudentDraft(U1, "app_a", "что-то");
    await saveStudentDraft(U1, "app_a", "  \n ");
    expect(await getStudentDraft(U1, "app_a")).toBeNull();
  });

  it("не длиннее сообщения", async () => {
    await expect(saveStudentDraft(U1, "app_a", "я".repeat(DRAFT_MAX_LENGTH + 1))).rejects.toThrow();
    await saveStudentDraft(U1, "app_a", "я".repeat(DRAFT_MAX_LENGTH));
    expect((await getStudentDraft(U1, "app_a"))?.body).toHaveLength(DRAFT_MAX_LENGTH);
  });

  it("удаление чужого черновика ничего не трогает", async () => {
    await saveStudentDraft(U2, "app_a", "коллеги");
    await deleteStudentDraft(U1, "app_a");
    expect(await getStudentDraft(U2, "app_a")).not.toBeNull();
  });

  it("при обезличивании аккаунта черновики пользователя удаляются, коллеги — остаются", async () => {
    await saveStudentDraft(U1, "app_a", "мой");
    await saveStudentDraft(U2, "app_a", "коллеги");
    await anonymizeUser(U1);
    expect(await db.studentMessageDraft.count({ where: { userId: U1 } })).toBe(0);
    expect(await db.studentMessageDraft.count({ where: { userId: U2 } })).toBe(1);
  });
});

describe("действия кабинета клиента", () => {
  it("автосохранение: черновик попадает в список бесед и не создаёт непрочитанного", async () => {
    expect(await saveStudentDraftAction("app_b", "Здравствуйте, ")).toEqual({});
    const list = await loadThreadsAction();
    expect(list?.map((t) => t.applicationId)).toEqual(["app_b"]);
    expect(list?.[0].draft).toBe("Здравствуйте, ");
    expect(list?.[0].unread).toBe(0);
  });

  it("беседа без сообщений и черновика в списке не появляется, но открывается по прямой ссылке", async () => {
    expect(await loadThreadsAction()).toEqual([]);
    expect((await loadThreadAction("app_c"))?.applicationId).toBe("app_c");
  });

  it("чужой отклик сохранить нельзя: платформа его клиенту не отдаёт", async () => {
    const result = await saveStudentDraftAction("app_foreign", "Подсмотрю");
    expect(result.error).toBeTruthy();
    expect(await db.studentMessageDraft.count({ where: { userId: U1 } })).toBe(0);
  });

  it("очистка поля удаляет черновик, и беседа пропадает из списка", async () => {
    await saveStudentDraftAction("app_b", "текст");
    expect(await saveStudentDraftAction("app_b", "")).toEqual({});
    expect(await getStudentDraft(U1, "app_b")).toBeNull();
    expect(await loadThreadsAction()).toEqual([]);
  });

  it("лимит частоты: сверх нормы автосохранение отклоняется", async () => {
    state.rateAllowed = false;
    const result = await saveStudentDraftAction("app_b", "текст");
    expect(result.error).toBeTruthy();
    expect(await getStudentDraft(U1, "app_b")).toBeNull();
  });

  it("слишком длинный текст не сохраняется", async () => {
    const result = await saveStudentDraftAction("app_b", "я".repeat(DRAFT_MAX_LENGTH + 1));
    expect(result.error).toBeTruthy();
    expect(await getStudentDraft(U1, "app_b")).toBeNull();
  });

  it("после отправки черновик удалён, а беседа осталась — уже из-за сообщения", async () => {
    await saveStudentDraftAction("app_b", "Приглашаем на собеседование");
    expect(await sendStudentMessageAction("app_b", "Приглашаем на собеседование")).toEqual({});
    expect(state.sent).toEqual([{ applicationId: "app_b", body: "Приглашаем на собеседование" }]);
    expect(await getStudentDraft(U1, "app_b")).toBeNull();
  });

  it("не ушло — черновик остаётся, текст не теряется", async () => {
    await saveStudentDraftAction("app_b", "Текст");
    state.sendFails = true;
    const result = await sendStudentMessageAction("app_b", "Текст");
    expect(result.error).toBeTruthy();
    expect((await getStudentDraft(U1, "app_b"))?.body).toBe("Текст");
  });

  it("черновик другого пользователя компании список не меняет", async () => {
    await saveStudentDraft(U2, "app_a", "у коллеги");
    expect(await loadThreadsAction()).toEqual([]);
  });

  it("сохранённый ранее черновик не требует нового похода на платформу", async () => {
    await saveStudentDraftAction("app_b", "один");
    state.threads = []; // платформа «забыла» отклик: повторная проверка не нужна, черновик обновляется
    expect(await saveStudentDraftAction("app_b", "два")).toEqual({});
    expect((await getStudentDraft(U1, "app_b"))?.body).toBe("два");
  });
});
