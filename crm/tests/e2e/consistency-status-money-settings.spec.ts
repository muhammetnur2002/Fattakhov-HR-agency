/**
 * Единообразие кабинета в настоящем браузере (12.10.2026): бейджи статусов, деньги, поля и настройки.
 *
 * Разметку и словари держат vitest-сторожа (tests/status-badge-rule, format-money, field-components,
 * settings-structure); здесь то, что видно только в браузере: контраст бейджей в светлой и тёмной
 * темах, перенос строки перед «₽», подпись выбранного файла, якорная навигация и заголовки.
 * Контраст считает axe-core из node_modules — свой расчёт поверх прозрачных плашек не нужен.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { expectSoundOutline, headingOutline } from "./fixtures/headings";

test.use({ storageState: "tests/e2e/.auth/owner.json", reducedMotion: "reduce" });

const axeSource = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

async function axeViolations(page: Page, rules: string[]) {
  await page.evaluate(axeSource);
  return page.evaluate(async (ids) => {
    // @ts-expect-error axe подключён строкой выше
    const result = await axe.run(document, { runOnly: ids });
    return result.violations.map((v: { id: string; nodes: { target: string[] }[] }) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  }, rules);
}

test.describe("бейджи статусов", () => {
  test("вакансии: тон следует за смыслом, красного нет", async ({ page }) => {
    await page.goto("/a/vacancies", { waitUntil: "networkidle" });
    const badges = await page
      .locator('[data-slot="badge"][data-tone]')
      .evaluateAll((els) => els.map((e) => ({ text: e.textContent?.trim() ?? "", tone: e.getAttribute("data-tone") })));
    const toneOf = (text: string) => badges.find((b) => b.text === text)?.tone;
    expect(toneOf("В работе")).toBe("progress");
    expect(toneOf("Черновик")).toBe("neutral");
    expect(toneOf("Закрыта наймом")).toBe("success");
    // «Заявка отправлена» — ход агентства, клиент ничего не должен: не красная и не жёлтая
    expect(toneOf("Заявка отправлена")).toBe("progress");
    expect(badges.filter((b) => b.tone === "danger")).toEqual([]);
  });

  test("этап воронки в шапке заявки — серая метка без тона, как в списках: цвета у этапа нет", async ({ page }) => {
    await page.goto("/a/applications/app_1", { waitUntil: "networkidle" });
    const stage = page.locator("main h1 + [data-slot=\"badge\"]");
    await expect(stage).toHaveCount(1);
    await expect(stage).toHaveAttribute("data-variant", "secondary");
    await expect(stage).not.toHaveAttribute("data-tone", /.+/);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`контраст бейджей и текста не ниже AA: ${scheme} тема`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["/a/vacancies", "/a/clients", "/a/clients/cl_lead", "/a/finance", "/a/leads", "/a/candidates", "/a/settings"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        expect(await axeViolations(page, ["color-contrast"]), `${scheme}: ${path}`).toEqual([]);
      }
    });
  }
});

test.describe("деньги", () => {
  async function rubleStartsLine(page: Page): Promise<string[]> {
    // «₽» не должен оказаться первым на строке: сравниваем высоту символа и предыдущего за ним
    return page.evaluate(() => {
      const bad: string[] = [];
      const walker = document.createTreeWalker(document.querySelector("main") as Element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (let i = 1; i < text.length; i++) {
          if (text[i] !== "₽") continue;
          const range = document.createRange();
          range.setStart(node, i - 1);
          range.setEnd(node, i);
          const before = range.getBoundingClientRect();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const sign = range.getBoundingClientRect();
          if (sign.height > 0 && Math.abs(sign.top - before.top) > 2) bad.push(text.trim().slice(0, 60));
        }
      }
      return bad;
    });
  }

  for (const [name, viewport] of [["ноутбук", { width: 1440, height: 900 }], ["телефон", { width: 360, height: 800 }]] as const) {
    test(`знак «₽» не отрывается от суммы: ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of ["/a/vacancies", "/a/candidates", "/a/finance", "/a/vacancies/vac_1"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        expect(await rubleStartsLine(page), path).toEqual([]);
      }
    });
  }

  test("вилка пишется «от … до …» одним способом: список и карточка вакансии", async ({ page }) => {
    await page.goto("/a/vacancies", { waitUntil: "networkidle" });
    const list = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(list).toMatch(/от 140 000 до 190 000 ₽/);
    expect(list).not.toMatch(/\d–\d/);
    await page.goto("/a/vacancies/vac_3", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Бриф" }).click();
    const card = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(card).toMatch(/от 140 000 до 190 000 ₽/);
  });
});

test.describe("поля", () => {
  test("файловое поле: подпись «Файл не выбран», после выбора — имя и размер, слишком большой — ошибка", async ({ page }) => {
    await page.goto("/a/candidates/cand_1", { waitUntil: "networkidle" });
    const field = page.locator('[data-slot="file-input"]').first();
    await expect(field).toContainText("Выбрать файл");
    await expect(field).toContainText("Файл не выбран");

    const input = field.locator("input[type=file]");
    await input.setInputFiles({ name: "резюме.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(2048) });
    await expect(field).toContainText("резюме.pdf");
    await expect(field).toContainText("2 КБ");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");

    await input.setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(21 * 1024 * 1024) });
    await expect(page.getByText("Файл больше 20 МБ")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("фокус клавиатурой виден на плашке: кольцо вокруг всего поля, а не вокруг невидимого input", async ({ page }) => {
    await page.goto("/a/candidates/cand_1", { waitUntil: "networkidle" });
    const field = page.locator('[data-slot="file-input"]').first();
    await field.locator("input[type=file]").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const shadow = await field.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe("none");
  });

  test("список (NativeSelect): отключённый и тёмная тема — как у остальных полей, высота не ниже поля", async ({ page }) => {
    await page.goto("/a/settings", { waitUntil: "networkidle" });
    const select = page.locator('[data-slot="native-select"]').first();
    const box = await select.boundingBox();
    const input = await page.locator('[data-slot="input"]').first().boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual((input?.height ?? 0) - 1);
    await select.evaluate((el) => ((el as HTMLSelectElement).disabled = true));
    expect(await select.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.5");
  });
});

test.describe("настройки агентства", () => {
  test("четыре раздела, навигация по якорям, h1 → h2 → h3", async ({ page }) => {
    await page.goto("/a/settings", { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Разделы настроек" });
    await expect(nav.getByRole("link")).toHaveText(["Безопасность", "Уведомления", "Организация", "Журналы и данные"]);
    expectSoundOutline(await headingOutline(page));
    const sections = await page.locator("main section[aria-labelledby] > div > h2").allTextContents();
    expect(sections).toEqual(["Безопасность входа", "Уведомления и каналы", "Организация и команда", "Журналы и персональные данные"]);
  });

  test("заголовок раздела весит как остальные h2 кабинета: 500, а не 600", async ({ page }) => {
    await page.goto("/a/settings", { waitUntil: "networkidle" });
    const weights = await page
      .locator("main section[aria-labelledby] > div > h2")
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).fontWeight));
    expect(weights.length).toBeGreaterThan(0);
    expect(new Set(weights)).toEqual(new Set(["500"]));
  });

  test("якорь прокручивает к разделу, заголовок не уходит под шапку", async ({ page }) => {
    await page.goto("/a/settings", { waitUntil: "networkidle" });
    await page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("link", { name: "Организация" }).click();
    await expect(page).toHaveURL(/#organization$/);
    const heading = page.getByRole("heading", { level: 2, name: "Организация и команда" });
    await expect(heading).toBeInViewport();
    const [headerBottom, top] = await Promise.all([
      page.locator("[data-app-header]").evaluate((el) => el.getBoundingClientRect().bottom),
      heading.evaluate((el) => el.getBoundingClientRect().top),
    ]);
    expect(top).toBeGreaterThanOrEqual(headerBottom - 1);
  });

  test("на телефоне навигация в одну-две строки и без прокрутки вбок", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/a/settings", { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Разделы настроек" });
    await expect(nav).toBeVisible();
    expect((await nav.boundingBox())?.height).toBeLessThan(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("ссылки «Открыть» различаются доступным именем", async ({ page }) => {
    await page.goto("/a/settings", { waitUntil: "networkidle" });
    const names = await page.getByRole("link", { name: /: открыть$/ }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.sort()).toEqual(["Журнал входов: открыть", "Персональные данные: открыть", "Сотрудники: открыть"]);
  });
});

test.describe("доступность", () => {
  test("axe: на ключевых страницах нет нарушений (подписи, ориентиры, имена кнопок)", async ({ page }) => {
    const rules = ["button-name", "link-name", "label", "landmark-unique", "aria-valid-attr-value", "aria-required-attr", "select-name", "image-alt"];
    for (const path of ["/a", "/a/vacancies", "/a/candidates/cand_1", "/a/settings", "/a/messages", "/a/finance", "/a/clients/cl_starfish", "/a/reviews/students"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await axeViolations(page, rules), path).toEqual([]);
    }
  });

  test("ни у одного интерактивного элемента нет имени только латиницей", async ({ page }) => {
    for (const path of ["/a/vacancies", "/a/candidates", "/a/settings", "/a/messages"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      const names = await page.evaluate(() =>
        [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=tab]")]
          .map((el) => el.getAttribute("aria-label") || el.getAttribute("title") || "")
          .filter((n) => /[A-Za-z]{3,}/.test(n) && !/[А-Яа-яЁё]/.test(n) && !/@|https?:|Fattakhov|Telegram/.test(n)),
      );
      expect(names, path).toEqual([]);
    }
  });

  test("тосты читаются по-русски: у региона уведомлений русская подпись", async ({ page }) => {
    await page.goto("/a", { waitUntil: "networkidle" });
    const label = await page.locator("section[aria-live=polite][aria-label]").first().getAttribute("aria-label");
    expect(label).toMatch(/^Уведомления/);
  });
});
