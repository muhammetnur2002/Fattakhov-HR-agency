/**
 * Сетка публичного сайта: одна ось, один вертикальный шаг, один интервал «заголовок → содержимое»,
 * две пропорции колонок. Правила записаны в `components/marketing/layout.ts`.
 *
 * Сверка 11.10.2026 по замерам на локальном сайте:
 * - заголовки `/tariffs`, `/cases`, `/audit` стояли на 105 · 185 · 425px при логотипе шапки на 70
 *   (у героев был свой контейнер `max-w-4xl px-5`);
 * - у раздела было три отступа (`tight`, `normal`, `tall`), которые отличались на 10px, и каждая
 *   страница выбирала их по вкусу; героям внутренних страниц хватало своих `py-12 md:py-16`;
 * - от заголовка раздела до содержимого — 50px на главной и 30px на тарифах, аудите, кейсах и у
 *   списка диагностики: каждый компонент писал свой `mt-*`;
 * - у двухколоночных блоков главной было семь пропорций, левый край второй колонки на 1440 лежал
 *   на семи разных расстояниях (735 · 745 · 836 · 838 · 920 · 1019 · 1089).
 *
 * Живые страницы меряет `tests/e2e/site-grid.spec.ts`: исходник не скажет, куда браузер поставил
 * заголовок, а этот тест не даёт вернуть копию той же ошибки молча.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxTags, jsxTree, read, sources, type JsxNode } from "./helpers/jsx-source";

const SITE_DIRS = ["components/marketing", "components/audit", "app/(marketing)"];

/** Код без комментариев: правило о классах не должно срабатывать на пояснение, которое их называет. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const siteFiles = () => SITE_DIRS.flatMap(sources);
const pageFiles = () => sources("app/(marketing)").filter((f) => f.endsWith("page.tsx"));

describe("одна ось сайта", () => {
  const layout = read("components/marketing/layout.ts");

  it("боковые поля заданы один раз: в `layout.ts`, а не копиями в разметке", () => {
    // `px-5 md:px-8 xl:px-14` стоял в шапке, подвале, разделе и первом экране; героям внутренних
    // страниц достался другой (`max-w-4xl px-5`), и заголовок съехал вправо
    const offenders: string[] = [];
    for (const file of siteFiles()) {
      const text = code(file);
      for (const m of text.matchAll(/(?<![\w-])(?:xl:-?px-14|xl:-mx-14|md:-?px-8|md:-mx-8)(?![\w-])/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders, "боковые поля — SITE_GUTTER / SITE_CONTAINER из layout.ts").toEqual([]);
  });

  it("контейнер `max-w-[2200px]` не копируется: он только в `SITE_CONTAINER`", () => {
    // полоса цифр держала собственную копию («mx-auto max-w-[2200px] md:px-3 xl:px-9» плюс `px-5` у ячеек):
    // по сумме те же 25/40/70px, но правка `SITE_GUTTER` её не двигала, а сторож выше её не видел
    const offenders = siteFiles().filter((f) => /max-w-\[2200px\]/.test(code(f)));
    expect(offenders, "ширину и поля контейнера задаёт SITE_CONTAINER из layout.ts").toEqual([]);
  });

  it("полоса цифр (`Facts`) стоит на оси сайта: `SITE_CONTAINER`, а отступ ячеек `px-5` гасит `-mx-5` сетки", () => {
    const text = code("components/marketing/sections.tsx");
    const start = text.indexOf("export function Facts(");
    const body = text.slice(start, text.indexOf("\nexport function", start + 10));
    expect(body).toMatch(/<div className=\{SITE_CONTAINER\}>/);
    // без пары левый край цифр съехал бы на величину отступа ячейки
    expect(body).toMatch(/<Stagger className="-mx-5 /);
    expect(body).toMatch(/<StaggerItem [^>]*className="px-5 /);
  });

  it("выход ленты из полей (`SITE_GUTTER_BLEED`) повторяет поля (`SITE_GUTTER`) на каждой ширине", () => {
    const gutter = /SITE_GUTTER = "([^"]+)"/.exec(layout)?.[1];
    const bleed = /SITE_GUTTER_BLEED = "([^"]+)"/.exec(layout)?.[1];
    expect(gutter).toBeTruthy();
    expect(bleed).toBeTruthy();
    // px-5 md:px-8 xl:px-14  ↔  -mx-5 md:-mx-8 xl:-mx-14: числа по брейкпоинтам равны
    const numbers = (s: string) => s.split(" ").map((c) => `${c.split(":").length > 1 ? c.split(":")[0] : "base"}=${/(\d+)$/.exec(c)![1]}`);
    expect(numbers(bleed!)).toEqual(numbers(gutter!));
    expect(bleed).toMatch(/^-mx-/);
  });

  it("шапка, подвал, раздел, первый экран и шапка внутренней страницы берут контейнер из `layout`", () => {
    for (const file of [
      "components/marketing/header.tsx",
      "components/marketing/footer.tsx",
      "components/marketing/sections.tsx",
      "components/marketing/hero.tsx",
      "components/marketing/page-intro.tsx",
    ]) {
      expect(read(file), file).toMatch(/SITE_CONTAINER/);
    }
    expect(layout).toMatch(/SITE_CONTAINER = `mx-auto max-w-\[2200px\] \$\{SITE_GUTTER\}`/);
  });

  it("герои /tariffs, /cases и /audit — через `PageHero`, без собственной `<section>` и колонки `max-w-4xl`", () => {
    for (const file of ["app/(marketing)/tariffs/page.tsx", "app/(marketing)/cases/page.tsx", "app/(marketing)/audit/page.tsx"]) {
      const text = read(file);
      expect(text, file).toMatch(/<PageHero>/);
      expect(text, `${file}: собственная шапка-полоса`).not.toMatch(/<section[\s>]/);
      expect(text, `${file}: колонка героя уже оси`).not.toMatch(/max-w-4xl/);
    }
  });

  it("абзац героя ограничен на самом тексте, а не колонкой", () => {
    expect(read("components/marketing/page-intro.tsx")).toMatch(/<p className="mt-6 max-w-2xl /);
  });
});

describe("вертикальный шаг разделов", () => {
  it("у `Section` два отступа: обычный и `tight`; `tall` и `width=\"wide\"` убраны", () => {
    const text = read("components/marketing/sections.tsx");
    expect(text).toMatch(/pad\?: "normal" \| "tight"/);
    expect(text).toMatch(/width\?: "narrow" \| "normal"/);
    expect(code("components/marketing/sections.tsx")).not.toMatch(/"tall"|"wide"/);
  });

  /**
   * Исключения из единого шага: раздел, внутри которого одна карточка со своим отступом `p-8`
   * (призыв к аудиту и блок студентов) — воздух даёт сама карточка. Новая строка здесь — это
   * решение с причиной, а не вкус разработчика.
   */
  const TIGHT_EXCEPTIONS: Record<string, { count: number; reason: string }> = {
    "app/(marketing)/page.tsx": { count: 2, reason: "призыв к аудиту и блок студентов: карточка p-8 внутри раздела" },
  };

  it("`pad=\"tight\"` — только у разделов-карточек из списка исключений", () => {
    const found: Record<string, number> = {};
    for (const file of sources("app/(marketing)")) {
      for (const tag of jsxTags(read(file), "Section")) {
        const pad = /\bpad="([^"]+)"/.exec(tag.text)?.[1];
        if (pad === undefined) continue;
        expect(pad, `${file}:${tag.line}`).toBe("tight");
        found[file] = (found[file] ?? 0) + 1;
      }
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(TIGHT_EXCEPTIONS).map(([f, e]) => [f, e.count])));
  });

  it("каждый раздел с `tight` — это карточка: внутри одна рамка с `p-8`", () => {
    const text = read("app/(marketing)/page.tsx");
    const nodes = jsxTree(text);
    for (const section of nodes.filter((n) => n.name === "Section" && /\bpad="tight"/.test(n.text))) {
      const card = section.children[0];
      expect(card?.classes, `Section:${section.line}`).toMatch(/rounded-2xl border .*p-8/);
    }
  });

  it("герои: внутренние — `py-12 md:py-16` в одном месте, главная — тот же шаг, что у раздела", () => {
    expect((code("components/marketing/page-intro.tsx").match(/py-12 md:py-16/g) ?? []).length).toBe(1);
    for (const file of siteFiles().filter((f) => !f.endsWith("page-intro.tsx"))) {
      expect(code(file), file).not.toMatch(/py-12 md:py-16/);
    }
    // отступ первого экрана главной — не исключение, а ровно шаг `Section` (проверка к PR #118 нашла в комментариях
    // «плотнее раздела», хотя строки совпадали): сверяем сами строки, а не слова о них
    const step = /pad === "tight" \? "py-8" : "(py-8 md:py-10)"/.exec(code("components/marketing/sections.tsx"))?.[1];
    expect(step, "шаг обычного раздела в Section").toBeTruthy();
    expect(read("components/marketing/hero.tsx")).toContain(`\${SITE_CONTAINER} ${step}\``);
  });
});

