import { test, expect } from "@playwright/test";

import {
  cleanupCandidate,
  createInterviewFixture,
  getInterviewStatus,
} from "./fixtures/db-client";

/**
 * Собеседование: рекрутёр предлагает время, кандидат выбирает по
 * публичной ссылке — без аккаунта, поэтому вторая половина сценария
 * идёт в отдельном, неавторизованном контексте браузера (см. browser
 * fixture ниже), а не в page с сессией рекрутёра.
 *
 * Заводим встречу сразу в SLOTS_REQUESTED — тот же момент, в который
 * её приводит решение клиента "Пригласить на интервью" (см.
 * client-decision.spec.ts, эта часть цепочки уже проверена там).
 */

const ORG_ID = "org_fattakhov";
const RECRUITER_ID = "usr_rec1";
const VACANCY_ID = "vac_1";

/** datetime-local не принимает часовой пояс — только "чем дальше, тем безопаснее". */
function futureLocalDateTime(daysFromNow: number, hour: string): string {
  const d = new Date(Date.now() + daysFromNow * 24 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${hour}`;
}

test("рекрутёр предлагает время, кандидат подтверждает по ссылке (BR-15, BR-16)", async ({
  page,
  browser,
}) => {
  const ids = await createInterviewFixture({
    organizationId: ORG_ID,
    vacancyId: VACANCY_ID,
    stageCode: "LONGLIST",
    createdById: RECRUITER_ID,
    ownerId: RECRUITER_ID,
    fullName: `E2E Кандидат Интервью-Слоты ${Date.now()}`,
  });

  try {
    await page.goto(`/a/applications/${ids.applicationId}`);

    await page.getByRole("button", { name: "Предложить время" }).click();

    const slotInputs = page.locator('input[name="slot"]');
    await slotInputs.nth(0).fill(futureLocalDateTime(3, "10:00"));
    await slotInputs.nth(1).fill(futureLocalDateTime(4, "14:00"));

    await page
      .getByRole("button", { name: "Сохранить и получить ссылку" })
      .click();

    await expect(page.getByText("Ссылка для кандидата")).toBeVisible();
    const scheduleUrl = await page.locator("code").innerText();
    expect(scheduleUrl).toMatch(/\/schedule\/[\w-]+$/);

    // Кандидат открывает ссылку без сессии — своя, полностью анонимная вкладка
    const candidateContext = await browser.newContext();
    try {
      const candidatePage = await candidateContext.newPage();
      await candidatePage.goto(scheduleUrl);

      await candidatePage
        .getByRole("button", { name: /^\d{1,2}:\d{2}$/ })
        .first()
        .click();
      await candidatePage.getByRole("button", { name: "Подтвердить время" }).click();

      await expect(candidatePage.getByText("Встреча назначена")).toBeVisible();
      await expect(
        candidatePage.getByRole("link", { name: "Добавить в календарь" }),
      ).toBeVisible();
    } finally {
      await candidateContext.close();
    }

    const status = await getInterviewStatus({ interviewId: ids.interviewId });
    expect(status.status).toBe("CONFIRMED");
    expect(status.scheduledAt).not.toBeNull();
  } finally {
    await cleanupCandidate({ candidateId: ids.candidateId });
  }
});
