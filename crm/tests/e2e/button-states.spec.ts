/**
 * Состояния кнопки: обычное, наведение, нажатие, загрузка.
 *
 * Пользователь всегда должен понимать, что происходит. До 08.10.2026 при
 * отправке формы кнопка только меняла текст на «…» и бледнела до 50% —
 * так же, как выключенная. Теперь у загрузки полный цвет, индикатор,
 * aria-busy и блокировка повторного нажатия.
 *
 * Ответ сервера замедляется искусственно (route + задержка), чтобы
 * состояние успело разглядеть: на локальном сервере оно длится миллисекунды.
 */
import { expect, test, type Locator } from "@playwright/test";

const bg = (el: Locator) => el.evaluate((n) => getComputedStyle(n).backgroundColor);
const opacity = (el: Locator) => el.evaluate((n) => Number(getComputedStyle(n).opacity));

// У кнопки transition-all: цвет и прозрачность меняются за ~150мс, поэтому
// значения читаем с ожиданием, а не сразу после действия
const settled = (read: () => Promise<unknown>, expected: unknown) => expect.poll(read).toBe(expected);

test("кнопка отправки: загрузка с индикатором, полным цветом и блокировкой", async ({ page }) => {
  await page.goto("/a/settings", { waitUntil: "networkidle" });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/a/settings", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });

  // Текст кнопки при отправке меняется («Сохранить» → «Сохраняем…»), поэтому
  // ищем по обоим, иначе локатор перескочит на другую кнопку
  const save = page.locator('[data-slot="button"]', { hasText: /Сохран/ }).first();
  await expect(save).toBeEnabled();
  expect(await opacity(save), "обычная кнопка — полный цвет").toBe(1);
  await expect(save.locator("svg.animate-spin")).toHaveCount(0);

  await save.click();

  // Идёт отправка
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(save).toBeDisabled();
  await expect(save.locator("svg.animate-spin")).toHaveCount(1);
  await settled(() => opacity(save), 1);

  release();
  await expect(save).not.toHaveAttribute("aria-busy", "true");
  await expect(save.locator("svg.animate-spin")).toHaveCount(0);
});

test("выключенная кнопка бледнее обычной, загрузка — нет", async ({ page }) => {
  await page.goto("/a/settings", { waitUntil: "networkidle" });
  const save = page.locator('[data-slot="button"]', { hasText: /Сохран/ }).first();

  // Выключаем руками: проверяем только вид, а не логику формы
  await save.evaluate((n) => ((n as HTMLButtonElement).disabled = true));
  await settled(() => opacity(save), 0.5);
});

test("основная кнопка: наведение и нажатие меняют цвет, нажатие темнее наведения", async ({ page }) => {
  await page.goto("/a/candidates", { waitUntil: "networkidle" });
  const button = page.getByRole("link", { name: "Добавить" }).first();
  await expect(button).toBeVisible();

  const rest = await bg(button);
  await button.hover();
  await expect.poll(() => bg(button), "наведение меняет фон").not.toBe(rest);
  const hover = await bg(button);

  await page.mouse.down();
  // Нажатие — свой токен --primary-active, заметно темнее наведения (11.10.2026: раньше был тот же цвет)
  await expect.poll(() => bg(button), "нажатие отличается от наведения").not.toBe(hover);
  const pressed = await bg(button);
  expect(brightness(pressed), "нажатие темнее наведения").toBeLessThan(brightness(hover));
  expect(brightness(hover), "наведение темнее покоя").toBeLessThan(brightness(rest));
  await page.mouse.up();
});

/** Яркость цвета `rgb(r, g, b)` — для сравнения «темнее / светлее». */
function brightness(color: string): number {
  const [r, g, b] = color.match(/\d+(?:\.\d+)?/g)!.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe("нажатие на сенсорном экране", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  /** Принудительное `:active` без мыши: пальцем зажать кнопку и снять с неё кадр нельзя. */
  async function forceActive(page: import("@playwright/test").Page, selector: string) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
  }

  test("палец: кнопка заметно темнеет и чуть сжимается", async ({ page }) => {
    await page.goto("/a/candidates", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "эмуляция пальца включена").toBe(true);
    const button = page.getByRole("link", { name: "Добавить" }).first();
    await expect(button).toBeVisible();
    const rest = await bg(button);
    expect(await button.evaluate((n) => getComputedStyle(n).scale)).toBe("none");

    await button.evaluate((n) => n.setAttribute("data-pressed-probe", ""));
    await forceActive(page, "[data-pressed-probe]");
    await expect.poll(() => button.evaluate((n) => getComputedStyle(n).scale), "сжатие 0.98").toBe("0.98");
    const pressed = await bg(button);
    expect(pressed).not.toBe(rest);
    expect(brightness(pressed), "нажатие темнее покоя заметно").toBeLessThan(brightness(rest) * 0.8);
  });
});

test("мышь: кнопка при нажатии не сжимается (сжатие только на сенсорном экране)", async ({ page }) => {
  await page.goto("/a/candidates", { waitUntil: "networkidle" });
  const button = page.getByRole("link", { name: "Добавить" }).first();
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => button.evaluate((n) => getComputedStyle(n).scale)).toBe("none");
  await page.mouse.up();
});
