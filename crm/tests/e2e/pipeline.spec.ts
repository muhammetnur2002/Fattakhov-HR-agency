import { test, expect } from "@playwright/test";

import {
  cleanupCandidate,
  createApplicationFixture,
  createCandidate,
  getApplicationStage,
} from "./fixtures/db-client";

/**
 * Приём кандидата в воронку и представление клиенту — через настоящий
 * браузер и настоящую базу разработки (см. playwright.config.ts).
 *
 * Своя база под e2e не заведена, поэтому тесты сами создают строки
 * с префиксом "E2E " и убирают их за собой в afterAll/finally — сиды
 * (vac_1, usr_rec1) только читаются, никогда не меняются. Сам доступ
 * к Prisma идёт не отсюда напрямую, а через fixtures/db-client.ts —
 * см. комментарий в fixtures/db-fixture.ts, почему.
 */

const ORG_ID = "org_fattakhov";
const RECRUITER_ID = "usr_rec1"; // ведёт vac_1, см. auth.setup.ts (rec1@fattakhov.hr)
const VACANCY_ID = "vac_1"; // "Руководитель отдела продаж", воронка уже создана сидом

test.describe("приём кандидата в воронку", () => {
  const fullName = `E2E Кандидат Воронка ${Date.now()}`;
  let candidateId: string;

  test.beforeAll(async () => {
    ({ candidateId } = await createCandidate({
      organizationId: ORG_ID,
      createdById: RECRUITER_ID,
      fullName,
    }));
  });

  test.afterAll(async () => {
    await cleanupCandidate({ candidateId });
  });

  test("находится по базе и добавляется в воронку вакансии", async ({ page }) => {
    await page.goto(`/a/vacancies/${VACANCY_ID}`);

    await page.getByRole("button", { name: "Из базы" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Имя, должность, компания, телефон…").fill(fullName);
    await dialog.getByRole("button", { name: "Добавить" }).click();

    // Диалог закрывается сам только при успехе (handleAdd: setOpen(false))
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(fullName)).toBeVisible();
  });

  test("повторное добавление — понятная ошибка, а не сбой (BR-6)", async ({ page }) => {
    await page.goto(`/a/vacancies/${VACANCY_ID}`);

    await page.getByRole("button", { name: "Из базы" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Имя, должность, компания, телефон…").fill(fullName);
    await dialog.getByRole("button", { name: "Добавить" }).click();

    await expect(dialog.getByText("Этот кандидат уже в воронке этой вакансии")).toBeVisible();
  });
});

test.describe("представление клиенту (BR-4, BR-33)", () => {
  test("резюме и действующее согласие — представление проходит", async ({ page }) => {
    const ids = await createApplicationFixture({
      organizationId: ORG_ID,
      vacancyId: VACANCY_ID,
      stageCode: "LONGLIST",
      createdById: RECRUITER_ID,
      ownerId: RECRUITER_ID,
      fullName: `E2E Кандидат Представление ${Date.now()}`,
      consentStatus: "GIVEN",
      consentExpiresAtIso: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(),
    });

    try {
      await page.goto(`/a/applications/${ids.applicationId}`);

      // Согласие и резюме в порядке — блокирующего алерта быть не должно
      await expect(page.getByText("Представить нельзя:")).not.toBeVisible();

      await page
        .getByLabel("Почему подходит")
        .fill(
          "Кандидат управлял отделом продаж из 8 человек три года, выполнял план " +
            "каждый квартал, есть опыт работы с сетевой розницей — то, что просит клиент.",
        );
      await page.getByLabel("Зарплатное ожидание, ₽").fill("220000");
      await page.getByRole("button", { name: "Представить клиенту" }).click();

      // Успех сразу меняет вид страницы (revalidatePath) — форма вместе
      // с её сообщением "Кандидат представлен клиенту" уже не рендерится
      // (см. alreadyPresented в app/(agency)/a/applications/[id]/page.tsx),
      // поэтому проверяем результат, а не мимолётный текст формы
      await expect(page.getByText("· представлен клиенту")).toBeVisible();

      const updated = await getApplicationStage({ applicationId: ids.applicationId });
      expect(updated.stageCode).toBe("PRESENTED");
      expect(updated.presentedAt).not.toBeNull();
    } finally {
      await cleanupCandidate({ candidateId: ids.candidateId });
    }
  });

  test("согласие с истёкшим сроком — блокирует и в подсказке, и на сервере (BR-34)", async ({
    page,
  }) => {
    /*
      Статус в базе всё ещё GIVEN — на EXPIRED его переводит фоновая
      задача (expireConsents), а не сам факт истечения срока. Ровно
      этот разрыв раньше пропускал кандидата к представлению клиенту.
    */
    const ids = await createApplicationFixture({
      organizationId: ORG_ID,
      vacancyId: VACANCY_ID,
      stageCode: "LONGLIST",
      createdById: RECRUITER_ID,
      ownerId: RECRUITER_ID,
      fullName: `E2E Кандидат Просроченное Согласие ${Date.now()}`,
      consentStatus: "GIVEN",
      consentExpiresAtIso: new Date(Date.now() - 24 * 3_600_000).toISOString(),
    });

    try {
      await page.goto(`/a/applications/${ids.applicationId}`);

      await expect(page.getByText(/Представить нельзя:.*согласия/)).toBeVisible();

      await page
        .getByLabel("Почему подходит")
        .fill(
          "Кандидат управлял отделом продаж из 8 человек три года, выполнял план " +
            "каждый квартал, есть опыт работы с сетевой розницей — то, что просит клиент.",
        );
      await page.getByLabel("Зарплатное ожидание, ₽").fill("220000");
      await page.getByRole("button", { name: "Представить клиенту" }).click();

      await expect(
        page.getByText("Нет согласия кандидата на обработку персональных данных"),
      ).toBeVisible();

      const unchanged = await getApplicationStage({ applicationId: ids.applicationId });
      expect(unchanged.stageCode).toBe("LONGLIST");
    } finally {
      await cleanupCandidate({ candidateId: ids.candidateId });
    }
  });
});
