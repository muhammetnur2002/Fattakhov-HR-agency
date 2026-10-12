/**
 * Выбор и состояния в кабинете: сторожа исходников (11.10.2026, PR «выбор и состояния»).
 *
 * Аудит нашёл шесть способов выбрать одно из нескольких, ссылки-фильтры без `aria-current`,
 * активную вкладку на 1,05:1 к соседним, фильтры без признака ожидания, системные галочки на
 * мыши рядом со своими и окна, после закрытия которых фокус терялся. Каждый пункт здесь
 * закреплён так, чтобы вернуть проблему можно было только осознанно: проверки читают исходники,
 * поэтому падают в момент правки, а не после жалобы.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxTags, read, ROOT, sources } from "./helpers/jsx-source";

const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const all = [...sources("app"), ...sources("components")];
const outsideUi = all.filter((f) => !f.includes("components/ui/"));

describe("один компонент выбора (FilterChip)", () => {
  /**
   * Кнопка-ссылка, у которой вид зависит от состояния, — это самодельный чип: выбранный
   * отличался только заливкой, а `aria-current` не было вовсе. Выбор — через `FilterChip`.
   * Исключения: не выбор, а акцент — «Назначить время» подсвечена, когда ждёт действия.
   */
  const EMPHASIS_NOT_SELECTION = new Set([
    "components/interviews/calendar-row-actions.tsx",
    "components/interviews/interview-section.tsx",
  ]);

  it("нет `<Button asChild variant={условие}>`: выбор между вариантами — FilterChip", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      if (EMPHASIS_NOT_SELECTION.has(file)) continue;
      for (const tag of jsxTags(read(file), "Button")) {
        if (!/\basChild\b/.test(tag.text)) continue;
        if (/variant=\{[^}]*(\?|===|!==)/.test(tag.text)) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders, "ссылка-фильтр — <FilterChip href selected>, а не кнопка с условным видом").toEqual([]);
  });

  it("нет двух кнопок-ссылок подряд с `secondary` и `outline`: статичный «выбранный» чип без состояния", () => {
    // «Все» всегда `secondary`, «Ждут клиента» всегда `outline` — выбранность нигде не вычисляется
    const offenders: string[] = [];
    for (const file of outsideUi) {
      const text = read(file);
      const tags = jsxTags(text, "Button").filter((t) => /\basChild\b/.test(t.text));
      for (let i = 0; i + 1 < tags.length; i++) {
        const a = tags[i];
        const b = tags[i + 1];
        const pair = [a, b].map((t) => /variant="(secondary|outline)"/.exec(t.text)?.[1]);
        const between = text.slice(a.index, b.index);
        if (pair[0] && pair[1] && pair[0] !== pair[1] && between.length < 400 && /\bsize="sm"/.test(a.text + b.text)) {
          offenders.push(`${file}:${a.line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("локальных копий чипа нет: `function Chip` и `function FilterChip` только в ui/filter-chip.tsx", () => {
    const offenders = outsideUi.filter((f) => /function (Filter)?Chip\s*\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("выбор не рисуют вручную: «border-primary bg-primary text-primary-foreground» — только в чипе и счётчике", () => {
    // Слот выбора времени кандидатом (`slot-picker`) — публичная страница со своей крупной зоной нажатия;
    // навигация студплатформы (`students-tabs`) — разделы с aria-current="page", не фильтр.
    const ALLOWED = new Set(["components/schedule/slot-picker.tsx", "app/(client)/students/students-tabs.tsx"]);
    const offenders = outsideUi.filter(
      (f) => !ALLOWED.has(f) && /border-primary bg-primary text-primary-foreground/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it("`aria-pressed` ставит только FilterChip; исключения — переключатель «показать ссылку» и карточка тарифа", () => {
    const ALLOWED = new Set(["components/clients/invite-link.tsx", "components/onboarding/tariff-picker.tsx"]);
    const offenders = outsideUi.filter((f) => !ALLOWED.has(f) && /aria-pressed=/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("у каждого `<FilterChip>` со ссылкой или кнопкой есть `selected` — состояние не забыто", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      for (const tag of jsxTags(read(file), "FilterChip")) {
        if (!/\bselected\b/.test(tag.text)) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("чип выбирает токеном и галочкой, ссылка — aria-current=\"true\", кнопка — aria-pressed, вкладка — aria-selected", () => {
    const chip = read("components/ui/filter-chip.tsx");
    expect(chip).toMatch(/aria-current=\{selected \? "true" : undefined\}/);
    expect(chip).toMatch(/aria-pressed=\{isTab \? undefined : selected\}/);
    expect(chip).toMatch(/aria-selected=\{isTab \? selected : undefined\}/);
    expect(chip).toContain("bg-primary text-primary-foreground");
    expect(chip).toContain("CheckIcon");
  });

  it("чип той же высоты, что Button size=sm: h-7, text-xs, на сенсорном экране — правило 2.4em в globals.css", () => {
    const chip = read("components/ui/filter-chip.tsx");
    const button = read("components/ui/button.tsx");
    expect(chip).toContain("h-7");
    expect(chip).toContain("text-xs");
    expect(button).toMatch(/sm:\s*"h-7 [^"]*text-xs/);
    expect(css).toMatch(/\[data-slot="filter-chip"\]:not\(\[data-tall\]\),[\s\S]{0,200}min-height:\s*2\.4em/);
  });
});

describe("этапы воронки на телефоне", () => {
  it("остаются крупными (от 40 точек) через `tall`, правило 2.4em их не сжимает", () => {
    const board = read("components/kanban/kanban-board.tsx");
    const stage = jsxTags(board, "FilterChip").find((t) => /role="tab"/.test(t.text));
    expect(stage, "чип этапа воронки").toBeTruthy();
    expect(stage!.text).toMatch(/\btall\b/);
    expect(read("components/ui/filter-chip.tsx")).toMatch(/const TALL = "[^"]*min-h-10/);
  });
});

describe("активная вкладка", () => {
  const tabs = read("components/ui/tabs.tsx");

  it("заливка основным цветом, а не `bg-background` на сером (1,05:1)", () => {
    expect(tabs).not.toMatch(/data-active:bg-background/);
    expect(tabs).toContain("data-active:bg-primary");
    expect(tabs).toContain("data-active:text-primary-foreground");
  });

  it("при наведении на активную вкладку текст остаётся читаемым, в обеих темах", () => {
    expect(tabs).toContain("data-active:hover:text-primary-foreground");
    expect(tabs).toMatch(/dark:group-data-\[variant=default\]\/tabs-list:data-active:hover:text-primary-foreground/);
  });
});

describe("ожидание списка", () => {
  const LIST_FILTERS = [
    "components/shell/search-field.tsx",
    "components/candidates/candidate-filters.tsx",
    "components/vacancies/vacancy-status-filter.tsx",
    "components/vacancies/recruiter-filter.tsx",
    "components/leads/lead-status-filter.tsx",
    "components/shell/notification-category-filter.tsx",
  ];

  it("поиск и фильтры меняют адрес через useListNavigation, а не голым router.replace", () => {
    for (const file of LIST_FILTERS) {
      const text = read(file);
      expect(text, file).toContain("useListNavigation");
      expect(text, file).not.toMatch(/\brouter\.replace\(/);
      expect(text, file).not.toMatch(/useRouter\(/);
    }
  });

  it("у каждого фильтра виден признак ожидания: поиск — на месте лупы, выпадающий список — вместо стрелки", () => {
    for (const file of LIST_FILTERS) {
      const text = read(file);
      expect(text, file).toMatch(/pending=\{pending\}/);
    }
  });

  it("«Показать ещё» — клиентская ссылка с индикатором (useLinkStatus)", () => {
    const text = read("components/shell/load-more.tsx");
    expect(text.trimStart().startsWith('"use client"')).toBe(true);
    expect(text).toContain("useLinkStatus");
    expect(text).toContain("useListBusy");
  });

  it("живая область одна: «Список обновлён» объявляет ListPendingProvider, больше никто", () => {
    const holders = all.filter((f) => /data-slot="list-live"|LIST_UPDATED_MESSAGE/.test(read(f)));
    expect(holders).toEqual(["components/shell/list-pending.tsx"]);
    // и провайдер стоит один раз — в каркасе кабинета
    const mounts = all.filter((f) => /<ListPendingProvider>/.test(read(f)));
    expect(mounts).toEqual(["components/shell/app-shell.tsx"]);
  });

  it("списки с фильтром обёрнуты в ListRegion (aria-busy на самом списке)", () => {
    const PAGES = [
      "app/(agency)/a/vacancies/page.tsx",
      "app/(client)/vacancies/page.tsx",
      "app/(agency)/a/leads/page.tsx",
      "app/(agency)/a/clients/page.tsx",
      "app/(agency)/a/candidates/page.tsx",
      "app/(client)/candidates/page.tsx",
      "components/shell/notification-history.tsx",
    ];
    for (const file of PAGES) expect(read(file), file).toContain("<ListRegion");
  });
});

describe("галочки и переключатели на мыши", () => {
  /** Правило сырых полей: от `@layer base {` с `input[type="checkbox"]` до закрытия слоя. */
  function rawRule(): string {
    const start = css.indexOf('@layer base {\n  input[type="checkbox"],');
    expect(start, "блок правила сырых галочек не найден").toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("\n}\n", start));
  }

  it("правило без условия по указателю и без привязки к оболочке: на мыши и пальцем одинаково", () => {
    const rule = rawRule();
    expect(rule).not.toMatch(/pointer:\s*coarse/);
    expect(rule).not.toMatch(/\.cabinet-shell|\.public-shell|\.marketing-shell/);
    expect(rule).toContain("appearance: none");
  });

  it("есть и галочка, и переключатель, на тех же токенах, что у обёртки shadcn", () => {
    const rule = rawRule();
    for (const kind of ["checkbox", "radio"]) {
      expect(rule).toContain(`input[type="${kind}"]:checked`);
      expect(rule).toContain(`input[type="${kind}"]:focus-visible`);
      expect(rule).toContain(`input[type="${kind}"]:disabled`);
    }
    for (const token of ["--field", "--primary", "--primary-foreground", "--ring", "--input"]) {
      expect(rule, token).toContain(`var(${token})`);
    }
    // тёмная подложка — input/30, как у Checkbox: dark:bg-input/30
    expect(rule).toMatch(/\.dark\) input\[type="checkbox"\]/);
  });

  it("режим высокой контрастности: выбранное красится системными цветами, фокус-правило не тронуто", () => {
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight/);
    expect(css).toMatch(/forced-color-adjust:\s*none;\s*border-color:\s*Highlight;\s*background-color:\s*Highlight/);
    expect(css).toMatch(/::after[\s\S]{0,120}background-color:\s*HighlightText/);
  });

  it("исключений нет: `accent-*` у галочек и переключателей не пишут (при appearance: none он ни на что не влияет)", () => {
    const offenders: string[] = [];
    for (const file of all) {
      for (const tag of jsxTags(read(file), "input")) {
        if (/type=["{]"?(checkbox|radio)/.test(tag.text) && /\baccent-[a-z]/.test(tag.classes)) {
          offenders.push(`${file}:${tag.line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("у галочек нет и своей отрисовки в разметке: нет `appearance-none` вручную", () => {
    const offenders: string[] = [];
    for (const file of all) {
      for (const tag of jsxTags(read(file), "input")) {
        if (/type=["{]"?(checkbox|radio)/.test(tag.text) && /\bappearance-none\b/.test(tag.classes)) {
          offenders.push(`${file}:${tag.line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("наведение на поле", () => {
  it("Input, Textarea и SelectTrigger получают FIELD_HOVER — одну рамку при наведении на все три", () => {
    for (const file of ["components/ui/input.tsx", "components/ui/textarea.tsx", "components/ui/select.tsx"]) {
      expect(read(file), file).toContain("FIELD_HOVER");
    }
  });

  it("FIELD_HOVER — токен foreground, без not-* (они подняли бы специфичность выше фокуса и ошибки)", () => {
    const utils = read("lib/utils.ts");
    const m = /export const FIELD_HOVER = "([^"]+)"/.exec(utils);
    expect(m, "FIELD_HOVER не найден").not.toBeNull();
    expect(m![1]).toMatch(/^hover:border-foreground\/\d+$/);
  });
});

describe("фокус возвращается", () => {
  /**
   * Radix возвращает фокус сам, но только на DialogTrigger. Окно без триггера (открыто состоянием,
   * кнопка стоит рядом) без `onCloseAutoFocus` теряет фокус — после закрытия он оказывается на <body>.
   */
  it("окно или шторка без DialogTrigger/SheetTrigger обязаны вернуть фокус (onCloseAutoFocus)", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      const text = read(file);
      const hasContent = /<(Dialog|Sheet)Content\b/.test(text);
      if (!hasContent) continue;
      const hasTrigger = /<(Dialog|Sheet)Trigger\b/.test(text);
      if (!hasTrigger && !/onCloseAutoFocus=/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("блок подтверждения, заменяющий кнопку на месте, ведёт фокус: useConfirmFocus", () => {
    // `const [confirming…, set…] = useState(false)` в клиентском файле — это блок «Удалить? Да / Отмена»
    const offenders: string[] = [];
    for (const file of outsideUi) {
      const text = read(file);
      if (/const \[(confirming\w*|closing|rejecting), set\w+\] = useState\(false\)/.test(text) && !text.includes("useConfirmFocus")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
