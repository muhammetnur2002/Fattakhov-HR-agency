/**
 * Поля выбора и загрузки: один вид на весь кабинет (12.10.2026, сверка consistency-15).
 *
 * Было 14 сырых `<select>` и 7 файловых полей, каждое со своим классом: у половины не было
 * отключённого вида и тёмной темы, у файловых — ни рамки, ни кольца фокуса, ни подписи выбранного
 * файла (системное «Файл не выбран» на языке системы). Теперь `NativeSelect` и `FileInput` из
 * `components/ui` (5 файловых полей заменены, 2 скрытых под кнопкой оставлены), а сырые элементы
 * в разметке запрещены.
 */
import { describe, expect, it } from "vitest";
import { jsxTags, read, sources } from "./helpers/jsx-source";

const outsideUi = [...sources("app"), ...sources("components")].filter((f) => !f.includes("components/ui/"));

describe("сырых полей нет", () => {
  it("нет <select>: список — NativeSelect (родной) или Select (Radix)", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      for (const tag of jsxTags(read(file), "select")) offenders.push(`${file}:${tag.line}`);
    }
    expect(offenders).toEqual([]);
  });

  it("нет <input type=\"file\"> и <Input type=\"file\">: файл — FileInput", () => {
    // Исключение: невидимое поле под кнопкой («Добавить логотип», «Добавить фото») — видимое там Button,
    // у которой есть и загрузка, и отключённый вид; само поле `sr-only` и без собственного вида
    const offenders: string[] = [];
    for (const file of outsideUi) {
      for (const tag of jsxTags(read(file), "input|Input")) {
        if (!/\btype=["{]"?file/.test(tag.text)) continue;
        if (/\bsr-only\b/.test(tag.classes)) continue;
        offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("у скрытого файлового поля под кнопкой есть подпись aria-label", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      for (const tag of jsxTags(read(file), "input")) {
        if (/\btype=["{]"?file/.test(tag.text) && /\bsr-only\b/.test(tag.classes) && !/aria-label=/.test(tag.text)) {
          offenders.push(`${file}:${tag.line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("поля несут общее правило касания и 16px", () => {
  const css = read("app/globals.css");

  it("NativeSelect и FileInput входят в правило высоты цели касания (2.4em)", () => {
    const rule = css.slice(css.indexOf("@media (pointer: coarse) {"));
    expect(rule.slice(0, 600)).toContain('[data-slot="native-select"]');
    expect(rule.slice(0, 600)).toContain('[data-slot="file-input"]');
  });

  it("NativeSelect на сенсорных до 1023px не мельче 16px — iOS иначе увеличивает страницу при фокусе", () => {
    // Общее правило полей кабинета (PR про кроссбраузерность) берёт любой select, в том числе NativeSelect
    const at = css.indexOf("@media (max-width: 1023px) and (pointer: coarse)");
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, at + 900);
    expect(rule).toMatch(/\bselect,/);
    expect(rule).toContain("font-size: 16px");
  });

  it("у NativeSelect есть всё, что было у лучшего из 14 селектов: отключённый вид, тёмная тема, кольцо ошибки и фокуса", () => {
    const source = read("components/ui/native-select.tsx");
    for (const needle of ["disabled:", "dark:bg-input/30", "aria-invalid:border-destructive", "focus-visible:ring-ring", "border-field", "FIELD_HOVER"]) {
      expect(source, needle).toContain(needle);
    }
  });
});

describe("числа «было» в пояснениях совпадают с фактом", () => {
  // По ours/main до правки было 14 настоящих <select> (шесть в фильтрах студентов, по одному-два
  // в остальных местах) и 7 файловых полей: 5 заменены на FileInput, 2 скрытых под кнопкой оставлены.
  // В первой версии пояснений стояло «18 и 9» — читающий решил бы, что где-то остались неперенесённые
  // поля (замечание проверки к PR #123). Числа живут в трёх местах, и расходиться им нельзя.
  const WRONG = /\b(18|девятнадцать)\s+(сырых|селект|штук)|\b9\s+файловых/;
  // Перенос строки и звёздочка комментария между словами не должны прятать число
  const flat = (text: string) => text.replace(/\s*\n\s*(?:\*\s*)?/g, " ");
  const header = flat(read("tests/field-components.test.ts").split("*/")[0]);
  const agents = flat(read("AGENTS.md"));
  const nativeSelect = flat(read("components/ui/native-select.tsx"));
  const places: Array<[string, string]> = [
    ["AGENTS.md", agents],
    ["components/ui/native-select.tsx", nativeSelect],
    ["components/ui/file-input.tsx", flat(read("components/ui/file-input.tsx"))],
    ["шапка этого теста", header],
  ];

  it.each(places)("%s: прежних «18 сырых select» и «9 файловых полей» нет", (_name, text) => {
    expect(text).not.toMatch(WRONG);
  });

  it("AGENTS.md и шапка теста называют правильные числа: 14 select и 7 файловых полей", () => {
    expect(agents).toMatch(/14 сырых `<select>` и 7 файловых полей/);
    expect(header).toMatch(/14 сырых `<select>` и 7 файловых полей/);
  });

  it("docstring NativeSelect называет 14 select", () => {
    expect(nativeSelect).toMatch(/таких `<select>` было 14\b/);
  });

  it("AGENTS.md различает 5 заменённых файловых полей и 2 скрытых оставленных", () => {
    expect(agents).toMatch(/5 заменены на `FileInput`, 2 скрытых/);
  });
});
