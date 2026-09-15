import { test, expect } from "@playwright/test";

import {
  cleanupCandidate,
  createPresentedApplicationFixture,
  getApplicationStage,
} from "./fixtures/db-client";

/**
 * Решение клиента по представленному кандидату (BR-12, BR-13).
 *
 * Файл начинается с "client-" — playwright.config.ts заводит его
 * в проект chromium-client (сессия hrd@starfish.ru), а не в обычный
 * chromium (там он явно исключён через testIgnore).
 */

const ORG_ID = "org_fattakhov";
const RECRUITER_ID = "usr_rec1";
const VACANCY_ID = "vac_1"; // клиент — cl_starfish, тот же, что у hrd@starfish.ru

test.describe("решение клиента по кандидату", () => {
  test("приглашение на интервью двигает кандидата по воронке", async ({ page }) => {
    const ids = await createPresentedApplicationFixture({
      organizationId: ORG_ID,
      vacancyId: VACANCY_ID,
      createdById: RECRUITER_ID,
      ownerId: RECRUITER_ID,
      fullName: `E2E Кандидат Интервью ${Date.now()}`,
    });

    try {
      await page.goto(`/applications/${ids.applicationId}`);

      await page.getByRole("button", { name: "Пригласить на интервью" }).click();

      // Панель решения не пропадает для INTERVIEW (canDecide && !closed
      // остаётся true — в отличие от отказа), сообщение можно ловить прямо
      await expect(
        page.getByText("Рекрутер подберёт время и пришлёт слоты"),
      ).toBeVisible();

      const updated = await getApplicationStage({ applicationId: ids.applicationId });
      expect(updated.stageCode).toBe("CLIENT_INTERVIEW");
      expect(updated.clientDecision).toBe("INTERVIEW");
    } finally {
      await cleanupCandidate({ candidateId: ids.candidateId });
    }
  });

  test("отказ требует причину и закрывает заявку", async ({ page }) => {
    const ids = await createPresentedApplicationFixture({
      organizationId: ORG_ID,
      vacancyId: VACANCY_ID,
      createdById: RECRUITER_ID,
      ownerId: RECRUITER_ID,
      fullName: `E2E Кандидат Отказ ${Date.now()}`,
    });

    try {
      await page.goto(`/applications/${ids.applicationId}`);

      await page.getByRole("button", { name: "Отказать" }).click();
      await page.getByLabel("Почему не подходит").click();
      await page.getByRole("option", { name: "Не хватает навыков" }).click();
      await page.getByRole("button", { name: "Отказать" }).click();

      // closed становится true — панель решения (и её сообщение) убирается
      // тем же revalidatePath, только теперь показывает "Кандидат выбыл"
      await expect(page.getByText("Кандидат выбыл")).toBeVisible();
      await expect(page.getByText("Не хватает навыков")).toBeVisible();

      const updated = await getApplicationStage({ applicationId: ids.applicationId });
      expect(updated.outcome).toBe("REJECTED");
      expect(updated.clientDecision).toBe("REJECT");
    } finally {
      await cleanupCandidate({ candidateId: ids.candidateId });
    }
  });
});
