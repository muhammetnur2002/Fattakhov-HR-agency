/**
 * Карточка «Заявки с сайта»: фиксированная сетка, одинаковая у всех заявок.
 *
 * Сверка по скриншоту заказчика: подпись «Связь» (формальнее — «Контакт»); строки
 * «Вакансий» и «Сайт» то были, то нет, заметка — самодельная врезка; колонка кнопок
 * справа меняла ширину от статуса, и вторая колонка полей съезжала от карточки к
 * карточке. Раскладку в браузере меряет tests/e2e/leads-layout.spec.ts, поведение
 * кнопок — tests/components/lead-actions.test.tsx.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const page = readFileSync(join(ROOT, "app/(agency)/a/leads/page.tsx"), "utf8");

describe("карточка заявки", () => {
  it("подпись — «Контакт», а не «Связь»", () => {
    expect(page).toContain('label="Контакт"');
    expect(page).not.toMatch(/>\s*Связь\s*</);
    expect(page).not.toContain('label="Связь"');
  });

  it("поля выводятся всегда: пустое — прочерк, а не пропуск строки", () => {
    for (const label of ["Контакт", "Вакансий", "Сайт", "Пришла", "Заметка"]) {
      expect(page, label).toContain(`<LeadField label="${label}"`);
    }
    // условного вывода полей нет
    expect(page).not.toMatch(/\{lead\.(vacancies|website|note)\s*&&/);
    expect(page).toContain('"—"');
  });

  it("заметка — через Panel, без самодельной врезки", () => {
    expect(page).toMatch(/<Panel tone="muted"/);
    expect(page).not.toMatch(/rounded-md bg-muted/);
  });

  it("кнопки — отдельной строкой внизу, а не колонкой справа переменной ширины", () => {
    expect(page).not.toMatch(/grid-cols-\[1fr_auto\]/);
    expect(page).not.toMatch(/lg:text-right/);
    expect(page.indexOf("<LeadActions")).toBeGreaterThan(page.indexOf("<Panel"));
  });

  it("кнопки заявки одного размера sm: выше не делаем (решение заказчицы про ≈31px на телефоне)", () => {
    const actions = readFileSync(new URL("../app/(agency)/a/leads/lead-actions.tsx", import.meta.url), "utf8");
    expect(actions).not.toMatch(/size: "(lg|default)"/);
    expect((actions.match(/size: "sm"/g) ?? []).length).toBe(3);
  });
});
