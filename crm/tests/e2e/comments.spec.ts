import { test, expect } from "@playwright/test";

import {
  cleanupCandidate,
  createApplicationFixture,
  createComment,
} from "./fixtures/db-client";

/**
 * Обсуждение по кандидату. Компонентные тесты (tests/components/
 * comment-thread.test.tsx) уже проверяют саму матрицу прав на моках —
 * здесь то же самое, но сквозь настоящий Server Action и настоящую базу:
 * что рекрутёр пишет и правит своё, и что comment.deleteAny (только
 * у OWNER, см. lib/access/index.ts) действительно даёт удалить чужое
 * с именем автора в подтверждении — ровно то, чего раньше не было
 * в интерфейсе вовсе (см. историю canDeleteAny в comment-thread.tsx).
 *
 * Комментарий ищем по <li>, а не по тексту самой реплики: у "Изменить"
 * абзац с текстом на время правки подменяется на <textarea> — locator,
 * завязанный на текст абзаца, в этот момент перестаёт резолвиться.
 * Шапка с именем автора рендерится всегда, независимо от режима,
 * и <li> из CommentThread.map() не пересоздаётся при смене режима внутри
 * CommentItem — устойчивая точка на весь сценарий правки.
 */

const ORG_ID = "org_fattakhov";
const RECRUITER_ID = "usr_rec1";
const RECRUITER_NAME = "Алина Гизатуллина";
const VACANCY_ID = "vac_1";

function futureConsent() {
  return new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();
}

test("рекрутёр пишет, правит и удаляет свой комментарий", async ({ page }) => {
  const ids = await createApplicationFixture({
    organizationId: ORG_ID,
    vacancyId: VACANCY_ID,
    stageCode: "LONGLIST",
    createdById: RECRUITER_ID,
    ownerId: RECRUITER_ID,
    fullName: `E2E Кандидат Обсуждение ${Date.now()}`,
    consentStatus: "GIVEN",
    consentExpiresAtIso: futureConsent(),
  });

  const originalBody = `E2E исходный текст ${Date.now()}`;
  const editedBody = `E2E изменённый текст ${Date.now()}`;

  try {
    await page.goto(`/a/applications/${ids.applicationId}`);

    await page.getByPlaceholder("Написать клиенту…").fill(originalBody);
    await page.getByRole("button", { name: "Отправить" }).click();

    const commentBox = page.locator("li").filter({ hasText: RECRUITER_NAME });
    await expect(commentBox.getByText(originalBody, { exact: true })).toBeVisible();

    await commentBox.getByRole("button", { name: "Изменить" }).click();
    await commentBox.getByRole("textbox").fill(editedBody);
    await commentBox.getByRole("button", { name: "Сохранить" }).click();

    await expect(commentBox.getByText(editedBody, { exact: true })).toBeVisible();
    await expect(commentBox.getByText("изменено")).toBeVisible();

    await commentBox.getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("button", { name: "Да, удалить" }).click();

    await expect(commentBox).not.toBeVisible();
  } finally {
    await cleanupCandidate({ candidateId: ids.candidateId });
  }
});

test.describe("comment.deleteAny — только у владельца", () => {
  test.use({ storageState: "tests/e2e/.auth/owner.json" });

  test("владелец удаляет чужой комментарий и видит в подтверждении имя автора", async ({
    page,
  }) => {
    const ids = await createApplicationFixture({
      organizationId: ORG_ID,
      vacancyId: VACANCY_ID,
      stageCode: "LONGLIST",
      createdById: RECRUITER_ID,
      ownerId: RECRUITER_ID,
      fullName: `E2E Кандидат Чужой Комментарий ${Date.now()}`,
      consentStatus: "GIVEN",
      consentExpiresAtIso: futureConsent(),
    });

    const foreignBody = `E2E чужой комментарий ${Date.now()}`;
    await createComment({
      organizationId: ORG_ID,
      applicationId: ids.applicationId,
      authorId: RECRUITER_ID,
      body: foreignBody,
    });

    try {
      await page.goto(`/a/applications/${ids.applicationId}`);

      const commentBox = page.locator("li").filter({ hasText: RECRUITER_NAME });
      await expect(commentBox.getByText(foreignBody, { exact: true })).toBeVisible();

      // Править чужое нельзя ни при каком праве — кнопки для него нет
      // вовсе (см. комментарий в comment-thread.tsx: исправленный чужой
      // текст остался бы подписан прежним именем)
      await expect(commentBox.getByRole("button", { name: "Изменить" })).toHaveCount(0);

      await commentBox.getByRole("button", { name: "Удалить" }).click();
      await expect(
        page.getByText(`Удалить комментарий — ${RECRUITER_NAME}?`),
      ).toBeVisible();

      await page.getByRole("button", { name: "Да, удалить" }).click();
      await expect(commentBox).not.toBeVisible();
    } finally {
      await cleanupCandidate({ candidateId: ids.candidateId });
    }
  });
});
