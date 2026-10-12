/**
 * Заголовки страниц — только через PageTitle / CardTitle as="h1".
 *
 * Сверка 08.10.2026: в кабинетах `<h1 className="text-2xl font-semibold">`
 * был скопирован 55 раз с вариантами, а на входе и регистрации h1 не было
 * вовсе. Здесь — защита от возврата; структуру заголовков на живых страницах
 * (один h1, он первый, без прыжков уровней) держат tests/e2e/*headings.spec.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): { file: string; text: string }[] {
  const root = new URL(`../${dir}`, import.meta.url).pathname;
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((rel) => rel.endsWith(".tsx"))
    .map((rel) => ({ file: join(dir, rel), text: readFileSync(join(root, rel), "utf8") }));
}

describe("заголовки страниц", () => {
  it("в кабинетах и анкете нет голого <h1>: только PageTitle", () => {
    const bad = ["app/(agency)", "app/(client)", "app/(onboarding)", "components"]
      .flatMap(files)
      .filter(({ file, text }) => !file.endsWith("page-title.tsx") && !file.includes("components/marketing/") && /<h1[\s>]/.test(text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("на сайте h1 только в первом экране главной и в PageIntro: внутренние страницы не копируют заголовок", () => {
    // Сверка 09.10.2026: у /tariffs, /cases и /audit была одна и та же разметка h1 в трёх копиях
    const bad = ["app/(marketing)", "components/marketing"]
      .flatMap(files)
      .filter(({ file, text }) => !/(hero|page-intro)\.tsx$/.test(file) && /<h1[\s>]/.test(text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("на публичных страницах входа заголовок карточки — h1", () => {
    const bad = files("app/(public)")
      .filter(({ file }) => file.endsWith("page.tsx"))
      .filter(({ text }) => /<CardTitle(?![^>]*\bas="h1")/.test(text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("страницы, у которых заголовок живёт не в page.tsx, тоже начинаются с h1", () => {
    // Сверка 08.10.2026: при превышении частоты запросов, без рабочей почты у раздела
    // студентов и под заслоном договора читалка видела только h2
    const read = (f: string) => readFileSync(join(new URL("..", import.meta.url).pathname, f), "utf8");
    expect(read("components/shared/rate-limit-card.tsx")).toMatch(/<CardTitle as="h1"/);
    expect(read("app/(client)/students/layout.tsx")).toMatch(/<PageTitle>/);
    expect(read("components/client/contract-gate.tsx")).toMatch(/<PageTitle compact>/);
  });

  it("в мастере заявки после h1 страницы идёт h2, а не h3", () => {
    const text = readFileSync(join(new URL("..", import.meta.url).pathname, "components/vacancies/vacancy-wizard.tsx"), "utf8");
    expect(text).not.toMatch(/<h3[\s>]/);
  });
});
