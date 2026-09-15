/**
 * Получатели уведомлений со стороны клиента (lib/notifications/recipients).
 *
 * clientDigestRecipients — единственная тонкая часть: объединяет
 * получателей нескольких вакансий, а не просто пересказывает
 * clientSideRecipients для одной.
 */
import { describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import {
  clientDigestRecipients,
  clientSideRecipients,
} from "@/lib/notifications/recipients";

// Реальные вакансии из seed: у cl_starfish две активные, с разными
// нанимающими менеджерами — vac_1 у usr_cl_hiring1, vac_2 у usr_cl_hiring2.
const VACANCY_A = "vac_1";
const VACANCY_B = "vac_2";
const HIRING_A = "usr_cl_hiring1";
const HIRING_B = "usr_cl_hiring2";
const CLIENT_ADMIN = "usr_cl_admin";

describe("получатели одной вакансии", () => {
  it("администратор клиента и её собственный нанимающий менеджер", async () => {
    const recipients = await clientSideRecipients(VACANCY_A);
    expect(recipients).toContain(CLIENT_ADMIN);
    expect(recipients).toContain(HIRING_A);
    // Чужой нанимающий менеджер сюда попасть не должен — это и есть
    // то, ради чего hiringManagerId у каждой вакансии свой
    expect(recipients).not.toContain(HIRING_B);
  });
});

describe("получатели сводки по нескольким вакансиям", () => {
  /*
    Раньше сводка брала получателей только у первой вакансии клиента —
    той, что Prisma вернула первой, без делового смысла в этом порядке.
    Нанимающий менеджер остальных вакансий клиента в письмо не попадал,
    даже когда движение было именно по его вакансии. Тест держит именно
    это: объединение, а не выбор одной вакансии как представителя всех.
  */
  it("нанимающие менеджеры обеих вакансий получают сводку", async () => {
    const recipients = await clientDigestRecipients([VACANCY_A, VACANCY_B]);

    expect(recipients).toContain(HIRING_A);
    expect(recipients).toContain(HIRING_B);
    expect(recipients).toContain(CLIENT_ADMIN);
  });

  it("администратор клиента не дублируется", async () => {
    const recipients = await clientDigestRecipients([VACANCY_A, VACANCY_B]);
    const admins = recipients.filter((id) => id === CLIENT_ADMIN);
    expect(admins).toHaveLength(1);
  });

  it("порядок вакансий на результат не влияет", async () => {
    const forward = await clientDigestRecipients([VACANCY_A, VACANCY_B]);
    const backward = await clientDigestRecipients([VACANCY_B, VACANCY_A]);
    expect([...forward].sort()).toEqual([...backward].sort());
  });

  it("одна вакансия — тот же результат, что и у clientSideRecipients", async () => {
    const single = await clientDigestRecipients([VACANCY_A]);
    const direct = await clientSideRecipients(VACANCY_A);
    expect([...single].sort()).toEqual([...direct].sort());
  });

  it("несуществующая вакансия среди списка не ломает остальных", async () => {
    const recipients = await clientDigestRecipients([
      VACANCY_A,
      "нет-такой-вакансии",
    ]);
    expect(recipients).toContain(HIRING_A);
  });
});

describe("предпосылка теста", () => {
  // Если seed когда-нибудь перестанет давать двух разных нанимающих
  // менеджеров на двух вакансиях — тест выше молча перестанет что-либо
  // проверять. Явно фиксируем условие, на котором он держится.
  it("у cl_starfish есть две активные вакансии с разными нанимающими менеджерами", async () => {
    const vacancies = await db.vacancy.findMany({
      where: { clientId: "cl_starfish", status: "ACTIVE" },
      select: { id: true, hiringManagerId: true },
    });
    const managers = new Set(vacancies.map((v) => v.hiringManagerId));
    expect(vacancies.map((v) => v.id)).toEqual(
      expect.arrayContaining([VACANCY_A, VACANCY_B]),
    );
    expect(managers.has(HIRING_A)).toBe(true);
    expect(managers.has(HIRING_B)).toBe(true);
  });
});
