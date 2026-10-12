import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { loginAs } from "./dev-totp";
import { createSelfRegisteredClient, deleteSelfRegisteredClient } from "./fixtures/db-client";

/**
 * Формы кабинета и входа без скриптов: поля не уходят в адресную строку.
 *
 * Форма с `onSubmit` и `preventDefault`, у которой нет `action` и `method`, до загрузки скриптов — обычная
 * HTML-форма, а обычная форма уходит GET-ом: `/settings?proof=<пароль>`, `/onboarding?company=<название>`.
 * Проверено на настоящем сервере (12.10.2026) двумя способами:
 *
 * - файлы скриптов Next не загружаются (`route.abort`), а встроенные в страницу — работают. Так выглядит медленный
 *   телефон или блокировщик, и это единственный способ посмотреть кабинет без скриптов: при полностью выключенном
 *   JavaScript потоковая выдача Next не раскрывает содержимое страницы, и от кабинета остаётся скелет;
 * - JavaScript выключен вовсе (`javaScriptEnabled: false`) — для публичной страницы входа, которая отдаётся целиком.
 *
 * Условие общее: после отправки в адресе нет запроса с полями. Приёмник — `app/api/no-script-form/route.ts`.
 */

const PASSWORD = "e2e-secret-password-123";
const SCRIPTS = /\/_next\/static\/.*\.js(\?.*)?$/;
// Контекст, созданный вручную, наследует сессию проекта (рекрутёр): без пустой страница входа уводила бы в кабинет
const ANONYMOUS = { cookies: [], origins: [] };

/** Контекст, в котором скрипты Next не приходят: разметка сервера есть, гидрации не будет. */
async function withoutScripts(
  browser: Browser,
  baseURL: string | undefined,
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>> | string = ANONYMOUS,
) {
  const context = await browser.newContext({ baseURL, storageState });
  await context.route(SCRIPTS, (route) => route.abort());
  return context;
}

/** Адреса POST-запросов к приёмнику: форма ушла к нему, а не GET-ом на страницу. */
function receiverPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on("response", (response) => {
    if (response.request().method() === "POST" && new URL(response.url()).pathname === "/api/no-script-form") {
      posts.push(`${response.status()}`);
    }
  });
  return posts;
}

function expectNoQuery(page: Page, path: string) {
  const url = new URL(page.url());
  expect(url.pathname).toBe(path);
  expect(url.search, "поля формы не должны попасть в адрес").toBe("");
}

test.describe("страница входа, ещё не вошли", () => {
  test("JavaScript выключен: форма телефона — POST на приёмник, а не GET", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, storageState: ANONYMOUS });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      const form = page.locator("form:has(#quick-phone)");
      await expect(form).toHaveAttribute("method", "post");
      await expect(form).toHaveAttribute("action", "/api/no-script-form");

      await page.locator("#quick-phone").fill("+7 900 123-45-67");
      await page.locator("#quick-phone").press("Enter");
      // Кнопка до скриптов выключена (поле пусто в разметке сервера), и всё же адрес остаётся чистым
      expectNoQuery(page, "/login");
    } finally {
      await context.close();
    }
  });

  test("скрипты не загрузились: отправка телефона уходит на приёмник и возвращает на вход без запроса", async ({ browser, baseURL }) => {
    const context = await withoutScripts(browser, baseURL);
    try {
      const page = await context.newPage();
      const posts = receiverPosts(page);
      await page.goto("/login");
      const form = page.locator("form:has(#quick-phone)");
      await form.locator("#quick-phone").fill("+7 900 123-45-67");
      // requestSubmit — как отправка по автозаполнению: кнопка выключена, а форма всё равно может уйти
      await Promise.all([page.waitForURL(() => true).catch(() => null), form.evaluate((f: HTMLFormElement) => f.requestSubmit())]);
      await expect.poll(() => posts).toEqual(["303"]);
      expectNoQuery(page, "/login");
    } finally {
      await context.close();
    }
  });
});

