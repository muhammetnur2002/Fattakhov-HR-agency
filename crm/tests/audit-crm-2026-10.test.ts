/**
 * Правки аудита безопасности CRM (17.10.2026): адрес возврата после входа, ключ файла в хранилище,
 * токены в адресе сообщения о сбое, маски в журнале, переводы по воронке и решения клиента.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { assignRecruiters, createVacancyDraft } from "@/lib/services/vacancies";

import { sanitizeCallbackUrl } from "@/lib/auth/login-redirect";
import { redactPath } from "@/lib/monitoring/alerts";
import { maskEmail } from "@/lib/notifications/channels";
import { buildStorageKey } from "@/lib/storage";

describe("адрес возврата после входа", () => {
  it("оставляет внутренние пути", () => {
    expect(sanitizeCallbackUrl("/a/candidates?x=1")).toBe("/a/candidates?x=1");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/a\nb", "", null, undefined])(
    "отбрасывает %j",
    (value) => {
      expect(sanitizeCallbackUrl(value as string | null | undefined)).toBe("/");
    },
  );
});

describe("ключ файла в хранилище", () => {
  const base = { organizationId: "org", scope: "candidate", scopeId: "c1" };
  it("берёт обычное расширение", () => {
    expect(buildStorageKey({ ...base, fileName: "Резюме.PDF" })).toMatch(/^org\/candidate\/c1\/[0-9a-f-]{36}\.pdf$/);
  });
  it("не пускает в ключ слэши и точки из имени", () => {
    const key = buildStorageKey({ ...base, fileName: "x./../../etc" });
    expect(key.split("/")).toHaveLength(4);
    expect(key).not.toContain("..");
  });
  it("без расширения остаётся только случайный сегмент", () => {
    expect(buildStorageKey({ ...base, fileName: "noext" })).toMatch(/^org\/candidate\/c1\/[0-9a-f-]{36}$/);
  });
});

describe("сообщение о сбое", () => {
  it("прячет токен из пути", () => {
    expect(redactPath("/reset/abcDEF123_secretTokenValue")).toBe("/reset/<токен>");
    expect(redactPath("/api/calendar/abc.def.ghi")).toBe("/api/calendar/<токен>");
    expect(redactPath("/a/candidates")).toBe("/a/candidates");
  });
});

describe("журнал", () => {
  it("маскирует адрес почты", () => {
    expect(maskEmail("ivan@example.com")).toBe("i***@example.com");
    expect(maskEmail("broken")).toBe("<адрес>");
  });
});

describe("вложенные id из форм", () => {
  const owner: Actor = { id: "usr_owner", organizationId: "org_fattakhov", role: "OWNER", clientId: null };

  afterAll(async () => {
    await db.$disconnect();
  });

  it("в команду вакансии не берут клиентского пользователя и несуществующий id", async () => {
    const clientUser = await db.user.findFirstOrThrow({
      where: { role: "CLIENT_ADMIN" },
      select: { id: true },
    });
    const vacancy = await db.vacancy.findFirstOrThrow({ select: { id: true } });
    await expect(assignRecruiters(owner, vacancy.id, null, [clientUser.id])).rejects.toThrow();
    await expect(assignRecruiters(owner, vacancy.id, "нет-такого", [])).rejects.toThrow();
  });

  it("заказчик вакансии должен быть человеком этого клиента", async () => {
    const vacancy = await db.vacancy.findFirstOrThrow({ select: { clientId: true } });
    await expect(
      createVacancyDraft(owner, vacancy.clientId, { title: "Проверка", hiringManagerId: "usr_owner" }),
    ).rejects.toThrow();
  });

  it("клиент из чужой организации не принимается", async () => {
    await expect(createVacancyDraft(owner, "нет-такого-клиента", { title: "Проверка" })).rejects.toThrow();
  });
});
