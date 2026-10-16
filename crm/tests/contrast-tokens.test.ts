/**
 * Контраст токенов в app/globals.css — по формуле WCAG, а не на глаз.
 *
 * Аудит 07.10.2026 нашёл четыре места ниже порога: граница поля ввода
 * 1,2:1 (нужно 3:1, WCAG 1.4.11), кольцо фокуса вполовину прозрачное 1,9:1,
 * наведение на основную кнопку 3,4:1 и красный текст на своей плашке
 * 3,9:1 (нужно 4,5:1). Тест читает значения прямо из CSS, поэтому правка
 * токена, которая вернёт проблему, упадёт здесь.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxTags, read, sources as tsxSources } from "./helpers/jsx-source";

type Rgba = { r: number; g: number; b: number; a: number };

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const utils = readFileSync(new URL("../lib/utils.ts", import.meta.url), "utf8");

/** Тело первого блока `selector { ... }`, в котором задана палитра (есть --background). */
function block(selector: RegExp): string {
  const all = new RegExp(selector.source, "gm");
  for (let m = all.exec(css); m; m = all.exec(css)) {
    const start = css.indexOf("{", m.index);
    let depth = 0;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        const body = css.slice(start + 1, i);
        if (body.includes("--background:")) return body;
        break;
      }
    }
  }
  throw new Error(`нет блока с палитрой для ${selector}`);
}

