import { expect, test } from "@playwright/test";

import { cleanupCandidate, createApplicationFixture } from "./fixtures/db-client";

/**
 * Сессия закончилась, а форма на открытой странице ещё жива (выход в другой вкладке,
 * отключение доступа). Раньше отправка кончалась «Что-то пошло не так» и пропавшим
 * текстом без объяснений; теперь человек попадает на вход с пояснением и возвратом
 * на ту же страницу.
 */
test("форма после окончания сессии: вход с пояснением, а не «Что-то пошло не так»", async ({ page, context }) => {
  const ids = await createApplicationFixture({
    organizationId: "org_fattakhov",
    vacancyId: "vac_1",
    stageCode: "LONGLIST",
    createdById: "usr_rec1",
    ownerId: "usr_rec1",
    fullName: `E2E Кандидат Сессия ${Date.now()}`,
    consentStatus: "GIVEN",
    consentExpiresAtIso: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(),
  });
  const path = `/a/applications/${ids.applicationId}`;

  try {
    await page.goto(path);
    const box = page.getByPlaceholder("Написать клиенту…");
    await box.waitFor();
    // Форма гидратирована, когда React повесил на поле свои свойства
    await page.waitForFunction(() =>
      Object.keys(document.querySelector("textarea")!).some((k) => k.startsWith("__reactProps")),
    );
    await box.fill("E2E текст, который не дойдёт");

    // Сессия закончилась в другой вкладке
    // Пульс «в сети» ещё может быть в пути и ответом вернул бы только что очищенную куку
    await page.waitForLoadState("networkidle");
    await context.clearCookies();
    await page.getByRole("button", { name: "Отправить" }).click();

    await expect(page).toHaveURL(/\/login\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe(path);
    expect(url.searchParams.get("expired")).toBe("1");
    await expect(page.getByText("Сессия закончилась")).toBeVisible();
    await expect(page.getByText("Что-то пошло не так")).toHaveCount(0);
  } finally {
    await cleanupCandidate({ candidateId: ids.candidateId });
  }
});
