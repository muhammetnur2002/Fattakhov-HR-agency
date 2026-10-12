/**
 * Настройки агентства: разделы с заголовками и якорная навигация (12.10.2026, сверка hierarchy-9).
 *
 * Страница шла сплошной лентой из десяти карточек одного веса (4507px на ноутбуке) без единого
 * заголовка выше карточки. Теперь четыре именованных раздела, заголовок раздела — h2, карточки
 * внутри — h3, вверху навигация по якорям. Права по-прежнему решает `canDo` (lib/access): разметка
 * ролей не проверяет, раздел без карточек не рисуется.
 */
import { describe, expect, it } from "vitest";
import { jsxTags, jsxTree, read } from "./helpers/jsx-source";

const PAGE = "app/(agency)/a/settings/page.tsx";
const page = read(PAGE);

describe("страница настроек агентства: разделы", () => {
  const tree = jsxTree(page);
  const ancestors = (node: (typeof tree)[number]) => {
    const names: string[] = [];
    for (let p = node.parent; p; p = p.parent) names.push(p.name);
    return names;
  };

  it("вверху навигация по разделам, а сами разделы — SettingsSection", () => {
    expect(tree.filter((n) => n.name === "SettingsNav")).toHaveLength(1);
    const sections = tree.filter((n) => n.name === "SettingsSection");
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.length).toBeLessThanOrEqual(4);
  });

  it("каждая карточка лежит внутри раздела: ленты из карточек вне разделов нет", () => {
    const loose = tree
      .filter((n) => ["Card", "PresenceCard", "SettingsLinkCard"].includes(n.name))
      .filter((n) => !ancestors(n).includes("SettingsSection"))
      .map((n) => `${n.name}:${n.line}`);
    expect(loose).toEqual([]);
  });

  it("заголовок карточки в разделе — h3 (над ним h2 раздела), PresenceCard получает headingLevel=\"h3\"", () => {
    const titles = tree.filter((n) => n.name === "CardTitle");
    expect(titles.length).toBeGreaterThan(5);
    expect(titles.filter((n) => !/\bas="h3"/.test(n.text)).map((n) => n.line)).toEqual([]);
    const presence = tree.find((n) => n.name === "PresenceCard");
    expect(presence?.text).toMatch(/headingLevel="h3"/);
  });

  it("навигация строится из тех же описаний, что и разделы: у разделов уникальные якоря", () => {
    const ids = [...page.matchAll(/^\s{4}id: "([a-z]+)",$/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    // Раздел «Журналы и данные» — только тем, у кого есть право, и в навигацию попадает вместе с ним
    expect(page).toMatch(/\.\.\.\(showData \? \[SECTIONS\.data\] : \[\]\)/);
    expect(page).toMatch(/\{showData && \(\s*<SettingsSection meta=\{SECTIONS\.data\}>/);
  });

  it("права — флагами через canDo в одном месте; разметка ролей не проверяет", () => {
    expect(page).not.toMatch(/actor\.role\s*[!=]==?/);
    for (const action of ["org.settings", "auth.log", "pdn.auditLog", "staff.manage", "agreement.manage"]) {
      expect(page, action).toContain(`"${action}"`);
    }
    // Ничего не удалено: те же карточки на месте
    for (const title of [
      "Двухфакторная аутентификация",
      "Пароль",
      "Сессии",
      "Срок сессии",
      "Уведомления",
      "Сообщения о сбоях",
      "Договор для клиентов",
      "Настройки организации",
    ]) {
      expect(page, title).toContain(title);
    }
    expect(page).toContain('id="contract-template"');
  });
});

describe("каркас разделов", () => {
  const source = read("components/settings/settings-sections.tsx");

  it("раздел — section с aria-labelledby на свой h2; навигация подписана", () => {
    expect(source).toMatch(/<section id=\{meta\.id\} aria-labelledby=\{titleId\}/);
    expect(source).toMatch(/<h2 id=\{titleId\}/);
    expect(source).toMatch(/<nav aria-label="Разделы настроек"/);
  });

  it("якоря ведут на id раздела", () => {
    expect(source).toMatch(/href=\{`#\$\{section\.id\}`\}/);
  });

  it("h2 раздела — text-lg font-medium, как у остальных h2 кабинета (а не font-semibold)", () => {
    const h2 = jsxTags(source, "h2");
    expect(h2.length).toBeGreaterThan(0);
    for (const tag of h2) {
      expect(tag.classes.split(" "), `h2:${tag.line}`).toEqual(expect.arrayContaining(["text-lg", "font-medium"]));
      expect(tag.classes.split(" "), `h2:${tag.line}`).not.toContain("font-semibold");
    }
  });
});