function token(body: string, name: string): Rgba {
  const m = new RegExp(`--${name}:\\s*rgb\\((\\d+)\\s+(\\d+)\\s+(\\d+)(?:\\s*/\\s*(\\d+)%)?\\)`).exec(body);
  if (!m) throw new Error(`нет токена --${name}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] / 100 : 1 };
}

/** Наложить цвет с прозрачностью на непрозрачный фон. */
function over(fg: Rgba, bg: Rgba, alpha = fg.a): Rgba {
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ({ r, g, b }: Rgba) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [
  // tint — прозрачность красной плашки: обычная и при наведении (button.tsx, badge.tsx)
  // pressed — плашка красной кнопки при нажатии (button.tsx: active:bg-destructive/30, dark: /35)
  { name: "светлая", body: block(/^:root\s*\{/m), tint: [0.1, 0.2], pressed: 0.3 },
  { name: "тёмная", body: block(/^\s*\.dark\s*\{/m), tint: [0.2, 0.25], pressed: 0.35 },
];

describe.each(THEMES)("контраст токенов: $name тема", ({ name, body, tint, pressed }) => {
  const bg = token(body, "background");
  const card = token(body, "card");

  it("граница поля ввода — не ниже 3:1 к карточке и к фону (WCAG 1.4.11)", () => {
    const field = token(body, "field");
    expect(ratio(over(field, card), card)).toBeGreaterThanOrEqual(3);
    expect(ratio(over(field, bg), bg)).toBeGreaterThanOrEqual(3);
  });

  it("кольцо фокуса — не ниже 3:1 к карточке и к фону", () => {
    const ring = token(body, "ring");
    expect(ratio(ring, card)).toBeGreaterThanOrEqual(3);
    expect(ratio(ring, bg)).toBeGreaterThanOrEqual(3);
  });

  it("наведение на основную кнопку: текст на ней — не ниже 4,5:1", () => {
    expect(ratio(token(body, "primary-foreground"), token(body, "primary-hover"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(body, "primary-foreground"), token(body, "primary"))).toBeGreaterThanOrEqual(4.5);
  });

  it("красный текст: на карточке, на фоне, на своей плашке и на плашке при наведении — не ниже 4,5:1", () => {
    const red = token(body, "destructive");
    expect(ratio(red, card)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(red, bg)).toBeGreaterThanOrEqual(4.5);
    for (const alpha of tint) expect(ratio(red, over(red, card, alpha))).toBeGreaterThanOrEqual(4.5);
  });

  it("красная плашка при наведении читается на любом фоне кабинета, не только на карточке", () => {
    // «Да, удалить» стоит прямо на фоне страницы, фильтры — на muted и accent
    const red = token(body, "destructive");
    for (const surface of ["background", "card", "muted", "accent", "secondary"]) {
      const base = token(body, surface);
      for (const alpha of tint) {
        expect(ratio(red, over(red, base, alpha)), `${surface} при ${alpha}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("тона статусных бейджей (success, warning, progress): текст читается на своей плашке на любой поверхности — не ниже 4,5:1", () => {
    // Сверка 12.10.2026, consistency-7: бейджи статусов получили три цвета рядом с красным. Прозрачность плашки
    // читается из badge.tsx (bg-<тон>/10 в светлой, dark:bg-<тон>/20 в тёмной), а не дублируется здесь
    const badge = readFileSync(new URL("../components/ui/badge.tsx", import.meta.url), "utf8");
    for (const tone of ["success", "warning", "progress"]) {
      const light = Number(new RegExp(`(?<![:\\w-])bg-${tone}/(\\d+)`).exec(badge)?.[1]) / 100;
      const dark = Number(new RegExp(`dark:bg-${tone}/(\\d+)`).exec(badge)?.[1]) / 100;
      const alpha = name === "тёмная" ? dark : light;
      expect(alpha, `прозрачность плашки ${tone} в badge.tsx`).toBeGreaterThan(0);
      const color = token(body, tone);
      for (const surface of ["background", "card", "muted", "accent", "secondary"]) {
        const base = token(body, surface);
        expect(ratio(color, over(color, base, alpha)), `${tone} на плашке поверх ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("нажатие основной кнопки: заметно темнее покоя и наведения, белый текст на ней — не ниже 4,5:1", () => {
    // Сверка 11.10.2026: нажатая кнопка имела цвет наведения — 84 110 136 → 71 97 123, 1,2:1. На телефоне
    // наведения нет, и нажатие почти не было видно. Темнее, а не светлее: на светлом упал бы контраст текста.
    const rest = token(body, "primary");
    const hover = token(body, "primary-hover");
    const active = token(body, "primary-active");
    expect(ratio(active, rest), "нажатие к покою").toBeGreaterThanOrEqual(1.5);
    expect(ratio(active, hover), "нажатие к наведению").toBeGreaterThanOrEqual(1.4);
    expect(luminance(active)).toBeLessThan(luminance(hover));
    expect(ratio(token(body, "primary-foreground"), active)).toBeGreaterThanOrEqual(4.5);
  });

  it("нажатие нейтральных кнопок: отличается от страницы и карточки, текст на нём — не ниже 4,5:1", () => {
    // Контурная кнопка при нажатии была --muted: 1,05:1 к странице, то есть не видна вовсе
    const active = token(body, "muted-active");
    for (const surface of ["background", "card", "muted"]) {
      expect(ratio(active, token(body, surface)), `к ${surface}`).toBeGreaterThanOrEqual(1.3);
    }
    expect(ratio(token(body, "foreground"), active), "текст на нажатии").toBeGreaterThanOrEqual(4.5);
  });

  it("нажатие красной кнопки: гуще плашка и свой цвет текста — читается на любой поверхности", () => {
    const red = token(body, "destructive");
    const text = token(body, "destructive-active");
    for (const surface of ["background", "card", "muted", "accent", "secondary"]) {
      const base = token(body, surface);
      const fill = over(red, base, pressed);
      expect(ratio(text, fill), `${surface}: текст на нажатой плашке`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fill, base), `${surface}: плашка к поверхности`).toBeGreaterThan(ratio(over(red, base, tint[1]), base));
    }
  });

  it("нажатие ссылки-кнопки: цвет текста читается на странице и карточке", () => {
    // Светлая: тёмный --primary-active. Тёмная: тёмный синий на чёрном упал бы до 2:1, там нажатая ссылка — --foreground
    const text = name === "тёмная" ? token(body, "foreground") : token(body, "primary-active");
    expect(ratio(text, token(body, "background"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(text, token(body, "card"))).toBeGreaterThanOrEqual(4.5);
  });

  it("выбранный чип, активная вкладка, отмеченная галочка: заливка --primary не ниже 3:1 к невыбранному (WCAG 1.4.11)", () => {
    // Сверка 11.10.2026: активная вкладка (`bg-background` на `bg-muted`) была 1,05:1 к соседним, выбранный
    // чип-ссылка (`secondary` рядом с `outline`) — те же 1,05:1: выбор отличал только оттенок текста.
    const primary = token(body, "primary");
    const input = token(body, "input");
    for (const surface of ["background", "card"]) {
      const base = token(body, surface);
      // Невыбранный чип — как Button outline: в светлой темы --background, в тёмной --input на 30% поверх поверхности
      // (`dark:bg-input/30` — треть прозрачности самого токена, а не 30% белого)
      const unselected = name === "тёмная" ? over(input, base, input.a * 0.3) : base;
      expect(ratio(primary, unselected), `выбранный к невыбранному чипу на ${surface}`).toBeGreaterThanOrEqual(3);
      expect(ratio(primary, base), `заливка к поверхности ${surface}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(primary, token(body, "muted")), "активная вкладка к списку вкладок").toBeGreaterThanOrEqual(3);
    expect(ratio(token(body, "primary-foreground"), primary), "текст и галочка на заливке").toBeGreaterThanOrEqual(4.5);
  });

  it("невыбранный чип обведён так, что граница не ниже 3:1 к поверхности — выбор держится не на сотых контраста заливки", () => {
    // Заливка выбранного к невыбранному в тёмной теме — 3,01:1: запас в сотые. Поэтому у невыбранного чипа там
    // рамка --field (как у полей ввода, 3:1), и к заливке и галочке добавляется заметная граница
    // (замечание независимой проверки к PR #119). Токен проверяется здесь, класс — в исходнике чипа.
    const chip = /const UNSELECTED =\s*"([^"]+)"/.exec(read("components/ui/filter-chip.tsx"))?.[1] ?? "";
    if (name === "тёмная") {
      expect(chip.split(/\s+/)).toContain("dark:border-field");
      const field = token(body, "field");
      for (const surface of ["background", "card"]) {
        const base = token(body, surface);
        expect(ratio(over(field, base), base), `рамка невыбранного чипа на ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("значок успеха (--primary) и красный текст ошибки читаются на карточке и фоне (WCAG 1.4.11, 1.4.3)", () => {
    // Сверка 11.10.2026: плашка результата формы — значок отличает успех от ошибки (alert.tsx, form-message.tsx).
    // Значок — графика (≥3:1), текст ошибки у поля и в плашке — текст (≥4,5:1). Плашка лежит на карточке, а строка
    // с ошибкой у поля — прямо на фоне страницы.
    const primary = token(body, "primary");
    const destructive = token(body, "destructive");
    for (const surface of ["background", "card"]) {
      const base = token(body, surface);
      expect(ratio(primary, base), `значок успеха на ${surface}`).toBeGreaterThanOrEqual(3);
      expect(ratio(destructive, base), `красный текст ошибки на ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("наведение на поле: рамка темнее покоя и не ниже 3:1 к фону и карточке", () => {
    // FIELD_HOVER = "hover:border-foreground/NN" — доля читается из исходника, а не дублируется здесь
    const alpha = Number(/hover:border-foreground\/(\d+)/.exec(utils)?.[1]) / 100;
    expect(alpha).toBeGreaterThan(0);
    const field = token(body, "field");
    const fg = token(body, "foreground");
    for (const surface of ["background", "card"]) {
      const base = token(body, surface);
      const rest = ratio(over(field, base), base);
      const hover = ratio(over(fg, base, alpha), base);
      expect(hover, `наведение к ${surface}`).toBeGreaterThanOrEqual(3);
      expect(hover, `наведение сильнее покоя на ${surface}`).toBeGreaterThan(rest);
    }
  });

  it("текст на сплошной красной заливке (счётчики) — не ниже 4,5:1", () => {
    // В тёмной теме красный светлый: белое число на нём давало 2:1
    expect(ratio(token(body, "destructive-foreground"), token(body, "destructive"))).toBeGreaterThanOrEqual(4.5);
  });
});

/** Цвет `--name: #rrggbb` из блока токенов. */
function hexToken(body: string, name: string): Rgba {
  const m = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6})\\b`).exec(body);
  if (!m) throw new Error(`нет токена --${name} в формате #rrggbb`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

describe.each(THEMES)("календарь: контраст — $name тема", ({ body }) => {
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  // Календарные токены лежат в :root и тему не меняют
  const palette = block(/^:root\s*\{/m);
  const bg = token(body, "background");
  const card = token(body, "card");
  const muted = token(body, "muted");

  it("круг «сегодня»: белое число на --cal-today — не ниже 4,5:1 (WCAG 1.4.3); на --cal-sun было 3,93:1", () => {
    expect(ratio(white, hexToken(palette, "cal-today"))).toBeGreaterThanOrEqual(4.5);
  });

  it("круг «сегодня» отличим от ячейки: не ниже 3:1 к карточке, фону и ячейке соседнего месяца (WCAG 1.4.11)", () => {
    const today = hexToken(palette, "cal-today");
    for (const surface of [card, bg, muted]) expect(ratio(today, surface)).toBeGreaterThanOrEqual(3);
  });

  it("число соседнего месяца (--muted-foreground) читается на его ячейке (--muted) и на карточке — не ниже 4,5:1", () => {
    const text = token(body, "muted-foreground");
    expect(ratio(text, muted)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(text, card)).toBeGreaterThanOrEqual(4.5);
  });
});

/** Все .tsx в app/ и components/ — для проверок исходников. */
function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const dir of ["../app", "../components"]) {
    const root = new URL(dir, import.meta.url).pathname;
    for (const rel of readdirSync(root, { recursive: true }) as string[]) {
      if (rel.endsWith(".tsx")) out.push({ file: join(dir, rel), text: readFileSync(join(root, rel), "utf8") });
    }
  }
  return out;
}

describe("контраст в исходниках", () => {
  const all = sources();

  it("кольцо фокуса — полным цветом: focus-visible:ring-*/NN нет нигде", () => {
    // Полупрозрачное кольцо (20%, 40%) давало 1,4–2,5:1 к фону: фокус был почти не виден.
    // `not-focus-visible:` — кольцо ошибки в покое, на фокусе его нет: не в счёт
    const bad = all.filter(({ text }) => /(?<!not-)focus-visible:ring-[a-z-]+\/\d+/.test(text)).map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("белый текст не стоит на сплошном bg-destructive: в тёмной теме это 2:1 — нужен text-destructive-foreground", () => {
    const bad = all
      .filter(({ text }) => /bg-destructive(?![/\w-])[^"'`\n]*text-white|text-white[^"'`\n]*bg-destructive(?![/\w-])/.test(text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("белый текст не стоит на сплошном bg-cal-sun: это 3,93:1 — нужен токен круга «сегодня» bg-cal-today", () => {
    const bad = all
      .filter(({ text }) => /bg-cal-sun(?![/\w-])[^"'`\n]*text-white|text-white[^"'`\n]*bg-cal-sun(?![/\w-])/.test(text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("текст на основном цвете не приглушают прозрачностью: text-primary-foreground/NN нет", () => {
    // Время в пузырях сообщений было /70: 3,35:1 на bg-primary. Приглушать размером или весом, не альфой
    const bad = all.filter(({ text }) => /text-primary-foreground\/\d+/.test(text)).map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("режим высокой контрастности: контур фокуса рисует система (иначе outline-none оставляет его невидимым)", () => {
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight/);
  });

  it("рамка полей — токеном --field: голый `border` у плашки с input внутри (1,2:1) не используется", () => {
    // Поиск по списку — компонент SearchField; своя плашка `rounded-xl border bg-muted/40` не нужна
    const bad = all
      .filter(({ file, text }) => !file.endsWith("search-field.tsx") && /flex h-9 items-center gap-2 rounded-xl border bg-muted\/40/.test(text))
      .map((s) => s.file);
    expect(bad).toEqual([]);
  });
});

describe("рамки сырых полей", () => {
  // Сверка 11.10.2026: рамка `border-input` (≈1,17:1 к фону) осталась у семи `<select>` и файловых полей,
  // `border` без цвета — у ещё трёх. У `Input`, `Textarea`, `Select`, `Checkbox` и `SearchField` рамка
  // `border-field` (3:1, WCAG 1.4.11): сырой элемент выглядит как поле, поэтому и рамка у него такая же.
  const files = [...tsxSources("app"), ...tsxSources("components")].filter((f) => !f.includes("components/ui/"));

  it("`border-input` — токен заливок, рамкой поля он не бывает ни у сырого, ни у самодельного поля", () => {
    const bad = files.filter((f) => /(?<![\w-])(?:file:)?border-input(?![\w-])/.test(read(f)));
    expect(bad, "рамка поля — border-field").toEqual([]);
  });

  it("у сырого <select>, <textarea> и <input> с рамкой цвет рамки — border-field", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const tag of jsxTags(read(f), "input|select|textarea")) {
        // Скрытые поля, галочки и переключатели рисует браузер (или правило globals.css) — рамки в классах нет
        if (tag.name === "input" && /type=["{]"?(hidden|checkbox|radio)/.test(tag.text)) continue;
        const cls = tag.classes.split(" ");
        for (const prefix of ["", "file:"]) {
          if (cls.includes(`${prefix}border`) && !cls.includes(`${prefix}border-field`)) {
            offenders.push(`${f}:${tag.line}  <${tag.name}> ${prefix}border без ${prefix}border-field`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("проверка видит рамку без цвета у кнопки выбора файла", () => {
    const [tag] = jsxTags(`<input type="file" className="text-xs file:rounded-md file:border file:bg-secondary" />`, "input");
    expect(tag.classes.split(" ")).toContain("file:border");
    expect(tag.classes.split(" ")).not.toContain("file:border-field");
  });
});

describe("печать", () => {
  it("тёмная палитра включается только на экране: на белой бумаге светлый текст не виден", () => {
    // Блок `.dark { … }` обязан лежать внутри `@media not print`, иначе печать из тёмной темы
    // даёт светлый текст на белом (1,06:1) — принтер не печатает фон
    const before = css.slice(0, css.search(/^\s*\.dark\s*\{/m));
    const lastMedia = before.lastIndexOf("@media not print {");
    expect(lastMedia).toBeGreaterThan(-1);
    // Между началом этого @media и блоком .dark нет закрывающей скобки уровня @media
    const between = before.slice(lastMedia + "@media not print {".length);
    expect(between.includes("}")).toBe(false);
  });
});
