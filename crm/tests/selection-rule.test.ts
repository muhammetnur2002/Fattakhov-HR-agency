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
import { findInlineToggles } from "./helpers/inline-toggles";
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

  /**
   * Место под галочку — у всех чипов (решение владельца, 16.10.2026). Прежняя схема монтировала значок только у
   * выбранного: выбор растил чип на 18 точек (14 + зазор 4), прежний выбранный сужался на столько же, и чипы между ними
   * сдвигались (в переносимом ряду на границе строки это могло перестроить строки). Слот обязан оставаться в разметке у каждого чипа с галочкой
   * (`shape="chip"`), а пустой — быть пустым. Живая проверка ширины — tests/e2e/selection-states.spec.ts.
   */
  it("слот под галочку не монтируется по условию: Mark всегда рисует `filter-chip-mark` размером с галочку", () => {
    const chip = read("components/ui/filter-chip.tsx");
    const mark = /function Mark\([\s\S]*?\n}\n/.exec(chip)?.[0] ?? "";
    expect(mark, "в filter-chip.tsx есть функция Mark").not.toBe("");
    expect(mark).toContain('data-slot="filter-chip-mark"');
    expect(mark).toMatch(/\baria-hidden\b/);
    expect(mark).toContain("size-3.5");
    expect(mark).toContain("shrink-0");
    expect(mark, "Mark не возвращает null: пустой слот — тоже слот").not.toMatch(/return null/);
    // Ссылка и кнопка рисуют слот от формы чипа, а не от выбора
    expect(chip).toMatch(/shape === "chip" \? <LinkMark selected=\{selected\} \/> : null/);
    expect(chip).toMatch(/shape === "chip" \? <Mark selected=\{selected\} pending=\{pending\} \/> : null/);
    expect(chip, "значок не монтируется условием `selected &&`").not.toMatch(/selected\s*&&\s*<(Link)?Mark/);
  });

  it("карточка тарифа держит место под галочку: SelectionSlot, а не `{selected && <SelectionCheck />}`", () => {
    const picker = read("components/onboarding/tariff-picker.tsx");
    expect(picker).toMatch(/<SelectionSlot selected=\{selected\} \/>/);
    expect(picker).not.toMatch(/selected\s*&&\s*<SelectionCheck/);
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

  it("FIELD_HOVER — токен foreground, без not-* и enabled: (они подняли бы специфичность выше фокуса и ошибки)", () => {
    const utils = read("lib/utils.ts");
    const m = /export const FIELD_HOVER =\s*"([^"]+)"/.exec(utils);
    expect(m, "FIELD_HOVER не найден").not.toBeNull();
    const classes = m![1].split(/\s+/);
    expect(classes[0]).toMatch(/^hover:border-foreground\/\d+$/);
    expect(classes.filter((c) => /(^|:)(not-|enabled:)/.test(c))).toEqual([]);
  });

  it("недоступное поле не отвечает на наведение: рамке возвращается покой (disabled:hover:border-field), красная остаётся красной", () => {
    // У Input это даёт disabled:pointer-events-none, у Textarea и SelectTrigger его нет (нужен курсор «нельзя»)
    const m = /export const FIELD_HOVER =\s*"([^"]+)"/.exec(read("lib/utils.ts"));
    const classes = m![1].split(/\s+/);
    expect(classes).toContain("disabled:hover:border-field");
    expect(classes).toContain("disabled:hover:aria-invalid:border-destructive");
    expect(classes).toContain("dark:disabled:hover:aria-invalid:border-destructive/50");
  });
});

describe("вкладки и чипы: мелочи после независимой проверки", () => {
  it("у вкладки line цвет активной в тёмной теме не потерян: есть пара dark:", () => {
    const tabs = read("components/ui/tabs.tsx");
    expect(tabs).toContain("group-data-[variant=line]/tabs-list:data-active:text-foreground");
    expect(tabs).toContain("dark:group-data-[variant=line]/tabs-list:data-active:text-foreground");
  });

  it("невыбранный чип в тёмной теме с рамкой --field: отличие выбранного не держится на сотых контраста заливки", () => {
    const chip = read("components/ui/filter-chip.tsx");
    const unselected = /const UNSELECTED =\s*"([^"]+)"/.exec(chip)?.[1] ?? "";
    expect(unselected.split(/\s+/)).toContain("dark:border-field");
    expect(unselected).not.toContain("dark:border-input");
  });

  it("замеры пропорций на сенсорном экране охватывают чипы-фильтры (data-slot=filter-chip), а не только Button", () => {
    const spec = read("tests/e2e/mobile-shell.spec.ts");
    const queries = spec.match(/"main \[data-slot=button\][^"]*"/g) ?? [];
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const q of queries) expect(q, q).toContain("[data-slot=filter-chip]:not([data-tall])");
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

});

