/**
 * Ширина страницы: у форм и настроек одна, у таблиц и просмотра — другая.
 *
 * Сверка 08.10.2026: у настроек и форм было три разных max-w (2xl, 3xl, 4xl):
 * переходишь из «Настроек» в «Заявку на подбор» — колонка прыгает на 128px.
 * Теперь: формы и настройки — max-w-3xl, страницы просмотра и таблиц — max-w-4xl
 * (журнал входов, сотрудники, карточки кандидата, клиента, заявки). Страницы
 * на всю ширину (метрики пилота, персональные данные) ширину не ограничивают.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

const FORMS_AND_SETTINGS = [
  "app/(agency)/a/settings/page.tsx",
  "app/(client)/settings/page.tsx",
  "app/(agency)/a/notifications/page.tsx",
  "app/(client)/notifications/page.tsx",
  "app/(client)/company/page.tsx",
  "app/(agency)/a/candidates/new/page.tsx",
  "app/(agency)/a/clients/new/page.tsx",
  "app/(agency)/a/vacancies/new/page.tsx",
  "app/(client)/vacancies/new/page.tsx",
  "app/(client)/vacancies/[id]/edit/page.tsx",
  "app/(client)/students/new/page.tsx",
];

const VIEW_AND_TABLES = [
  "app/(agency)/a/settings/auth-log/page.tsx",
  "app/(agency)/a/team/page.tsx",
  "app/(agency)/a/candidates/[id]/page.tsx",
  "app/(agency)/a/clients/[id]/page.tsx",
  "app/(agency)/a/applications/[id]/page.tsx",
  "app/(client)/applications/[id]/page.tsx",
];

function rootWidth(file: string): string | undefined {
  const text = readFileSync(join(ROOT, file), "utf8");
  const exported = text.slice(text.search(/export default/));
  const m = /return \(\s*<div className="([^"]*)"/.exec(exported);
  return m ? (/(?<![\w-])max-w-\w+/.exec(m[1])?.[0] ?? undefined) : undefined;
}

describe("ширина страниц", () => {
  it.each(FORMS_AND_SETTINGS)("форма или настройки — max-w-3xl: %s", (file) => {
    expect(rootWidth(file)).toBe("max-w-3xl");
  });

  it.each(VIEW_AND_TABLES)("просмотр или таблица — max-w-4xl: %s", (file) => {
    expect(rootWidth(file)).toBe("max-w-4xl");
  });
});
