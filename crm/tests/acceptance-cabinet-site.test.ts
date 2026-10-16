/**
 * Итоговая приёмка кабинета и сайта (15.10.2026): правила, которые не дают вернуть найденное молча.
 *
 * Каждое правило проверено на «красное без правки». Живую раскладку меряют tests/e2e/employee-list-width,
 * client-stage-badge, calendar-contrast, tabs-focus-ring и acceptance-small-fixes; здесь — разметка и стили
 * как текст: быстро, без браузера и базы.
 *
 * - список сотрудников в аналитике: имя не сжимается до одной буквы на телефоне;
 * - этап в карточке кандидата не усекается многоточием при свободном месте ниже xl;
 * - календарь: соседний месяц не гасится `opacity` на всей ячейке, круг «сегодня» — свой токен;
 * - панель вкладки (Tab) показывает фокус; чипы месяца не режут имя до буквы; подпись воронки переносится;
 * - зона нажатия галочки 40px, цели касания на /register от 24px, `sizes` у фактуры плитки;
 * - лента тарифов — область с остановкой Tab, пока прокручивается.
 */
import { describe, expect, it } from "vitest";

import { hasClass, jsxTags, read, sources, stripComments } from "./helpers/jsx-source";

const code = (file: string) => stripComments(read(file));

describe("список сотрудников в аналитике", () => {
  it("блок имени — `flex-1` с собственным базисом, а не с нулевым: иначе показатели не переносятся и имя получает остаток", () => {
    const divs = jsxTags(code("components/analytics/employee-table.tsx"), "div");
    const name = divs.find((d) => hasClass(d.classes, /^min-w-0$/) && hasClass(d.classes, /^flex-1$/));
    expect(name, "блок имени (min-w-0 flex-1) не найден").toBeTruthy();
    // замер 15.10.2026: на 375 имя получало 16 точек из 317, видна одна буква у каждой строки без бейджа «Финал»
    expect(hasClass(name!.classes, /^basis-\d/), "у имени нет basis-N").toBe(true);
  });
});

describe("этап и ожидание в карточке кандидата", () => {
  const cells = () => {
    const divs = jsxTags(code("components/candidates/application-list.tsx"), "div");
    // ячейки справа: прижаты к правому краю и не сжимаются; у суммы есть whitespace-nowrap
    const right = divs.filter((d) => hasClass(d.classes, /^text-right$/) && hasClass(d.classes, /^shrink-0$/));
    const stage = right.find((d) => !hasClass(d.classes, /^max-xl:empty:hidden$/) && !hasClass(d.classes, /^whitespace-nowrap$/));
    const waiting = right.find((d) => hasClass(d.classes, /^max-xl:empty:hidden$/));
    return { right, stage, waiting };
  };

  it("обе ячейки — по содержимому ниже xl: фиксированных w-N нет (128 точек срезали «Интервью с кли…»)", () => {
    const { stage, waiting } = cells();
    expect(stage, "ячейка этапа не найдена").toBeTruthy();
    expect(waiting, "ячейка ожидания не найдена").toBeTruthy();
    for (const cell of [stage!, waiting!]) {
      expect(cell.classes.split(" ").filter((c) => /^(max-xl:|xl:)?w-\d/.test(c)), cell.classes).toEqual([]);
      expect(hasClass(cell.classes, /^max-xl:max-w-full$/), "ячейка не шире строки").toBe(true);
    }
  });

  it("этап, перенесённый на свою строку, прижат вправо; пустая ячейка ожидания ниже xl скрыта", () => {
    const { stage, waiting } = cells();
    expect(hasClass(stage!.classes, /^max-xl:ml-auto$/)).toBe(true);
    // пустая ячейка иначе оставляла бы промежуток flex-gap и сдвигала этап вправо
    expect(hasClass(waiting!.classes, /^max-xl:empty:hidden$/)).toBe(true);
  });
});