test.describe("настройки клиента: подтверждение паролем для 2FA", () => {
  test("скрипты не загрузились: пароль не попадает в адрес", async ({ browser, baseURL }) => {
    const context = await withoutScripts(browser, baseURL, "tests/e2e/.auth/client-admin.json");
    try {
      const page = await context.newPage();
      const posts = receiverPosts(page);
      await page.goto("/settings");
      const field = page.locator("#proof");
      await field.fill(PASSWORD);
      await field.press("Enter");
      await expect.poll(() => posts).toEqual(["303"]);
      expectNoQuery(page, "/settings");
      expect(page.url()).not.toContain("proof");
      expect(page.url()).not.toContain(PASSWORD);
    } finally {
      await context.close();
    }
  });
});

test.describe("компания, зарегистрировавшаяся сама", () => {
  const email = `e2e-no-script-${Date.now()}@example.test`;

  test.beforeAll(async () => {
    await createSelfRegisteredClient({ email, briefCompleted: false });
  });
  test.afterAll(async () => {
    await deleteSelfRegisteredClient({ email });
  });

  test("анкета без скриптов: ответ не попадает в адрес", async ({ browser, baseURL }) => {
    // Вход обычным браузером, дальше — тот же сеанс, но без скриптов
    const signIn = await browser.newContext({ baseURL, storageState: ANONYMOUS });
    const state = await (async () => {
      const page = await signIn.newPage();
      await loginAs(page, email, "demo1234");
      return signIn.storageState();
    })();
    await signIn.close();

    const context = await withoutScripts(browser, baseURL, state);
    try {
      const page = await context.newPage();
      const posts = receiverPosts(page);
      await page.goto("/onboarding");
      const field = page.locator('form input[name="company"]');
      await field.fill("ООО Секретная Компания");
      await field.press("Enter");
      await expect.poll(() => posts).toEqual(["303"]);
      expectNoQuery(page, "/onboarding");
      expect(decodeURIComponent(page.url())).not.toContain("Секретная");
    } finally {
      await context.close();
    }
  });
});

test.describe("поиск по кабинету", () => {
  test("скрипты не загрузились: поиск — обычный GET на страницу поиска с запросом", async ({ browser, baseURL }) => {
    const context = await withoutScripts(browser, baseURL, "tests/e2e/.auth/recruiter.json");
    try {
      const page = await context.newPage();
      await page.goto("/a");
      const field = page.locator('[data-app-header] input[aria-label="Поиск по кабинету"]');
      await field.fill("Иван");
      await field.press("Enter");
      await page.waitForURL(/\/a\/search\?/, { timeout: 10_000 });
      // Запрос в адресе — задуманный результат поиска, не утечка: тот же адрес строит router.push после скриптов
      expect(new URL(page.url()).searchParams.get("q")).toBe("Иван");
    } finally {
      await context.close();
    }
  });
});

test.describe("загрузка договора", () => {
  const email = `e2e-no-script-contract-${Date.now()}@example.test`;

  test.beforeAll(async () => {
    // Анкета пройдена, договора нет: в «Документах» — форма загрузки скана
    await createSelfRegisteredClient({ email, briefCompleted: true });
  });
  test.afterAll(async () => {
    await deleteSelfRegisteredClient({ email });
  });

  test("скрипты не загрузились: файл уходит серверному действию POST-ом, а не GET-ом с именем файла в адресе", async ({ browser, baseURL }) => {
    const signIn = await browser.newContext({ baseURL, storageState: ANONYMOUS });
    const state = await (async () => {
      const page = await signIn.newPage();
      await loginAs(page, email, "demo1234");
      return signIn.storageState();
    })();
    await signIn.close();

    const context = await withoutScripts(browser, baseURL, state);
    try {
      const page = await context.newPage();
      await page.goto("/documents");
      const form = page.locator("form:has(#signedContract)");
      await expect(form).toHaveAttribute("method", /post/i);

      // Тип, который сервер отвергает до записи: проверка идёт без побочных эффектов (ничего не сохраняется)
      await form.locator("#signedContract").setInputFiles({ name: "секретный-договор.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
      await form.locator("button[type=submit]").click();
      await page.waitForLoadState("load");
      expectNoQuery(page, "/documents");
      expect(decodeURIComponent(page.url())).not.toContain("секретный");
      // Отказ сервера виден без скриптов: форма над FormData отвечает страницей, а не пустым обновлением
      await expect(page.getByText("Такой тип файла не поддерживается")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