describe("интервал «заголовок → содержимое»", () => {
  it("его ставит сам `SectionHead`: `mb-10` из `layout.ts`", () => {
    expect(read("components/marketing/layout.ts")).toMatch(/SECTION_HEAD_GAP = "mb-10"/);
    const text = read("components/marketing/sections.tsx");
    expect(text).toMatch(/className=\{`\$\{SECTION_HEAD_GAP\} /);
  });

  /** Корневые классы компонента-содержимого и вложенного в него первого тега, если корень — обёртка. */
  function rootClasses(name: string, strict = false): string[] {
    for (const file of SITE_DIRS.flatMap(sources)) {
      const text = read(file);
      const def = text.indexOf(`export function ${name}(`);
      if (def < 0) continue;
      const ret = text.indexOf("return", def);
      const after = jsxTags(text.slice(ret)).slice(0, 2);
      return after.map((t) => t.classes);
    }
    // примитивы интерфейса (ScrollRegion, Button) лежат вне сайта: их className уже в самом теге
    if (strict) throw new Error(`нет компонента ${name}`);
    return [];
  }

  /**
   * Собственный верхний отступ-интервал в строке классов. Не считаются `mt-0` и пара «`-mt-N` + `pt-N`» с одним
   * вариантом ширины: отрицательный отступ забирает ровно то место, которое дал внутренний, в сумме ноль
   * (лента тарифов: `pt-4` — место под плашку «Рекомендуем», `-mt-4` — возвращает его из зазора после заголовка).
   */
  function ownTopMargin(classes: string): string | undefined {
    const tokens = classes.split(" ");
    for (const t of tokens) {
      const m = /^((?:[a-z0-9]+:)*)(-?)mt-([\w.]+)$/.exec(t);
      if (!m) continue;
      const [, variant, negative, size] = m;
      if (size === "0") continue;
      if (negative && tokens.includes(`${variant}pt-${size}`)) continue;
      return t;
    }
    return undefined;
  }

  function nextSibling(node: JsxNode): JsxNode | undefined {
    const list = node.parent?.children ?? [];
    return list[list.indexOf(node) + 1];
  }

  it("у того, что идёт сразу после `SectionHead`, нет своего `mt-*`", () => {
    const offenders: string[] = [];
    let heads = 0;
    for (const file of pageFiles()) {
      for (const node of jsxTree(read(file)).filter((n) => n.name === "SectionHead")) {
        heads += 1;
        const next = nextSibling(node);
        if (!next) continue;
        const own = ownTopMargin(next.classes);
        if (own) offenders.push(`${file}:${next.line}  <${next.name}> ${own}`);
        if (/^[A-Z]/.test(next.name)) {
          for (const classes of rootClasses(next.name)) {
            const inner = ownTopMargin(classes);
            if (inner) offenders.push(`${file}:${next.line}  <${next.name}> корень с ${inner}`);
          }
        }
      }
    }
    expect(heads, "страницы сайта содержат заголовки разделов").toBeGreaterThan(15);
    expect(offenders, "интервал после заголовка ставит SectionHead, содержимое mt-* не пишет").toEqual([]);
  });

  it("содержимое, у которого раньше был свой `mt-10`, не вернулось к нему", () => {
    for (const name of [
      "WhenSubscription",
      "HowItWorks",
      "Responsibility",
      "PlatformPreview",
      "Cases",
      "RoleMosaic",
      "Pricing",
      "Comparison",
      "Faq",
    ]) {
      for (const classes of rootClasses(name, true)) {
        expect(ownTopMargin(classes), name).toBeUndefined();
      }
    }
  });

  it("`ownTopMargin` отличает интервал от пары «−mt + pt»: сторож не пропускает чужой `mt-*`", () => {
    expect(ownTopMargin("flex mt-10 gap-4")).toBe("mt-10");
    expect(ownTopMargin("flex 2xl:mt-6")).toBe("2xl:mt-6");
    expect(ownTopMargin("flex -mt-4 gap-4"), "отрицательный отступ без пары — это интервал").toBe("-mt-4");
    expect(ownTopMargin("flex -mt-4 pt-3"), "пара должна быть равной величины").toBe("-mt-4");
    expect(ownTopMargin("flex -mt-4 pt-4 2xl:mt-0 2xl:pt-0")).toBeUndefined();
  });

  it("лента тарифов: `-mt-4 pt-4` в паре, корень `flow-root` — видимый интервал до первой плитки общий, а не 70px", () => {
    const [root, strip] = rootClasses("Pricing", true);
    expect(root).toMatch(/(?<![\w-])flow-root(?![\w-])/);
    // с 2xl лента — сетка без обрезки, там пара снимается целиком
    expect(strip).toMatch(/(?<![\w:-])-mt-4(?![\w-])/);
    expect(strip).toMatch(/(?<![\w:-])pt-4(?![\w-])/);
    expect(strip).toMatch(/2xl:mt-0/);
    expect(strip).toMatch(/2xl:pt-0/);
  });
});

describe("две пропорции колонок и один промежуток", () => {
  const layout = read("components/marketing/layout.ts");

  it("в `layout.ts` две пропорции: 1fr/1fr и 1.15fr/0.85fr; промежуток `gap-10` в колонках и `gap-6` в столбик", () => {
    const splits = [...layout.matchAll(/export const (SPLIT_\w+) = "([^"]+)"/g)].map((m) => ({ name: m[1], cls: m[2] }));
    expect(splits.map((s) => s.name).sort()).toEqual(["SPLIT_EVEN", "SPLIT_MAIN", "SPLIT_MAIN_FROM_XL"]);
    for (const s of splits) {
      const from = s.name === "SPLIT_MAIN_FROM_XL" ? "xl" : "lg";
      // 40px между колонками, а друг под другом (телефон, планшет) — 24px, как были у блоков внутри карточек:
      // единый `gap-10` без ширины прибавил им 16px (проверка к PR #118, 12.10.2026)
      expect(s.cls, s.name).toMatch(/(?<![\w:-])gap-6(?![\w-])/);
      expect(s.cls, s.name).toContain(` ${from}:gap-10 `);
      expect(s.cls, s.name).not.toMatch(/(?<![\w:-])gap-10(?![\w-])/);
    }
    const proportions = new Set(
      splits.map((s) => /grid-cols-(2|\[[^\]]+\])/.exec(s.cls)![1]),
    );
    expect([...proportions].sort()).toEqual(["2", "[1.15fr_0.85fr]"]);
  });

  it("двухколоночный блок сайта берёт `SPLIT_*`: `lg:grid-cols-2` и `xl:grid-cols-2` руками не пишутся", () => {
    // тест на константы выше не отличит произвольный `grid gap-6 lg:grid-cols-2` в новом блоке
    const offenders: string[] = [];
    for (const file of siteFiles()) {
      for (const tag of jsxTags(read(file))) {
        if (tag.classes.split(" ").some((c) => /^(?:lg|xl|2xl):grid-cols-2$/.test(c))) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders, "две колонки с 1024 — SPLIT_EVEN (1/1) или SPLIT_MAIN (1.15/0.85) из layout.ts").toEqual([]);
  });

  /**
   * Произвольные `grid-cols-[…]` в разметке сайта. Двухколоночные пропорции сюда не входят: их
   * задают константы `SPLIT_*`. Здесь только то, что колонками блока не является, и у каждого
   * своя причина.
   */
  const ARBITRARY_COLUMNS: Record<string, string> = {
    "[1fr_1.1fr_1.22fr_1.1fr_1fr]": "дуга тарифов: пять карточек, симметричные доли (pricing.tsx)",
    "[10rem_repeat(3,1fr)]": "таблица сравнения: колонка названий и три модели (sections.tsx)",
    "[2.5rem_1fr]": "строка карты процесса: номер и текст (audit/page.tsx)",
    "[auto_1fr]": "список «термин — значение» политики (privacy/page.tsx)",
  };

  it("нет двухколоночных пропорций вне `SPLIT_*`: допустимы только перечисленные исключения", () => {
    const found = new Set<string>();
    for (const file of siteFiles()) {
      for (const tag of [...jsxTags(read(file)), ...[]]) {
        for (const c of tag.classes.split(" ")) {
          const m = /grid-cols-(\[[^\]]+\])$/.exec(c);
          if (m) found.add(m[1]);
        }
      }
    }
    const unknown = [...found].filter((v) => !(v in ARBITRARY_COLUMNS));
    expect(unknown, "новая пропорция колонок: возьми SPLIT_EVEN / SPLIT_MAIN или впиши исключение с причиной").toEqual([]);
    expect(
      Object.keys(ARBITRARY_COLUMNS).filter((v) => !found.has(v)),
      "исключение из списка больше не встречается: убери его",
    ).toEqual([]);
  });

  it("блоки главной используют константы: `1.15fr_0.85fr` в разметке не пишется руками", () => {
    for (const file of siteFiles()) {
      expect(code(file), file).not.toMatch(/0\.85fr|1\.15fr|1\.3fr|1\.35fr|0\.7fr/);
    }
  });

  it("первый экран, кабинет, призыв к аудиту, блок студентов и зона ответственности — `SPLIT_MAIN`", () => {
    expect(read("components/marketing/hero.tsx")).toMatch(/SPLIT_MAIN_FROM_XL/);
    expect(read("components/marketing/platform-preview.tsx")).toMatch(/SPLIT_MAIN/);
    expect(read("components/marketing/sections.tsx")).toMatch(/<div className=\{SPLIT_MAIN\}>/);
    const page = read("app/(marketing)/page.tsx");
    expect((page.match(/\$\{SPLIT_MAIN\} items-center/g) ?? []).length).toBe(2);
    expect(page).toMatch(/\$\{SPLIT_EVEN\} lg:items-start/);
  });
});

describe("тарифы: лента и дуга", () => {
  const src = code("components/marketing/pricing.tsx");

  it("лента уходит под край окна на поправку, равную полям раздела, а не на `-mx-5`", () => {
    expect(src).toMatch(/SITE_GUTTER_BLEED/);
    expect(src).toMatch(/SITE_GUTTER,/);
    expect(src).not.toMatch(/-mx-5|px-5 pb-2/);
  });

  it("плашка «Рекомендуем» лежит поверх кромки и не в потоке: цена центральной не сдвигается", () => {
    const badge = jsxTags(src, "div").find((t) => /\bborder-white\/25 bg-brand-graphite\b/.test(t.classes) && /\babsolute\b/.test(t.classes));
    expect(badge, "плашка с absolute и сплошным фоном").toBeTruthy();
    expect(src).not.toMatch(/mb-3 inline-flex/);
  });

  it("плитки тянутся по высоте ряда, цены одного размера, дуга — верхом коробки", () => {
    expect(src).not.toMatch(/2xl:items-end/);
    expect(src).not.toMatch(/уровень === 2 \? "text-4xl"/);
    // соседи центра и центр тянутся вверх на 10 и 20px, а внутренний верх толще на столько же
    expect(src).toMatch(/уровень === 1 && "2xl:-mt-2 2xl:pt-7"/);
    expect(src).toMatch(/уровень === 2 && "2xl:-mt-4 2xl:pt-9"/);
  });

  it("сетка из пяти колонок — с 2xl и с запасом: карточка не уже 264px, промежуток `gap-3`", () => {
    // 5 × 264 + 4 × 15 = 1380 < 1396 (контейнер на 1536). С px-5 и gap-4 нужно 1450, и пятая плитка
    // выступала за край окна на 12px
    expect(src).toMatch(/2xl:grid /);
    expect(src).toMatch(/2xl:gap-3/);
    expect(src).toMatch(/2xl:px-4/);
    expect(src).toMatch(/2xl:grid-cols-\[1fr_1\.1fr_1\.22fr_1\.1fr_1fr\]/);
  });
});

describe("первый экран главной: компоновка меняется, шкала нет", () => {
  const hero = read("components/marketing/hero.tsx");
  const tree = jsxTree(hero);

  it("абзац под заголовком — 30px с 1280 (`xl:text-2xl`), а не с 1536", () => {
    // первая версия правки заменила `xl:` на `2xl:` и молча уменьшила абзац с 30 до 22px на 1280–1535 (самые
    // частые ширины ноутбука): кнопки поднялись, но заказчик шкалу не менял. Живой размер — в site-first-screen.spec.ts
    const lead = tree.find((n) => n.name === "p");
    expect(lead, "абзац героя").toBeTruthy();
    const tokens = lead!.classes.split(" ");
    expect(tokens).toContain("xl:text-2xl");
    expect(tokens).toContain("xl:max-w-2xl");
    expect(tokens, "размер абзаца не сдвинут на 2xl").not.toContain("2xl:text-2xl");
    expect(tokens).toContain("text-lg");
    expect(tokens).toContain("md:text-xl");
  });

  it("ценник стоит в обёртке с обычным overflow: у карточки `overflow-hidden`, а у элемента сетки он обнуляет минимум ширины", () => {
    const offer = tree.find((n) => n.name === "HeroOffer");
    expect(offer?.parent?.name, "HeroOffer не прямой ребёнок сетки").toBe("div");
    expect(offer!.parent!.classes).toContain("xl:min-w-min");
    expect(offer!.parent!.classes).not.toMatch(/overflow-/);
    expect(offer!.parent!.parent?.text).toContain("SPLIT_MAIN_FROM_XL");
  });
});

describe("сторож видит то, что должен", () => {
  it("читает страницы сайта и пары «заголовок — содержимое»", () => {
    const files = pageFiles();
    expect(files).toEqual(
      expect.arrayContaining([
        "app/(marketing)/page.tsx",
        "app/(marketing)/tariffs/page.tsx",
        "app/(marketing)/cases/page.tsx",
        "app/(marketing)/audit/page.tsx",
        "app/(marketing)/privacy/page.tsx",
      ]),
    );
    const tree = jsxTree(readFileSync(join(process.cwd(), "app/(marketing)/page.tsx"), "utf8"));
    expect(tree.filter((n) => n.name === "SectionHead").length).toBeGreaterThan(8);
  });
});