describe("календарь: соседний месяц и «сегодня»", () => {
  const month = code("components/calendar/calendar-month.tsx");
  const year = code("components/calendar/calendar-year.tsx");

  it("ячейка соседнего месяца не гасится opacity: она гасила число (3,75:1) и чипы с событиями (3,3:1)", () => {
    const cell = jsxTags(month, "div").find((d) => hasClass(d.classes, /^group$/) && hasClass(d.classes, /^relative$/));
    expect(cell, "ячейка дня не найдена").toBeTruthy();
    expect(cell!.classes.split(" ").filter((c) => /(^|:)opacity-/.test(c)), cell!.classes).toEqual([]);
    expect(cell!.text, "и условный opacity в cn()").not.toMatch(/opacity-/);
  });

  it("соседний месяц — серое число и другой фон (muted), оба токены темы", () => {
    expect(month).toMatch(/inMonth \? "bg-card" : "bg-muted"/);
    expect(month).toMatch(/text-muted-foreground hover:bg-card/);
  });

  it("круг «сегодня» — bg-cal-today в месяце и в годе; bg-cal-sun в нём не стоит", () => {
    for (const [name, text] of [["месяц", month], ["год", year]] as const) {
      expect(text, name).toMatch(/bg-cal-today[^"]*text-white/);
      expect(text, name).not.toMatch(/bg-cal-sun/);
    }
    expect(read("app/globals.css")).toMatch(/--color-cal-today:\s*var\(--cal-today\)/);
  });

  it("круг «сегодня» в соседнем месяце не получает серый цвет числа: белый текст выбран явно, а не по порядку утилит", () => {
    // text-muted-foreground и text-white на одном элементе — порядок в CSS решал бы, какое победит
    const link = jsxTags(month, "Link").find((l) => /data-daykey/.test(l.text));
    expect(link, "ссылка дня не найдена").toBeTruthy();
    expect(link!.text).toMatch(/isToday\s*\?\s*"bg-cal-today[^"]*text-white[^"]*"\s*:\s*inMonth/);
  });
});

describe("чипы в ячейке месяца", () => {
  const parts = code("components/calendar/calendar-parts.tsx");

  it("чип переносит название под время (flex-wrap), а не режет его одной строкой через truncate", () => {
    const chip = /const CHIP =\s*"([^"]*)"/.exec(parts)?.[1] ?? "";
    expect(chip).toMatch(/\bflex-wrap\b/);
    expect(chip).not.toMatch(/\btruncate\b/);
    // замер 15.10.2026: от имени кандидата оставалось 8–19% («15:00 Э…»)
    const title = /const CHIP_TITLE = "([^"]*)"/.exec(parts)?.[1] ?? "";
    expect(title).toMatch(/\bflex-auto\b/);
    expect(title).toMatch(/\bline-clamp-2\b/);
    expect(title).not.toMatch(/\btruncate\b/);
  });

  it("оба чипа (задача и интервью) берут общий CHIP и CHIP_TITLE", () => {
    expect(parts.match(/className=\{cn\(\s*CHIP,/g) ?? [], "TaskChip и InterviewChip").toHaveLength(2);
    expect(parts).toMatch(/className=\{cn\(CHIP, "border-cal-interview"/);
    expect(parts.match(/className=\{CHIP_TITLE\}/g) ?? []).toHaveLength(2);
  });
});

describe("панель вкладки", () => {
  it("TabsContent показывает фокус с клавиатуры контуром, голого outline-none нет", () => {
    const tag = jsxTags(code("components/ui/tabs.tsx"), "TabsPrimitive.Content")[0];
    expect(tag, "TabsPrimitive.Content не найден").toBeTruthy();
    const text = tag.text;
    expect(text).not.toMatch(/(?<![\w:-])outline-none/);
    expect(text).toMatch(/focus-visible:outline-2/);
    expect(text).toMatch(/focus-visible:outline-ring/);
    expect(text).toMatch(/focus-visible:outline-offset-2/);
  });

  it("ни одна панель вкладки в приложении не возвращает outline-none через className", () => {
    const bad: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of sources(dir)) {
        for (const tag of jsxTags(code(file), "TabsContent")) {
          if (/(?<![\w:-])outline-(none|hidden)/.test(tag.classes)) bad.push(`${file}:${tag.line}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("воронка: подпись этапа", () => {
  it("подпись переносится, а не усекается: «Финальный этап / тестовое» выступало на 12 точек", () => {
    const label = jsxTags(code("components/analytics/funnel-chart.tsx"), "div").find((d) => /title=\{step\.name\}/.test(d.text));
    expect(label, "подпись этапа не найдена").toBeTruthy();
    expect(hasClass(label!.classes, /^truncate$/)).toBe(false);
    expect(hasClass(label!.classes, /^break-words$/)).toBe(true);
    expect(hasClass(label!.classes, /^shrink-0$/)).toBe(true);
  });
});

describe("цели касания", () => {
  it("зона нажатия галочки на сенсорном экране — 40px: отступ -13px от внутренней границы (рамка 1px уже внутри 16px)", () => {
    const css = read("app/globals.css");
    const rule = /\[data-slot="checkbox"\]::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/inset:\s*-13px/);
  });

  it("/register: «Текст согласия» и ссылка на политику — не мельче 24px (WCAG 2.5.8), строка прежней высоты", () => {
    const text = code("app/(public)/register/register-form.tsx");
    const target = /const TARGET_24 = "([^"]*)"/.exec(text)?.[1] ?? "";
    expect(target).toMatch(/\bmin-h-6\b/);
    // -my-1 забирает рост из полей: строка не становится выше, вёрстка не сдвигается
    expect(target).toMatch(/-my-1\b/);
    expect(target).toMatch(/\binline-flex\b/);
    const button = jsxTags(text, "button").find((b) => /aria-controls=\{textId\}/.test(b.text));
    const link = jsxTags(text, "a").find((a) => /href=\{privacyHref\}/.test(a.text));
    expect(button?.text, "раскрывашка").toMatch(/cn\(TARGET_24,/);
    expect(link?.text, "ссылка на политику").toMatch(/cn\(TARGET_24,/);
  });
});

describe("фактура «рёбра»: sizes по ширине слоя", () => {
  it("RibbedTexture принимает sizes (по умолчанию 100vw) и отдаёт его картинке", () => {
    const texture = code("components/marketing/texture.tsx");
    expect(texture).toMatch(/sizes\?: string/);
    expect(texture).toMatch(/sizes = "100vw"/);
    expect(texture).toMatch(/sizes=\{sizes\}/);
  });

  it("плитка мозаики уже окна и объявляет свою ширину: `100vw` на ней — предупреждение Next «not rendered at full viewport width»", () => {
    const mosaic = code("components/marketing/role-mosaic.tsx");
    const tile = /const TILE_SIZES = "([^"]*)"/.exec(mosaic)?.[1] ?? "";
    expect(tile).toMatch(/min-width/);
    expect(tile).not.toBe("100vw");
    const tag = jsxTags(mosaic, "RibbedTexture")[0];
    expect(tag?.text).toMatch(/sizes=\{TILE_SIZES\}/);
  });
});

describe("лента тарифов", () => {
  it("лента — общий ScrollRegion с именем, а не голый div: пока прокручивается, у неё есть остановка Tab", () => {
    const text = code("components/marketing/pricing.tsx");
    expect(text).toMatch(/import \{ ScrollRegion \} from "@\/components\/ui\/scroll-region"/);
    const tag = jsxTags(text, "ScrollRegion")[0];
    expect(tag, "лента тарифов не обёрнута в ScrollRegion").toBeTruthy();
    expect(tag.text).toMatch(/label="Тарифы"/);
    expect(tag.classes).toMatch(/snap-x/);
    // кольцо только внутрь: лента на всю ширину окна, снаружи его у краёв не видно
    expect(tag.classes).toMatch(/focus-visible:ring-inset/);
    expect(tag.classes).toMatch(/focus-visible:ring-offset-0/);
  });

  it("свой дубль ScrollRegion на сайте не заводится: компонент один, в components/ui", () => {
    const own = sources("components/marketing").filter((f) => /scroll-region/.test(f));
    expect(own).toEqual([]);
  });
});
