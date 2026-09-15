/**
 * Сквозной аудит утечек: что уходит клиенту.
 *
 * Отдельно от тестов порога видимости. Там проверяется «видит ли клиент
 * кандидата», здесь — «нет ли в том, что он видит, лишних полей».
 * Это разные ошибки: карточку можно показать правильно, но приложить
 * к ней внутреннюю заметку рекрутера.
 *
 * Проверяем не глазами по разметке, а по объектам, которые сервисы
 * реально отдают: разметка меняется, поля остаются.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  getApplication,
  listApplications,
  listPipeline,
} from "@/lib/services/applications";
import { listApplicationComments } from "@/lib/services/comments";
import { listInterviews } from "@/lib/services/interviews";
import { listInvoices } from "@/lib/services/invoices";
import { clientAnalytics, defaultPeriod } from "@/lib/services/analytics/queries";
import { getVacancy, listVacancies } from "@/lib/services/vacancies";

const ORG = "org_fattakhov";

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

afterAll(async () => {
  await db.$disconnect();
});

/**
 * Рекурсивный поиск ключа в структуре любой вложенности.
 *
 * Именно рекурсивный: поле может уехать клиенту не напрямую, а внутри
 * вложенного объекта — например, в `candidate` внутри `application`.
 */
function findKey(value: unknown, key: string, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findKey(item, key, `${path}[${i}]`));
  }

  const found: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    const here = `${path}.${k}`;
    // Ключ считаем утечкой только если в нём есть значение
    if (k === key && v !== null && v !== undefined) found.push(here);
    found.push(...findKey(v, key, here));
  }
  return found;
}

/** Поиск подстроки в значениях — ловит утечку через переименованное поле. */
function findValue(value: unknown, needle: string, path = "$"): string[] {
  if (typeof value === "string") {
    return value.includes(needle) ? [path] : [];
  }
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findValue(item, needle, `${path}[${i}]`));
  }

  return Object.entries(value).flatMap(([k, v]) =>
    findValue(v, needle, `${path}.${k}`),
  );
}

/** Поля, которых в ответе клиенту быть не должно ни при каких условиях. */
const FORBIDDEN_FIELDS = [
  "agencyNotes", // внутренние заметки по вакансии
  "summary", // внутреннее саммари рекрутера о кандидате
  "phone", // контакт кандидата — это товар агентства
  "email",
  "telegram",
  "consentToken", // одноразовые токены
  "candidateToken",
  "passwordHash",
];

describe("карточка кандидата у клиента", () => {
  it("не содержит внутренних полей", async () => {
    const application = await db.application.findFirst({
      where: { presentedAt: { not: null }, vacancy: { clientId: "cl_starfish" } },
      select: { id: true },
    });

    const result = await getApplication(clientAdmin, application!.id);
    expect(result).not.toBeNull();

    for (const field of FORBIDDEN_FIELDS) {
      const leaks = findKey(result, field);
      expect(leaks, `${field} утекло в: ${leaks.join(", ")}`).toEqual([]);
    }
  });

  it("не содержит внутреннего саммари по значению", async () => {
    // Ловит случай, когда поле переименовали, но данные остались
    const candidate = await db.candidate.findFirst({
      where: { summary: { not: null } },
      select: { id: true, summary: true },
    });
    if (!candidate?.summary) return;

    const application = await db.application.findFirst({
      where: {
        candidateId: candidate.id,
        presentedAt: { not: null },
        vacancy: { clientId: "cl_starfish" },
      },
      select: { id: true },
    });
    if (!application) return;

    const result = await getApplication(clientAdmin, application.id);
    const leaks = findValue(result, candidate.summary.slice(0, 30));
    expect(leaks, `саммари утекло в: ${leaks.join(", ")}`).toEqual([]);
  });
});

describe("воронка у клиента", () => {
  it("карточки не содержат контактов и заметок", async () => {
    const cards = await listPipeline(clientAdmin, "vac_1");
    expect(cards.length).toBeGreaterThan(0);

    for (const field of FORBIDDEN_FIELDS) {
      const leaks = findKey(cards, field);
      expect(leaks, `${field} утекло в: ${leaks.join(", ")}`).toEqual([]);
    }
  });
});

describe("вакансии у клиента", () => {
  it("карточка вакансии не содержит внутренних заметок", async () => {
    const vacancy = await getVacancy(clientAdmin, "vac_1");
    expect(vacancy).not.toBeNull();

    const leaks = findKey(vacancy, "agencyNotes");
    expect(leaks, `agencyNotes утекло в: ${leaks.join(", ")}`).toEqual([]);
  });

  it("внутренние заметки не утекают по значению", async () => {
    await db.vacancy.update({
      where: { id: "vac_1" },
      data: { agencyNotes: "СЕКРЕТНАЯ_ЗАМЕТКА_ДЛЯ_ПРОВЕРКИ_УТЕЧКИ" },
    });

    const vacancy = await getVacancy(clientAdmin, "vac_1");
    const { items: list } = await listVacancies(clientAdmin);

    expect(findValue(vacancy, "СЕКРЕТНАЯ_ЗАМЕТКА")).toEqual([]);
    expect(findValue(list, "СЕКРЕТНАЯ_ЗАМЕТКА")).toEqual([]);

    await db.vacancy.update({
      where: { id: "vac_1" },
      data: { agencyNotes: null },
    });
  });

  it("список вакансий не содержит внутренних полей", async () => {
    const { items: list } = await listVacancies(clientAdmin);

    for (const field of ["agencyNotes", "recruiterIds"]) {
      const leaks = findKey(list, field);
      expect(leaks, `${field} утекло в: ${leaks.join(", ")}`).toEqual([]);
    }
  });
});

