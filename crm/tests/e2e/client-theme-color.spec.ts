import { expect, test } from "@playwright/test";

/**
 * Полоса браузера (meta theme-color) следует за переключателем темы.
 *
 * Система тёмная, человек нажимает «светлая» — страница светлая, и полоса
 * должна стать светлой тоже, а не остаться чёрной по теме системы.
 * Меряется цвет, который выберет браузер: первый тег, у которого нет media
 * или оно подходит текущей системной теме. Цвет, а не его запись: у тега-перебивки
 * запись нарочно другая («#EEEDEA», «#000»), чем у тегов Next, иначе React забирает
 * его себе при гидратации (lib/theme-color.ts).
 */
const LIGHT = "#eeedea";
const DARK = "#000000";

test.use({ colorScheme: "dark" });

const effectiveColor = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      const media = meta.getAttribute("media");
      if (!media || matchMedia(media).matches) {
        const hex = (meta.getAttribute("content") ?? "").trim().toLowerCase();
        return /^#[0-9a-f]{3}$/.test(hex) ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
      }
    }
    return null;
  });

const countMetas = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.querySelectorAll('meta[name="theme-color"]').length);

test("тёмная система → переключатель на светлую → полоса светлая, и обратно", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  expect(await effectiveColor(page), "по умолчанию полоса как в системе").toBe(DARK);

  const toggle = page.getByRole("button", { name: "Переключить тему" });
  await toggle.click(); // тёмная → светлая
  await expect.poll(() => effectiveColor(page)).toBe(LIGHT);

  await toggle.click(); // светлая → тёмная
  await expect.poll(() => effectiveColor(page)).toBe(DARK);
});

test("выбор помнится после перезагрузки: полоса светлая с первого кадра, лишних тегов нет", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  expect(await effectiveColor(page)).toBe(LIGHT);
  // Два тега Next и один наш. Правка тегов Next до гидратации плодила дубли.
  expect(await countMetas(page)).toBe(3);
});

test("переход между разделами не возвращает системный цвет и не плодит теги", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await page.goto("/vacancies");
  await page.waitForLoadState("networkidle");

  expect(await effectiveColor(page)).toBe(LIGHT);
  expect(await countMetas(page)).toBe(3);
});

test("страница не жалуется на гидратацию из-за правки <head>", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});
