/**
 * Сводка над кнопкой отказа не противоречит ошибке у поля (замечание проверки PR #120, 12.10.2026).
 *
 * Оба действия отказа (`decideAction` — клиент, `rejectAction` — рекрутер) отвечали на любую непройденную проверку
 * сводкой «Укажите причину отказа». Для причины «Другое» без комментария ошибка относилась к полю
 * `rejectionComment`: над кнопкой стояла плашка role=alert «Укажите причину отказа», хотя причина выбрана, а у
 * поля комментария — «Для причины «Другое» напишите, что именно не подошло». Две фразы про разное в одной форме.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  actor: {
    id: "usr_x",
    organizationId: "org_x",
    role: "CLIENT_ADMIN",
    clientId: "cli_x",
    grants: [],
  } as unknown,
}));

vi.mock("@/lib/auth/session", () => ({
  requireActor: async () => session.actor,
  requireAgencyActor: async () => session.actor,
  authorizeOrThrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {}, unstable_isUnrecognizedActionError: () => false }));
vi.mock("@/lib/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/access")>()),
  canDo: () => true,
  isAgency: () => false,
}));
vi.mock("@/lib/db/prisma", () => {
  const application = {
    findFirst: async () => ({ vacancyId: "v1", vacancy: { clientId: "cli_x", hiringManagerId: null } }),
  };
  return { prisma: { application }, prismaRaw: { application } };
});

import { rejectAction } from "@/app/(agency)/a/candidates/actions";
import { decideAction } from "@/app/actions/decisions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const OTHER_WITHOUT_COMMENT = {
  applicationId: "a1",
  decision: "REJECT",
  rejectedBy: "CLIENT",
  rejectionReason: "OTHER",
  rejectionComment: "",
};

beforeEach(() => vi.clearAllMocks());

describe.each([
  ["клиент (decideAction)", (data: FormData) => decideAction({}, data)],
  ["рекрутер (rejectAction)", (data: FormData) => rejectAction({}, data)],
])("отказ: %s", (_who, run) => {
  it("«Другое» без комментария: ошибка у поля комментария, сводка не говорит про причину", async () => {
    const state = await run(form(OTHER_WITHOUT_COMMENT));
    expect(state.fields).toEqual({ rejectionComment: "Для причины «Другое» напишите, что именно не подошло" });
    expect(state.error).toBe("Проверьте заполнение полей");
    expect(state.error).not.toMatch(/причин/i);
  });

  it("причина не выбрана: ошибка у поля причины, сводка общая", async () => {
    const state = await run(form({ ...OTHER_WITHOUT_COMMENT, rejectionReason: "" }));
    expect(state.fields).toEqual({ rejectionReason: "Выберите причину отказа" });
    expect(state.error).toBe("Проверьте заполнение полей");
  });
});
