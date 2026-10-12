/**
 * Быстрые исправления по добору чек-апа 08.10.2026 — защита от возврата.
 *
 * Каждая правка здесь маленькая, а поломка у человека заметная: оффер на круглую сумму не
 * сохранялся, тариф с окладом 175 000 блокировал кнопку, окно сравнения кандидатов на телефоне
 * уезжало за экран, форма на сайте тянула всю библиотеку zod.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(new URL("..", import.meta.url).pathname, f), "utf8");

describe("поля сумм принимают любое целое число", () => {
  it("оффер: у поля суммы нет step — иначе 150 000 браузер считает недопустимой (допустимы 1, 1001, 2001…)", () => {
    const offer = read("components/applications/offer-form.tsx");
    const field = /id="offer-salary"[\s\S]*?\/>/.exec(offer)?.[0] ?? "";
    expect(field).toContain('name="salary"');
    expect(field).not.toMatch(/\bstep=/);
  });

  it("выбор тарифа: у окладов и бонуса нет step — они только для расчёта, а 175 000 не кратно 10 000", () => {
    const picker = read("components/onboarding/tariff-picker.tsx");
    for (const id of ["salary", "bonus"]) {
      const field = new RegExp(`id="${id}"[\\s\\S]*?/>`).exec(picker)?.[0] ?? "";
      expect(field, id).toContain("type=\"number\"");
      expect(field, id).not.toMatch(/\bstep=/);
    }
  });
});

describe("окно сравнения кандидатов на телефоне", () => {
  it("нижняя шторка получает высоту через data-[side=bottom]:, иначе базовый h-auto побеждает и окно растёт без предела", () => {
    const board = read("components/kanban/kanban-board.tsx");
    const sheet = /<SheetContent[\s\S]*?side="bottom"[\s\S]*?className="([^"]*)"/.exec(board)?.[1] ?? "";
    expect(sheet).toContain("data-[side=bottom]:h-[88svh]");
    expect(sheet).toContain("overflow-y-auto");
    expect(sheet).not.toMatch(/(^|\s)h-\[88vh\]/);
  });
});

describe("форма заявки на сайте не тянет zod", () => {
  it("lead-form берёт варианты из файла без импортов", () => {
    const form = read("components/marketing/lead-form.tsx");
    expect(form).toContain('from "@/lib/validation/lead-options"');
    expect(form).not.toContain('from "@/lib/validation/lead"');
    expect(read("lib/validation/lead-options.ts")).not.toMatch(/^\s*import\s/m);
  });
});