describe("обсуждение у клиента", () => {
  it("не содержит внутренних комментариев", async () => {
    const application = await db.application.findFirst({
      where: { presentedAt: { not: null }, vacancy: { clientId: "cl_starfish" } },
      select: { id: true },
    });

    const marker = "ВНУТРЕННИЙ_МАРКЕР_УТЕЧКИ";
    const created = await db.comment.create({
      data: {
        organizationId: ORG,
        applicationId: application!.id,
        authorId: "usr_rec1",
        visibility: "INTERNAL",
        body: marker,
      },
      select: { id: true },
    });

    const comments = await listApplicationComments(clientAdmin, application!.id);

    expect(findValue(comments, marker)).toEqual([]);
    expect(comments!.every((c) => c.visibility === "SHARED")).toBe(true);

    await db.comment.delete({ where: { id: created.id } });
  });
});

describe("календарь и счета у клиента", () => {
  it("встречи не содержат контактов кандидатов", async () => {
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const to = new Date();
    to.setDate(to.getDate() + 90);

    const interviews = await listInterviews(clientAdmin, { from, to });

    for (const field of ["phone", "email", "summary"]) {
      const leaks = findKey(interviews, field);
      expect(leaks, `${field} утекло в: ${leaks.join(", ")}`).toEqual([]);
    }
  });

  it("счета не содержат данных других клиентов", async () => {
    const invoices = await listInvoices(clientAdmin);
    expect(invoices.every((i) => i.clientName === "Старфиш")).toBe(true);
  });
});

describe("аналитика у клиента", () => {
  it("не содержит внутренних этапов воронки", async () => {
    const analytics = await clientAnalytics(clientAdmin, defaultPeriod());

    const codes = analytics.funnel.map((s) => s.code);
    expect(codes).not.toContain("LONGLIST");
    expect(codes).not.toContain("SCREENING");
  });

  it("не содержит персональных данных вовсе", async () => {
    const analytics = await clientAnalytics(clientAdmin, defaultPeriod());

    for (const field of ["phone", "email", "fullName", "summary"]) {
      const leaks = findKey(analytics, field);
      expect(leaks, `${field} утекло в: ${leaks.join(", ")}`).toEqual([]);
    }
  });
});

describe("наблюдатель", () => {
  it("видит не больше администратора своей компании", async () => {
    const forAdmin = await listPipeline(clientAdmin, "vac_1");
    const forViewer = await listPipeline(clientViewer, "vac_1");

    expect(forViewer.length).toBeLessThanOrEqual(forAdmin.length);

    for (const field of FORBIDDEN_FIELDS) {
      expect(findKey(forViewer, field), field).toEqual([]);
    }
  });
});

describe("список кандидатов у клиента", () => {
  it("не показывает тех, кого ещё не представили (BR-3)", async () => {
    const { items: forClient } = await listApplications(clientAdmin);
    const { items: forAgency } = await listApplications({
      id: "usr_owner",
      organizationId: ORG,
      role: "OWNER",
      clientId: null,
    });

    // Клиент видит строго меньше: лонг-лист и скрининг — не его дело
    expect(forClient.length).toBeLessThan(forAgency.length);
    expect(
      forClient.every((a) => a.presentedAt !== null),
      "в списке клиента есть непредставленный кандидат",
    ).toBe(true);
  });

  it("не содержит контактов и внутренних полей", async () => {
    const { items: list } = await listApplications(clientAdmin);

    for (const field of FORBIDDEN_FIELDS) {
      const leaks = findKey(list, field);
      expect(leaks, `${field} утекло в: ${leaks.join(", ")}`).toEqual([]);
    }
  });

  it("не показывает кандидатов чужой компании", async () => {
    const { items: list } = await listApplications(clientAdmin);
    const foreign = await db.application.findMany({
      where: { vacancy: { clientId: { not: "cl_starfish" } } },
      select: { id: true },
    });
    const foreignIds = new Set(foreign.map((a) => a.id));

    expect(list.some((a) => foreignIds.has(a.id))).toBe(false);
  });

  it("фильтр «ждут решения» отбирает только тех, кто без ответа", async () => {
    const { items: awaiting } = await listApplications(clientAdmin, {
      awaitingDecision: true,
    });

    expect(awaiting.length).toBeGreaterThan(0);
    expect(
      awaiting.every((a) => a.presentedAt !== null && a.clientDecision === null),
    ).toBe(true);
  });
});