/**
 * Блок на месте кнопки: кнопка открывает вопрос, поле причины или форму правки и сама пропадает, а на «Отмену»
 * возвращается. Сторож ищет такие блоки по устройству (`tests/helpers/inline-toggles.ts`), а не по имени состояния:
 * прежний искал `confirming|closing|rejecting` и пропустил `mode`, `cancelling`, `editingFeedback`, `open`.
 */
describe("блок на месте кнопки ведёт фокус и называет себя", () => {
  /**
   * Переключатели, у которых кнопка НЕ пропадает (или экран меняется целиком): фокус никуда не теряется.
   * Ключ — «файл::состояние»; причина обязательна. Каждое исключение проверяется на живость.
   */
  const KEEPS_FOCUS: Record<string, string> = {
    "components/interviews/interview-section.tsx::proposing":
      "включается и выключается одной и той же кнопкой «Предложить время» — она остаётся на месте",
    "components/vacancies/agency-vacancy-actions.tsx::closing":
      "«Закрыть без найма» остаётся в ряду кнопок, форма причины встаёт под ним — фокус не теряется",
    "components/schedule/slot-picker.tsx::askingOther":
      "публичная страница кандидата меняет экран целиком («варианты» ↔ «своё время»), а не блок на месте кнопки",
    "components/client/students-intro.tsx::open":
      "карточка раскрывается сама при первом заходе: перевод фокуса на загрузке страницы вреден, а не нужен",
    "app/(client)/students/candidates/candidates-list.tsx::year":
      "кнопки курсов — фильтр: все остаются на месте, выбранная только меняет вид",
  };

  const files = all.filter((f) => !f.includes("components/ui/"));
  const flagged = files.flatMap((file) =>
    findInlineToggles(read(file)).map((toggle) => ({ file, key: `${file}::${toggle.state}`, ...toggle })),
  );

  /** Вызовы `useConfirmFocus(…)` в файле: аргумент и то, что слева (деструктуризация). */
  function hookCalls(text: string) {
    return [...text.matchAll(/(?:const \{([^}]*)\}\s*=\s*)?useConfirmFocus(?:<[^()]*?>)?\(([^)]*)\)/g)].map((m) => ({
      left: m[1] ?? "",
      arg: m[2],
    }));
  }

  it("каждый такой блок вызывает useConfirmFocus от своего состояния (режимов больше одного — хук на каждый)", () => {
    const offenders: string[] = [];
    for (const t of flagged) {
      if (KEEPS_FOCUS[t.key]) continue;
      const calls = hookCalls(read(t.file)).filter((c) => new RegExp(`\\b${t.state}\\b`).test(c.arg));
      const modes = new Set(t.opens.filter((a) => /^["']/.test(a))).size;
      if (calls.length < Math.max(1, modes)) {
        offenders.push(`${t.key} (строка ${t.line}): нужно хуков ${Math.max(1, modes)}, найдено ${calls.length}`);
      }
    }
    expect(offenders, "блок заменяет кнопку — фокус при открытии и возврат ведёт useConfirmFocus(состояние)").toEqual([]);
  });

  it("исключения живые: каждое действительно находится сторожем и файл существует", () => {
    const keys = new Set(flagged.map((t) => t.key));
    const dead = Object.keys(KEEPS_FOCUS).filter((k) => !keys.has(k));
    expect(dead, "исключение больше не нужно (код изменился) — уберите его").toEqual([]);
    for (const reason of Object.values(KEEPS_FOCUS)) expect(reason.length).toBeGreaterThan(20);
  });

  it("кнопка «Да, …» всегда в файле с ConfirmBlock (он ведёт фокус сам) или useConfirmFocus: блок подтверждения не обходит сторожа", () => {
    // Витрина не в счёт: «Да, но для одной позиции…» там — ответ в частых вопросах, а не кнопка.
    // Строже — tests/confirm-block-rule.test.ts: «Да, …» только как confirmLabel у <ConfirmBlock>
    const offenders = files
      .filter((f) => !f.includes("components/marketing/"))
      .filter((f) => {
        const text = read(f);
        return /(>\s*|["'`])Да, [а-яё]/.test(text) && !text.includes("useConfirmFocus") && !/<ConfirmBlock\b/.test(text);
      });
    expect(offenders).toEqual([]);
  });

  it("вопрос блока связан с ним: id на вопросе, role=group (или aria-labelledby формы) на контейнере, ссылки хука подключены", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = read(file);
      for (const call of hookCalls(text)) {
        if (!call.left) {
          offenders.push(`${file}: результат useConfirmFocus не деструктурирован (react-hooks/refs не пускает obj.ref в JSX)`);
          continue;
        }
        const names = Object.fromEntries(
          call.left
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => {
              const [key, alias] = p.split(":").map((x) => x.trim());
              return [key, alias ?? key];
            }),
        );
        const q = names.questionId;
        if (!q) {
          offenders.push(`${file}: у хука с состоянием «${call.arg}» не взят questionId`);
          continue;
        }
        if (!new RegExp(`\\bid=\\{[^}]*\\b${q}\\b[^}]*\\}`).test(text)) offenders.push(`${file}: нет id={${q}} на вопросе блока «${call.arg}»`);
        const group = names.groupProps;
        const named =
          (group && new RegExp(`\\{\\.\\.\\.[^}]*\\b${group}\\b[^}]*\\}`).test(text)) ||
          new RegExp(`aria-labelledby=\\{[^}]*\\b${q}\\b[^}]*\\}`).test(text);
        if (!named) offenders.push(`${file}: контейнер блока «${call.arg}» не назван (нужен {...groupProps} или aria-labelledby={questionId})`);
        if (names.triggerRef && !new RegExp(`ref=\\{${names.triggerRef}\\}`).test(text)) offenders.push(`${file}: triggerRef «${call.arg}» не повешен на кнопку`);
        if (names.focusRef && !new RegExp(`ref=\\{${names.focusRef}\\}`).test(text)) offenders.push(`${file}: focusRef «${call.arg}» не повешен на «Отмену» или поле`);
        // «Отмена» без слов вопроса не говорит ничего: там, где название группы при переводе фокуса читают не всегда
        // (например, VoiceOver на iPhone), вопрос читается как описание самой кнопки
        if (names.focusRef) {
          const target = jsxTags(text, "Button|button").find((t) => new RegExp(`ref=\\{${names.focusRef}\\}`).test(t.text));
          if (target && !new RegExp(`aria-describedby=\\{${q}\\}`).test(target.text)) {
            offenders.push(`${file}: кнопка с focusRef «${call.arg}» не описана вопросом (aria-describedby={${q}})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("плитка шторки «Ещё» уводит на другой раздел и забывает кнопку «Ещё» (иначе фокус гоняется с Next)", () => {
    const text = read("components/shell/bottom-tabs.tsx");
    expect(text).toMatch(/item\.href !== pathname\) returnFocus\.forget\(\)/);
  });
});

describe("сторож блоков на месте кнопки сам проверен на выдуманном коде", () => {
  const names = (code: string) => findInlineToggles(code).map((t) => t.state);

  it("находит `cancelling`, `mode` со строками, `editingFeedback` и любое другое имя — по устройству", () => {
    expect(
      names(`
        const [cancelling, setCancelling] = useState(false);
        <Button onClick={() => setCancelling(true)}>Отменить</Button>
        <Button onClick={() => setCancelling(false)}>Не отменять</Button>`),
    ).toEqual(["cancelling"]);
    expect(
      names(`
        const [mode, setMode] = useState<"view" | "editing">("view");
        <button onClick={() => { setDraft(x); setMode("editing"); }}>Изменить</button>
        <Button onClick={() => setMode("view")}>Отмена</Button>`),
    ).toEqual(["mode"]);
    expect(
      names(`
        const [zzz, setZzz] = useState(false);
        <button onClick={() => setZzz(true)}>Открыть</button>
        <button onClick={() => setZzz(false)}>Закрыть</button>`),
    ).toEqual(["zzz"]);
  });

  it("видит кнопку, которая открывает блок через функцию файла, и кнопку «Отмена» через функцию", () => {
    expect(
      names(`
        const [mode, setMode] = useState(null);
        function open(next) { setDone(null); setMode(next); }
        function cancel() { setMode(null); }
        <Button onClick={() => open("create")}>Создать</Button>
        <Button onClick={cancel}>Отмена</Button>`),
    ).toEqual(["mode"]);
  });

  it("не принимает за блок окно, признак занятости, сообщение и фильтр без «закрыть»", () => {
    // окно: у него свой возврат фокуса
    expect(
      names(`
        const [more, setMore] = useState(false);
        <button onClick={() => setMore(true)}>Ещё</button>
        <Sheet open={more} onOpenChange={setMore}><button onClick={() => setMore(false)}>x</button></Sheet>`),
    ).toEqual([]);
    // занятость: «включить» и «выключить» в одном обработчике
    expect(
      names(`
        const [busy, setBusy] = useState(false);
        <button onClick={async () => { setBusy(true); await go(); setBusy(false); }}>Отправить</button>`),
    ).toEqual([]);
    // сообщение и данные
    expect(
      names(`
        const [error, setError] = useState(null);
        <button onClick={() => setError("Не получилось отправить код")}>a</button>
        <button onClick={() => setError(null)}>b</button>
        <button onClick={() => setError(result.error)}>c</button>`),
    ).toEqual([]);
    // выбор без «закрыть»
    expect(
      names(`
        const [filter, setFilter] = useState("all");
        <button onClick={() => setFilter("new")}>Новые</button>
        <button onClick={() => setFilter("all")}>Все</button>`),
    ).toEqual([]);
  });

  it("переключатель одной кнопкой `setX(!x)` тоже виден — он в исключениях с причиной", () => {
    expect(
      names(`
        const [p, setP] = useState(false);
        <button onClick={() => setP(!p)}>Показать</button>`),
    ).toEqual(["p"]);
  });
});
