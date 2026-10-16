import { test, expect } from "@playwright/test";

import {
  cleanupCandidate,
  createApplicationFixture,
  createCandidate,
  createComment,
  createInvitation,
  deleteInvitation,
  getVkUser,
  invitationExists,
  setVkUser,
} from "./fixtures/db-client";

/**
 * Подтверждение опасного действия — один блок на весь кабинет (components/ui/confirm-block.tsx).
 *
 * Компонентные тесты проверяют блок в jsdom; здесь то, что jsdom не покажет: настоящий Server Action, настоящая
 * база и настоящий фокус браузера. На каждом из трёх самых важных мест: кнопка открывает вопрос и фокус встаёт
 * на безопасную «Отмену» (или в поле), Escape закрывает блок и возвращает фокус на кнопку, а «Да» делает дело.
 * Всё с клавиатуры: Enter и Escape, мышь не нужна.
 *
 * Четвёртый сценарий — обратный: отзыв приглашения подтверждения НЕ просит (решение владельца, 16.10.2026): одно нажатие
 * отзывает, вопроса нет, приглашение пропадает. С 13.10 по 16.10 здесь был сценарий с вопросом и «Отмена».
 *
 * Все четыре — под владельцем агентства: у него есть и удаление данных кандидата, и управление клиентами.
 * Данные заводит и убирает сам тест (префикс E2E).
 */
test.use({ storageState: "tests/e2e/.auth/owner.json" });
test.setTimeout(120_000);

const ORG_ID = "org_fattakhov";
const OWNER_ID = "usr_owner";
const VACANCY_ID = "vac_1";

function futureConsent() {
  return new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();
}

