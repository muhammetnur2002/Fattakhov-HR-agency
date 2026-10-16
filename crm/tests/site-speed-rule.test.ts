/**
 * Скорость публичного сайта: правила, которые держат замеры 13–15.10.2026.
 *
 * Боевая сборка на эмуляции телефона (375x667, процессор 4x медленнее, «медленная 4G» — 1,6 Мбит/с,
 * 150 мс) показала, что самый большой элемент главной приходил к 4,2 с, внутренних страниц — к 2,4–2,7 с,
 * хотя текст рисовался уже на 1,1 с. Причина не в сервере и не в тексте:
 *
 * - самая большая картинка страницы была `background-image` в CSS. Фон браузер находит только после
 *   разбора стилей и качает с низким приоритетом вровень с 20 скриптами; JPEG весил 192 КБ (кадр героя)
 *   и 57 КБ (фактура «рёбра» на каждом тёмном блоке), оптимизатор Next отдаёт тот же рисунок в WebP
 *   в 17 КБ и 2 КБ под размер экрана;
 * - в первую загрузку каждой страницы попадали библиотеки, которые на сайте ничего не делают: браузерный
 *   Sentry (он выключен, DSN пуст — около 165 КБ до сжатия), `motion` ради счётчика цифр (около 78 КБ)
 *   и `sonner` для всплывающих сообщений, которых на сайте нет (около 33 КБ);
 * - знак «₽» тянул файл шрифта на 85 КБ (`latin-ext`) с высоким приоритетом: он стоял в очереди рядом
 *   с главной картинкой и перерисовывал цену, когда приходил.
 *
 * Живые цифры меряют боевая сборка (LCP) и `tests/e2e/site-cls.spec.ts` (CLS, запуск вручную по боевой
 * сборке: без `SITE_PERF_BASE_URL` её страницы не идут, и до правок она была бы зелёной тоже — порог 0,02
 * выше прежнего худшего замера 0,0137, так что она ловит только будущий заметный сдвиг). Автоматически
 * правила держит этот тест: он не даёт вернуть те же ошибки молча. Каждое правило проверено на «красное без правки».
 * Цифры LCP в описании PR — при прогретом кэше оптимизатора картинок (`/_next/image`): первый посетитель после
 * запуска сервера платит около +0,3 с (1396 против 1064 мс на главной), кэш лежит внутри контейнера.
 *
 * Пара логотипов в шапке (`components/brand/logo.tsx`) нарочно осталась на `priority`: замена на
 * `fetchPriority` (чтобы скрытая картинка не качалась, 5 КБ) проверена замером 15.10.2026 и проиграла —
 * логотип появлялся на 0,7 с позже (1,4 с вместо 0,8 с на эмуляции телефона), а главная картинка — на 20–60 мс.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { jsxTags, jsxTree, read, sources, stripComments } from "./helpers/jsx-source";

const SITE_DIRS = ["components/marketing", "components/audit", "app/(marketing)"];
const siteFiles = () => SITE_DIRS.flatMap(sources);
const code = (file: string) => stripComments(read(file));
const root = (file: string) => join(process.cwd(), file);

/** Все `.ts`/`.tsx` каталога (путь от корня проекта). */
function allSources(dir: string): string[] {
  return (readdirSync(root(dir), { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("node_modules"))
    .map((f) => join(dir, f));
}

describe("картинки сайта: не фон CSS и не сырой <img>", () => {
  it("на страницах сайта картинка не задана фоном CSS (утилитой bg-url или background-image): фон браузер находит после разбора стилей", () => {
    const offenders = siteFiles().filter((f) => /bg-\[url\(|background-image\s*:\s*url\(/.test(code(f)));
    expect(offenders, "картинку класть через next/image (hero.tsx, texture.tsx)").toEqual([]);
  });

  it("сырых <img> на сайте нет: размер и формат под экран выбирает next/image", () => {
    const offenders = siteFiles().filter((f) => /<img[\s>]/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it("кадр первого экрана — `next/image` с высоким приоритетом, сразу (eager), на весь слой и с `sizes`", () => {
    const hero = code("components/marketing/hero.tsx");
    const image = jsxTags(hero, "Image")[0];
    expect(image, "в hero.tsx нет <Image>").toBeTruthy();
    expect(image.text).toMatch(/src="\/brand\/slate-speckle\.jpg"/);
    expect(image.text).toMatch(/\bfill\b/);
    expect(image.text).toMatch(/sizes="100vw"/);
    expect(image.text).toMatch(/fetchPriority="high"/);
    expect(image.text).toMatch(/loading="eager"/);
    // alt пустой: кадр декоративный, подпись читалка не зачитывает
    expect(image.text).toMatch(/alt=""/);
  });

  it("у картинок на `fill` всегда есть `sizes`: без него браузер берёт самый крупный вариант", () => {
    for (const file of siteFiles()) {
      for (const tag of jsxTags(code(file), "Image")) {
        if (/\bfill\b/.test(tag.text)) expect(tag.text, `${file}: <Image fill> без sizes`).toMatch(/\bsizes=/);
      }
    }
  });

  it("`priority` и `preload` на сайте не используются: LCP-картинку ведут `fetchPriority` и `loading=\"eager\"`", () => {
    // preload кладёт в <head> ссылку на каждое такое изображение; для пары светлый/тёмный это два запроса
    const offenders = siteFiles().filter((f) => jsxTags(code(f), "Image").some((t) => /\b(priority|preload)\b/.test(t.text)));
    expect(offenders).toEqual([]);
  });

  it("фактура «рёбра» — один компонент: шапка внутренней страницы грузит её сразу, остальные блоки лениво", () => {
    const uses = (file: string) => jsxTags(code(file), "RibbedTexture");
    const intro = uses("components/marketing/page-intro.tsx");
    expect(intro).toHaveLength(1);
    expect(intro[0].text, "в шапке страницы фактура — самый большой элемент экрана").toMatch(/\beager\b/);
    for (const file of ["components/marketing/footer.tsx", "components/marketing/sections.tsx", "components/marketing/role-mosaic.tsx"]) {
      const tags = uses(file);
      expect(tags.length, file).toBeGreaterThan(0);
      for (const tag of tags) expect(tag.text, `${file}: ниже первого экрана фактура ленивая`).not.toMatch(/\beager\b/);
    }
    const texture = code("components/marketing/texture.tsx");
    expect(texture).toMatch(/loading=\{eager \? "eager" : "lazy"\}/);
    expect(texture).toMatch(/fetchPriority=\{eager \? "high" : "auto"\}/);
  });

  it("пара логотипов светлый/тёмный в шапке: оба с `priority` — `fetchPriority` вместо него опоздал на 0,7 с (замер 15.10.2026)", () => {
    const logo = code("components/brand/logo.tsx");
    // единственный <Image> с тоном `auto` — две подряд картинки под return после `if (tone !== "auto")`
    const pair = logo.slice(logo.indexOf('if (tone !== "auto")') + 'if (tone !== "auto")'.length);
    const tail = pair.slice(pair.indexOf("return (", pair.indexOf("\n  }") + 1));
    const images = jsxTags(tail, "Image");
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image.text).toMatch(/\bpriority=\{priority\}/);
      // без `loading` и `fetchPriority`: ленивая картинка с высоким приоритетом ждёт раскладки страницы
      expect(image.text).not.toMatch(/\bfetchPriority=/);
      expect(image.text).not.toMatch(/\bloading=/);
    }
  });

  it("у ролика первого экрана нет `poster`: кадр лежит под ним (hero.tsx), второй адрес той же картинки скачивался бы ещё раз", () => {
    const video = code("components/marketing/hero-video.tsx");
    const tag = jsxTags(video, "video")[0];
    expect(tag).toBeTruthy();
    expect(tag.text).not.toMatch(/\bposter=/);
  });

  it("кадр героя лежит в разметке раньше ролика и под градиентом: слои идут по порядку", () => {
    const tree = jsxTree(code("components/marketing/hero.tsx"));
    const names = tree.map((n) => n.name);
    expect(names.indexOf("Image")).toBeGreaterThan(-1);
    expect(names.indexOf("Image")).toBeLessThan(names.indexOf("HeroVideo"));
  });
});

describe("шрифты: Inter через next/font, кириллица и латиница, без перечня начертаний", () => {
  const layout = code("app/layout.tsx");

  it("Inter подключён через next/font/google с подмножествами `latin` и `cyrillic`", () => {
    expect(layout).toMatch(/import \{ Inter \} from "next\/font\/google"/);
    const call = /Inter\(\{[\s\S]*?\}\)/.exec(layout)?.[0] ?? "";
    expect(call).toMatch(/subsets:\s*\["latin",\s*"cyrillic"\]/);
  });

  it("шрифт переменный: список `weight` не задан (иначе по файлу на каждое начертание)", () => {
    const call = /Inter\(\{[\s\S]*?\}\)/.exec(layout)?.[0] ?? "";
    expect(call).not.toMatch(/\bweight\s*:/);
  });

  it("подмена на запасной шрифт не отключена (`adjustFontFallback`), показ — `swap` (по умолчанию)", () => {
    const call = /Inter\(\{[\s\S]*?\}\)/.exec(layout)?.[0] ?? "";
    // size-adjust запасного шрифта убирает сдвиг при подмене; display: optional/block меняют поведение первого экрана
    expect(call).not.toMatch(/adjustFontFallback\s*:\s*false/);
    expect(call).not.toMatch(/display\s*:\s*"(block|optional|fallback)"/);
    expect(call).not.toMatch(/preload\s*:\s*false/);
  });

  it("шрифтов больше нигде не подключают: ни другого next/font, ни @font-face, ни внешних стилей шрифтов", () => {
    const offenders: string[] = [];
    for (const file of [...allSources("app"), ...allSources("components")]) {
      if (file === "app/layout.tsx") continue;
      const text = readFileSync(root(file), "utf8");
      if (/from "next\/font\//.test(text) || /fonts\.(googleapis|gstatic)\.com/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    const css = readFileSync(root("app/globals.css"), "utf8");
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it("знак «₽» — свой крошечный файл: иначе ради него грузится latin-ext на 85 КБ с высоким приоритетом", () => {
    // Inter от Google кладёт U+20BD в файл latin-ext (U+20AD-20C4). Он грузился на каждой странице с ценой,
    // поздно, и при приходе перерисовывал цену. Вырезка того же знака из того же файла — 2,3 КБ
    const call = /localFont\(\{[\s\S]*?\}\);/.exec(layout)?.[0] ?? "";
    expect(call, "в app/layout.tsx нет localFont для знака рубля").not.toBe("");
    expect(call).toMatch(/src:\s*"\.\/fonts\/inter-ruble\.ttf"/);
    expect(call).toMatch(/unicode-range/);
    expect(call).toMatch(/U\+20BD(?!\w|-)/);
    // предзагрузка нужна: без неё браузер просит и этот файл, и latin-ext одновременно
    expect(call).not.toMatch(/preload\s*:\s*false/);
    expect(statSync(root("app/fonts/inter-ruble.ttf")).size, "вырезка должна оставаться крошечной").toBeLessThan(8 * 1024);
  });

  it("рядом со шрифтом лежит текст лицензии OFL с авторскими правами Inter: лицензия требует, чтобы они шли вместе с файлом", () => {
    // SIL OFL 1.1, п. 2: каждая копия распространяемого шрифта (в том числе вырезка) идёт с уведомлением
    // об авторских правах и текстом лицензии — отдельным файлом рядом или записью в самом шрифте
    const license = readFileSync(root("app/fonts/OFL.txt"), "utf8");
    expect(license).toMatch(/^Copyright \d{4} The Inter Project Authors \(https:\/\/github\.com\/rsms\/inter\)/);
    expect(license).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    expect(license).toMatch(/PERMISSION & CONDITIONS/);
    expect(license).toMatch(/DISCLAIMER/);
    expect(license, "в тексте чужое название шрифта").not.toMatch(/Fraunces/);
    expect(readFileSync(root("app/fonts/README.md"), "utf8")).toMatch(/`OFL\.txt`/);
  });

  it("в списке шрифтов знак рубля стоит первым, дальше Inter; Inter отдаёт переменную `--font-inter`", () => {
    const css = readFileSync(root("app/globals.css"), "utf8");
    expect(css).toMatch(/--font-sans:\s*var\(--font-ruble\),\s*var\(--font-inter\);/);
    expect(css).toMatch(/--font-heading:\s*var\(--font-ruble\),\s*var\(--font-inter\);/);
    expect(layout).toMatch(/variable:\s*"--font-inter"/);
    expect(layout).toMatch(/variable:\s*"--font-ruble"/);
    expect(layout).toMatch(/\$\{inter\.variable\} \$\{ruble\.variable\}/);
  });
});

describe("анимация появления не откладывает LCP", () => {
  it("в первом экране и шапках страниц нет `.reveal`, `Reveal`, `Stagger`: пока блок прозрачен, он не считается отрисованным", () => {
    // `.reveal` идёт на прокруточном таймлайне с opacity 0 и сдвигом 22px: на элементе первого экрана
    // LCP считался бы позже, а сдвиг давал бы лишнюю подвижность
    for (const file of ["components/marketing/hero.tsx", "components/marketing/hero-offer.tsx", "components/marketing/page-intro.tsx", "components/marketing/header.tsx"]) {
      expect(code(file), file).not.toMatch(/\bReveal\b|\bStagger\b|\breveal\b|\bstagger\b/);
    }
  });

  it("правило `.reveal` включено только при поддержке прокруточного таймлайна и без «уменьшить движение»", () => {
    const css = readFileSync(root("app/globals.css"), "utf8");
    const start = css.indexOf("@supports (animation-timeline: view())");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, start + 400);
    expect(block).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });
});

describe("сторонние скрипты: только Метрика и только после согласия", () => {
  it("<Script> в приложении один — Метрика; внешних <script src> нет", () => {
    const withScript: string[] = [];
    const externalScripts: string[] = [];
    for (const file of [...allSources("app"), ...allSources("components")]) {
      if (!file.endsWith(".tsx")) continue;
      const text = stripComments(readFileSync(root(file), "utf8"));
      if (/<Script[\s>]/.test(text)) withScript.push(file);
      if (/<script[^>]*\bsrc=["'{]*\s*["']?https?:/i.test(text)) externalScripts.push(file);
    }
    expect(withScript).toEqual(["components/analytics/metrika.tsx"]);
    expect(externalScripts).toEqual([]);
  });

  it("Метрика не создаётся без согласия и без номера счётчика, грузится после интерактивности", () => {
    const text = code("components/analytics/metrika.tsx");
    expect(text).toMatch(/if \(!COUNTER_ID \|\| !isAccepted\(choice\)\) return null/);
    const script = jsxTags(text, "Script")[0];
    expect(script.text).toMatch(/strategy="afterInteractive"/);
  });

  it("Метрика подключена только в макете сайта: в кабинетах и корне её нет", () => {
    const users = [...allSources("app"), ...allSources("components")].filter((f) => /<YandexMetrika\b/.test(readFileSync(root(f), "utf8")));
    expect(users).toEqual(["app/(marketing)/layout.tsx"]);
  });

  it("`beforeInteractive` нигде не используется: такой скрипт блокирует первую отрисовку", () => {
    const offenders = [...allSources("app"), ...allSources("components")].filter((f) => /beforeInteractive/.test(code(f)));
    expect(offenders).toEqual([]);
  });
});

describe("лишний код не уезжает в первую загрузку", () => {
  it("браузерный Sentry подгружается динамически и только при заданном DSN: статического импорта в клиентском коде нет", () => {
    // Раньше `import * as Sentry from "@sentry/nextjs"` в instrumentation-client.ts, экране ошибки и global-error.tsx
    // клало ~165 КБ (до сжатия) в первую загрузку каждой страницы при пустом DSN. Серверный instrumentation.ts не в счёт
    const offenders: string[] = [];
    const candidates = [...allSources("app"), ...allSources("components"), ...allSources("lib"), "instrumentation-client.ts"];
    for (const file of candidates) {
      const text = readFileSync(root(file), "utf8");
      const client = /^\s*["']use client["']/m.test(text) || file === "instrumentation-client.ts" || file === "app/global-error.tsx";
      if (client && /^\s*import[^;]*from\s+["']@sentry\//m.test(stripComments(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("единственный динамический импорт Sentry — в lib/monitoring/capture-client.ts, под проверкой DSN", () => {
    const text = code("lib/monitoring/capture-client.ts");
    expect(text).toMatch(/import\("@sentry\/nextjs"\)/g);
    expect(text).toMatch(/export function sentryEnabled\(\): boolean \{\s*return Boolean\(process\.env\.NEXT_PUBLIC_SENTRY_DSN\);/);
    const imports = text.match(/import\("@sentry\/nextjs"\)/g) ?? [];
    const guards = text.match(/if \(!sentryEnabled\(\)\) return;/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(imports.length);
  });

  it("счётчик цифр не тянет `motion`: его импортируют только кабинеты", () => {
    expect(code("components/motion/count-up.tsx")).not.toMatch(/from "motion/);
    // Всё, что стоит на страницах сайта, тоже без motion
    const offenders = siteFiles().filter((f) => /from "(motion|framer-motion)/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it("всплывающие сообщения (sonner) — в кабинетах, а не в корневом макете: на сайте и входе тостов нет", () => {
    expect(code("app/layout.tsx")).not.toMatch(/Toaster|sonner/);
    for (const file of ["app/(client)/layout.tsx", "app/(agency)/a/layout.tsx"]) {
      expect(code(file), file).toMatch(/<Toaster \/>/);
    }
    const siteUsers = siteFiles().filter((f) => /sonner/.test(code(f)));
    expect(siteUsers).toEqual([]);
  });

  it("`toast()` вызывают только там, где есть <Toaster />: в кабинетах (агентство, клиент, доска)", () => {
    // Вне кабинетов контейнера тостов нет, и вызов молча ничего не покажет. Понадобится тост на сайте или
    // при входе — поставить <Toaster /> в их макет и расширить список здесь, а не вернуть его в корневой макет
    const allowed = [/^app\/\(agency\)\//, /^app\/\(client\)\//, /^components\/kanban\//, /^components\/ui\/sonner\.tsx$/];
    const offenders = [...allSources("app"), ...allSources("components"), ...allSources("lib")].filter(
      (f) => /from "sonner"/.test(code(f)) && !allowed.some((re) => re.test(f)),
    );
    expect(offenders).toEqual([]);
  });
});
