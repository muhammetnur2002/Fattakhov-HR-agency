/**
 * Панель вкладки показывает, что фокус на ней.
 *
 * Radix делает панель (role="tabpanel") остановкой Tab: tabindex=0. У `TabsContent` стоял голый `outline-none`,
 * и приёмка 15.10.2026 нашла «немую» остановку: человек жмёт Tab, на экране ничего не меняется (WCAG 2.4.7) —
 * на /register, странице вакансии, клиента и настройках ПДн. Здесь настоящие нажатия Tab до панели и вычисленный
 * контур. Тема — обе: цвет кольца своё у каждой.
 */
import { expect, test, type Page } from "@playwright/test";

async function tabToPanel(page: Page, max = 80) {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        role: el.getAttribute("role"),
        focusVisible: el.matches(":focus-visible"),
        style: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        color: cs.outlineColor,
        shadow: cs.boxShadow,
        box: el.getBoundingClientRect().width,
      };
    });
    if (info.role === "tabpanel") return { presses, ...info };
  }
  return null;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} тема`, () => {
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test.describe("публичная регистрация", () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test("/register: Tab после списка вкладок заходит на панель и контур виден", async ({ page }) => {
        await page.goto("/register", { waitUntil: "networkidle" });
        const panel = await tabToPanel(page);
        expect(panel, "до панели вкладки Tab не дошёл").not.toBeNull();
        expect(panel!.focusVisible).toBe(true);
        expect(panel!.style, "контур у панели").not.toBe("none");
        expect(panel!.width).toBeGreaterThanOrEqual(2);
      });
    });

    test.describe("кабинет агентства", () => {
      test.use({ storageState: "tests/e2e/.auth/owner.json" });

      for (const path of ["/a/vacancies/vac_1", "/a/clients/cl_starfish", "/a/settings/pdn"]) {
        test(`${path}: панель вкладки в фокусе обведена`, async ({ page }) => {
          await page.goto(path, { waitUntil: "networkidle" });
          const panel = await tabToPanel(page);
          expect(panel, "до панели вкладки Tab не дошёл").not.toBeNull();
          expect(panel!.focusVisible).toBe(true);
          expect(panel!.style, "контур у панели").not.toBe("none");
          expect(panel!.width).toBeGreaterThanOrEqual(2);
          // кольцо не прозрачное: цвет — токен --ring, а не transparent
          expect(panel!.color).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        });
      }
    });
  });
}