test("удаление комментария: вопрос, фокус на «Отмене», Escape возвращает на «Удалить», «Да» удаляет", async ({ page }) => {
  const ids = await createApplicationFixture({
    organizationId: ORG_ID,
    vacancyId: VACANCY_ID,
    stageCode: "LONGLIST",
    createdById: OWNER_ID,
    ownerId: OWNER_ID,
    fullName: `E2E Кандидат Подтверждение ${Date.now()}`,
    consentStatus: "GIVEN",
    consentExpiresAtIso: futureConsent(),
  });
  const body = `E2E подтверждение удаления ${Date.now()}`;
  await createComment({ organizationId: ORG_ID, applicationId: ids.applicationId, authorId: OWNER_ID, body });

  try {
    await page.goto(`/a/applications/${ids.applicationId}`);
    const comment = page.locator("li").filter({ hasText: body });
    await expect(comment.getByText(body, { exact: true })).toBeVisible();

    const remove = comment.getByRole("button", { name: "Удалить" });
    await remove.focus();
    await page.keyboard.press("Enter");

    await expect(comment.getByRole("group", { name: "Удалить комментарий?" })).toBeVisible();
    await expect(comment.getByRole("button", { name: "Отмена" })).toBeFocused();
    // Кнопка «Удалить» на время вопроса пропала, а читалке вопрос назван один раз
    await expect(comment.getByRole("button", { name: "Удалить", exact: true })).toHaveCount(0);
    await expect(comment.getByText("Удалить комментарий?")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(comment.getByRole("group")).toHaveCount(0);
    await expect(comment.getByRole("button", { name: "Удалить" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(comment.getByRole("button", { name: "Отмена" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(comment.getByRole("button", { name: "Да, удалить" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(comment).toHaveCount(0);
  } finally {
    await cleanupCandidate({ candidateId: ids.candidateId });
  }
});

test("отвязка ВКонтакте: вопрос, фокус на «Отмене», Escape возвращает на «Отвязать», «Да» отвязывает", async ({ page }) => {
  // Что было у владельца до прогона (в базе разработки может стоять настоящая привязка) — то и вернём
  const before = (await getVkUser({ userId: OWNER_ID })).vkUserId;
  await setVkUser({ userId: OWNER_ID, vkUserId: "424242" });
  try {
    await page.goto("/a/settings");
    const unlink = page.getByRole("button", { name: "Отвязать", exact: true });
    // Блок ВК рисуется только на сервере с ключом VK_BOT_TOKEN: без него канала на экране нет вовсе
    test.skip(!(await unlink.isVisible({ timeout: 15_000 }).catch(() => false)), "на сервере не задан VK_BOT_TOKEN");

    await unlink.focus();
    await page.keyboard.press("Enter");
    const block = page.getByRole("group", { name: "Отвязать страницу? Уведомления в ВКонтакте перестанут приходить." });
    await expect(block).toBeVisible();
    await expect(block.getByRole("button", { name: "Отмена" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(block).toHaveCount(0);
    await expect(unlink).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(block.getByRole("button", { name: "Отмена" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(block.getByRole("button", { name: "Да, отвязать" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Страница отвязана")).toBeVisible();
    await expect.poll(async () => (await getVkUser({ userId: OWNER_ID })).vkUserId).toBeNull();
  } finally {
    await setVkUser({ userId: OWNER_ID, vkUserId: before });
  }
});

test("стирание данных кандидата: фокус в поле, неверное слово — ошибка в самом блоке, Escape возвращает на кнопку", async ({ page }) => {
  const name = `E2E Кандидат Стирание ${Date.now()}`;
  const { candidateId } = await createCandidate({ organizationId: ORG_ID, createdById: OWNER_ID, fullName: name });

  try {
    await page.goto(`/a/candidates/${candidateId}`);
    const open = page.getByRole("button", { name: "Удалить данные", exact: true });
    await open.focus();
    await page.keyboard.press("Enter");

    const form = page.getByRole("form", { name: `Удалить данные кандидата ${name}` });
    await expect(form).toBeVisible();
    const word = form.getByLabel(/Впишите «удалить»/);
    await expect(word).toBeFocused();

    // Не то слово: сервер отказывает, форма остаётся, ошибка стоит внутри неё. Enter в поле — фокус остался в поле
    await page.keyboard.type("не то");
    await page.keyboard.press("Enter");
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("впишите слово «удалить»");
    await expect(word).toBeFocused();

    // Нажали кнопку (мышь, касание, Enter на кнопке): она на время отправки отключилась, фокус слетел на <body> —
    // блок ставит его на строку ошибки, а не оставляет клавиатуру в начале страницы
    await word.fill("и это не то");
    await form.getByRole("button", { name: "Удалить безвозвратно" }).click();
    await expect(alert).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(open).toBeFocused();
  } finally {
    await cleanupCandidate({ candidateId });
  }
});

/**
 * Строка приглашения — самый глубокий блок, где есть и почта, и кнопка «Отозвать» (обёртки выше содержат и то и другое).
 * Тестовое приглашение одно на странице, поэтому `.last()` — самая вложенная строка.
 */
function inviteRow(page: import("@playwright/test").Page, email: string) {
  return page
    .locator("div")
    .filter({ hasText: email })
    .filter({ has: page.getByRole("button", { name: "Отозвать", exact: true }) })
    .last();
}

test("отзыв приглашения: одно нажатие с клавиатуры отзывает, вопроса нет, приглашение пропадает", async ({ page }) => {
  const email = `e2e-revoke-${Date.now()}@example.invalid`;
  const { invitationId } = await createInvitation({
    organizationId: ORG_ID,
    clientId: "cl_starfish",
    email,
    createdById: OWNER_ID,
  });

  try {
    await page.goto("/a/clients/cl_starfish");
    const row = inviteRow(page, email);
    const revoke = row.getByRole("button", { name: "Отозвать", exact: true });
    await expect(revoke).toBeVisible();
    expect((await invitationExists({ invitationId })).exists).toBe(true);

    await revoke.focus();
    await page.keyboard.press("Enter");

    // Одно нажатие — и всё: ни вопроса, ни «Да, отозвать», ни «Отмены» (с 13.10 по 16.10 они были)
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(page.getByText("Отозвать приглашение?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Да, отозвать" })).toHaveCount(0);
    expect((await invitationExists({ invitationId })).exists).toBe(false);
  } finally {
    await deleteInvitation({ invitationId });
  }
});

test("отзыв приглашения: если его уже убрал другой, ошибка стоит рядом с кнопкой, фокус на ней, кнопка доступна", async ({ page }) => {
  const email = `e2e-revoke-gone-${Date.now()}@example.invalid`;
  const { invitationId } = await createInvitation({
    organizationId: ORG_ID,
    clientId: "cl_starfish",
    email,
    createdById: OWNER_ID,
  });

  try {
    await page.goto("/a/clients/cl_starfish");
    const row = inviteRow(page, email);
    await expect(row.getByRole("button", { name: "Отозвать", exact: true })).toBeVisible();
    // Пока страница открыта, приглашение исчезает из базы (принято или отозвано в другой вкладке)
    await deleteInvitation({ invitationId });

    await row.getByRole("button", { name: "Отозвать", exact: true }).click();
    const alert = row.getByRole("alert");
    await expect(alert).toContainText("Приглашение не найдено");
    await expect(alert).toBeFocused();
    await expect(row.getByRole("button", { name: "Отозвать", exact: true })).toBeEnabled();
  } finally {
    await deleteInvitation({ invitationId });
  }
});

/**
 * Отзыв приглашения на телефоне (375 px, сенсорный экран): строка приглашения целая, ничего не накладывается и не
 * обрезано, а одно касание отзывает. Три экрана: страница клиента у агентства, «Сотрудники», настройки клиента.
 * До 16.10.2026 здесь замерялся открытый вопрос «Отозвать приглашение?» (он сжимал поле ссылки до двух букв); вопроса
 * больше нет, остаётся проверка закрытой строки и самого отзыва.
 */
test.describe("отзыв приглашения на телефоне: строка целая, одно касание отзывает", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  type Measure = {
    overflow: number;
    overlaps: string[];
    /** Элементы строки, у которых текст обрезан многоточием («Ссылка скр…») */
    clipped: string[];
  };

  /**
   * Строка приглашения — ближайший предок письма, где есть «Отозвать». Берём один раз и держим ссылку: после отзыва
   * строки в странице уже нет. Меряем листья: пересечение двух непересекающихся по дереву элементов — наложение на экране.
   */
  async function rowOf(page: import("@playwright/test").Page, email: string) {
    return page.evaluateHandle((mail) => {
      const hasRevoke = (node: Element) => [...node.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Отозвать");
      const holder = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent?.includes(mail));
      let row: Element | null = holder ?? null;
      while (row && !hasRevoke(row)) row = row.parentElement;
      if (!row) throw new Error("строка приглашения не найдена: " + mail);
      return row as HTMLElement;
    }, email);
  }

  async function measure(row: import("@playwright/test").JSHandle<HTMLElement>): Promise<Measure> {
    return row.evaluate((el) => {
      const shown = (e: Element) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
      };
      const all = [...el.querySelectorAll("button, code, p, span, a, div")].filter(
        (e) => shown(e) && (e.textContent?.trim().length ?? 0) > 0,
      );
      // Листья: у элемента нет внутри другого элемента с текстом
      const leaves = all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
      const rect = (e: Element) => e.getBoundingClientRect();
      const label = (e: Element) => (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const overlaps: string[] = [];
      for (let i = 0; i < leaves.length; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          const a = rect(leaves[i]);
          const b = rect(leaves[j]);
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1.5 && h > 1.5) overlaps.push(`«${label(leaves[i])}» × «${label(leaves[j])}» (${Math.round(w)}×${Math.round(h)})`);
        }
      }
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        overlaps,
        clipped: leaves.filter((e) => e.scrollWidth > e.clientWidth + 1).map(label),
      };
    });
  }

  async function checkRow(page: import("@playwright/test").Page, email: string, invitationId: string) {
    const row = await rowOf(page, email);
    const closed = await measure(row);
    expect(closed.overflow, "страница не прокручивается вбок").toBeLessThanOrEqual(0);
    expect(closed.overlaps, "строка приглашения: ничего не накладывается").toEqual([]);
    expect(closed.clipped, "строка приглашения: подписи не обрезаны многоточием").toEqual([]);

    // «Отозвать» именно этой строки: на экране их несколько
    const revoke = (await row.evaluateHandle((el) => [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Отозвать")!)).asElement()!;
    await revoke.scrollIntoViewIfNeeded();
    await revoke.tap();

    // Одно касание: вопроса нет, строка пропала, приглашение удалено
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(page.getByText("Отозвать приглашение?")).toHaveCount(0);
    expect((await invitationExists({ invitationId })).exists).toBe(false);
    await row.dispose();
  }

  test("страница клиента у агентства", async ({ page }) => {
    const email = `e2e-revoke-m1-${Date.now()}@example.invalid`;
    const { invitationId } = await createInvitation({ organizationId: ORG_ID, clientId: "cl_starfish", email, createdById: OWNER_ID });
    try {
      await page.goto("/a/clients/cl_starfish");
      await checkRow(page, email, invitationId);
    } finally {
      await deleteInvitation({ invitationId });
    }
  });

  test("«Сотрудники»: приглашение со ссылкой и приглашение с подсказкой вместо ссылки", async ({ page }) => {
    const stamp = Date.now();
    const withLink = `e2e-revoke-m2-${stamp}@example.invalid`;
    const noLink = `e2e-revoke-m3-${stamp}@example.invalid`;
    const first = await createInvitation({
      organizationId: ORG_ID,
      clientId: null,
      role: "RECRUITER",
      email: withLink,
      createdById: OWNER_ID,
      withLink: true,
    });
    const second = await createInvitation({ organizationId: ORG_ID, clientId: null, role: "RECRUITER", email: noLink, createdById: OWNER_ID });
    try {
      await page.goto("/a/team");
      await expect(page.getByText(withLink)).toBeVisible();
      await expect(page.getByText("Ссылка скрыта").first()).toBeVisible();
      await checkRow(page, withLink, first.invitationId);
      // Подсказка вместо ссылки: именно она вставала столбцом шириной около 90 px
      await expect(page.getByText(/Ссылку видит тот, кто мог бы выдать эту роль/)).toBeVisible();
      await checkRow(page, noLink, second.invitationId);
    } finally {
      await deleteInvitation({ invitationId: first.invitationId });
      await deleteInvitation({ invitationId: second.invitationId });
    }
  });

  test.describe("настройки клиента", () => {
    test.use({ storageState: "tests/e2e/.auth/client-admin.json" });

    test("приглашение со ссылкой и приглашение без неё", async ({ page }) => {
      const stamp = Date.now();
      const withLink = `e2e-revoke-m4-${stamp}@example.invalid`;
      const noLink = `e2e-revoke-m5-${stamp}@example.invalid`;
      const first = await createInvitation({ organizationId: ORG_ID, clientId: "cl_starfish", email: withLink, createdById: OWNER_ID, withLink: true });
      const second = await createInvitation({ organizationId: ORG_ID, clientId: "cl_starfish", email: noLink, createdById: OWNER_ID });
      try {
        await page.goto("/settings");
        await expect(page.getByText(withLink)).toBeVisible();
        await expect(page.getByText("Ссылка скрыта").first()).toBeVisible();
        await checkRow(page, withLink, first.invitationId);
        await expect(page.getByText(/Ссылку показать нельзя/)).toBeVisible();
        await checkRow(page, noLink, second.invitationId);
      } finally {
        await deleteInvitation({ invitationId: first.invitationId });
        await deleteInvitation({ invitationId: second.invitationId });
      }
    });
  });
});
