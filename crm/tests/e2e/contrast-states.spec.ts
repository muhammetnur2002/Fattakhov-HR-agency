import { expect, test, type Page } from "@playwright/test";

/**
 * Контраст и состояния, которые тест токенов (tests/contrast-tokens.test.ts)
 * увидеть не может: порядок вариантов Tailwind и вычисленные цвета в
 * настоящем браузере.
 *
 * Публичные страницы — без сессии.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** Любой CSS-цвет (oklab, color-mix…) → sRGB: через canvas, парсить строку вручную нельзя. */
async function contrastOf(page: Page, fg: string, bg: string): Promise<number> {
  return page.evaluate(
    ([a, b]) => {
      const toRgb = (c: string) => {
        const k = document.createElement("canvas");
        k.width = k.height = 1;
        const x = k.getContext("2d", { willReadFrequently: true })!;
        x.fillStyle = c;
        x.fillRect(0, 0, 1, 1);
        return [...x.getImageData(0, 0, 1, 1).data];
      };
      const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const [hi, lo] = [lum(toRgb(a)), lum(toRgb(b))].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    },
    [fg, bg],
  );
}

test("поле с ошибкой в фокусе: кольцо фокуса полным цветом, а не бледное кольцо ошибки", async ({ page }) => {
  await page.goto("/login");
  const input = page.locator("#email");
  // Поле входа получает фокус само — для «покоя» его сначала снимаем
  await input.evaluate((el) => {
    el.blur();
    el.setAttribute("aria-invalid", "true");
  });

  // В покое — бледное кольцо ошибки (20%), чтобы поле с ошибкой было заметно
  const idle = await input.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(idle).toMatch(/\/ 0\.2\)/);

  await input.focus();
  await expect
    .poll(async () => input.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 3000 })
    .not.toMatch(/\/ 0\.2\)/);

  // На фокусе кольцо одно и непрозрачное: 3px полного цвета
  const focused = await input.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(focused).toMatch(/0px 0px 0px 3px/);
  expect(focused).not.toMatch(/\/ 0\.\d+\) 0px 0px 0px 3px/);
});

test("регистрация: кнопка до согласия — aria-disabled с читаемым текстом, а не прозрачность 50%", async ({
  page,
}) => {
  await page.goto("/register");
  const button = page.getByRole("button", { name: "Получить код по SMS" });
  const phone = page.locator("#quick-phone");
  // Ввод до гидратации не доходит до состояния формы. Признак гидратации — React
  // повесил на элемент свои свойства (`__reactProps$…`)
  await page.waitForFunction(() => {
    const el = document.querySelector("#quick-phone");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  });
  // Первое состояние — номер ещё пуст: кнопка настоящий disabled, но подпись всё равно читается
  // (у disabled своя прозрачность 50% давала 2:1)
  await expect(button).toBeDisabled();
  const initial = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor, opacity: s.opacity };
  });
  expect(initial.opacity).toBe("1");
  expect(await contrastOf(page, initial.color, initial.background)).toBeGreaterThanOrEqual(4.5);

  await phone.click();
  await phone.pressSequentially("+7 900 123-45-67", { delay: 20 });
  // Нажать можно: подсветится галочка согласия. Свойство `disabled`, а не toBeEnabled():
  // Playwright считает недоступным и элемент с aria-disabled="true"
  await expect(button).toHaveJSProperty("disabled", false);
  await expect(button).toHaveAttribute("aria-disabled", "true");

  const { color, background, opacity } = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor, opacity: s.opacity };
  });
  expect(opacity).toBe("1");
  expect(await contrastOf(page, color, background)).toBeGreaterThanOrEqual(4.5);
});

test("печать из тёмной темы: светлая палитра на белой бумаге, а не светлый текст на белом", async ({ page }) => {
  // Тёмная тема выбрана так же, как её выбирает человек: ключ в localStorage до загрузки страницы
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  const read = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { color: s.color, background: s.backgroundColor };
    });

  // На экране тёмная тема остаётся тёмной: правило касается только печати
  await page.emulateMedia({ media: "screen" });
  const screen = await read();
  expect(await contrastOf(page, screen.color, "rgb(255 255 255)")).toBeLessThan(3);

  await page.emulateMedia({ media: "print" });
  const print = await read();
  // Текст читается и на белой бумаге (принтер не печатает фон), и на фоне страницы
  expect(await contrastOf(page, print.color, "rgb(255 255 255)")).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page, print.color, print.background)).toBeGreaterThanOrEqual(4.5);
});
