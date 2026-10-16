/**
 * Публичный сайт для поисковиков и соцсетей (проверка 11.10.2026): заголовки и описания,
 * карточки соцсетей, карта сайта, robots.txt, манифест, разметка.
 *
 * Всё это не ломает ни типы, ни отрисовку — видно только по выдаче, через недели. Поэтому
 * правила записаны тестами: страницы описаны в одном реестре (`lib/marketing/seo.ts`),
 * а здесь проверяется и реестр, и то, что страницы берут метаданные оттуда, а не пишут свои.
 * Живой сервер с реальными заголовками смотрит `tests/e2e/site-seo.spec.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { jsonLdSafe } from "@/components/marketing/structured-data";
import { FAQ_ITEMS } from "@/lib/marketing/faq";
import { TARIFFS } from "@/lib/marketing/inhouse-cost";
import { jsonLdFor } from "@/lib/marketing/json-ld";
import {
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_TITLE,
  OG_SIZE,
  SITE_NAME,
  SITE_PAGES,
  SITE_PAGE_KEYS,
  TITLE_TEMPLATE,
  fullTitle,
  ogCard,
  pageMetadata,
  type SitePageKey,
} from "@/lib/marketing/seo";
import { APP_ENTRY_PATHS, APP_ROOTS } from "@/lib/site-routing";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

const ENV_KEYS = ["APP_URL", "SITE_URL", "AUTH_URL"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  process.env.APP_URL = "https://my.example.ru";
  process.env.SITE_URL = "https://example.ru";
  delete process.env.AUTH_URL;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  headersMock.mockReset();
});

const onHost = (host: string) => headersMock.mockResolvedValue(new Headers({ host }));

describe("заголовки и описания: единое правило", () => {
  it.each(SITE_PAGE_KEYS)("%s: заголовок вкладки 30–60 знаков, описание 70–160", (key) => {
    const title = fullTitle(key);
    const { description } = SITE_PAGES[key];
    expect(title.length, title).toBeGreaterThanOrEqual(30);
    expect(title.length, title).toBeLessThanOrEqual(60);
    expect(description.length, description).toBeGreaterThanOrEqual(70);
    expect(description.length, description).toBeLessThanOrEqual(160);
  });

  it("страница «не найдено» — тот же шаблон и та же длина, что у страниц сайта", () => {
    expect(NOT_FOUND_TITLE).toBe(`Страница не найдена · ${SITE_NAME}`);
    expect(NOT_FOUND_TITLE.length).toBeGreaterThanOrEqual(30);
    expect(NOT_FOUND_TITLE.length).toBeLessThanOrEqual(60);
    expect(read("app/(marketing)/site-not-found/layout.tsx")).toContain("title: { absolute: NOT_FOUND_TITLE }");
  });

  it("у страницы «не найдено» своё описание той же длины, а не унаследованное от главной", () => {
    expect(NOT_FOUND_DESCRIPTION.length).toBeGreaterThanOrEqual(70);
    expect(NOT_FOUND_DESCRIPTION.length).toBeLessThanOrEqual(160);
    for (const key of SITE_PAGE_KEYS) expect(NOT_FOUND_DESCRIPTION, key).not.toBe(SITE_PAGES[key].description);
    expect(read("app/(marketing)/site-not-found/layout.tsx")).toContain("description: NOT_FOUND_DESCRIPTION");
  });

  it("бренд один: «Fattakhov HR Agency» в каждом заголовке, ни «Платформы», ни «Fattakhov HR» без «Agency»", () => {
    for (const key of SITE_PAGE_KEYS) {
      const title = fullTitle(key);
      expect(title, key).toContain(SITE_NAME);
      expect(title, key).not.toContain("Платформа");
    }
    // Внутренние страницы: тема, потом бренд, одним шаблоном
    for (const key of SITE_PAGE_KEYS.filter((k) => k !== "home")) {
      expect(fullTitle(key)).toBe(`${SITE_PAGES[key].title} · ${SITE_NAME}`);
    }
    expect(TITLE_TEMPLATE).toBe(`%s · ${SITE_NAME}`);
  });

  it("заголовки и описания разных страниц не повторяются", () => {
    const titles = SITE_PAGE_KEYS.map((k) => fullTitle(k));
    const descriptions = SITE_PAGE_KEYS.map((k) => SITE_PAGES[k].description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("в описаниях обычные пробелы: неразрывный в сниппете выглядит как мусор", () => {
    for (const key of SITE_PAGE_KEYS) {
      const page = SITE_PAGES[key];
      for (const text of [page.description, page.og.title, page.og.description]) {
        expect(text, key).not.toMatch(/[  ]/);
      }
    }
  });

  it("цены в описаниях взяты из тарифной лестницы, а не написаны руками", () => {
    const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n).replace(/\s/g, " ");
    expect(SITE_PAGES.tariffs.description).toContain(`от ${fmt(TARIFFS[0].price)} ₽`);
    expect(SITE_PAGES.tariffs.description).toContain(`до ${fmt(TARIFFS[TARIFFS.length - 1].price)} ₽`);
    expect(SITE_PAGES.tariffs.og.title).toContain(fmt(TARIFFS[0].price));
  });
});

describe("pageMetadata: у каждой страницы всё своё", () => {
  it.each(SITE_PAGE_KEYS)("%s: canonical, карточка соцсетей и twitter описаны целиком", (key) => {
    const meta = pageMetadata(key);
    const page = SITE_PAGES[key];
    const card = ogCard(key);

    expect(meta.alternates?.canonical).toBe(page.path);
    expect(meta.description).toBe(page.description);

    const og = meta.openGraph as Record<string, unknown> & { images: { url: string; width: number; height: number; alt: string }[] };
    expect(og.type).toBe("website");
    expect(og.locale).toBe("ru_RU");
    expect(og.siteName).toBe(SITE_NAME);
    expect(og.url).toBe(page.path);
    expect(og.title).toBe(page.og.title);
    expect(og.description).toBe(page.og.description);
    expect(og.images).toEqual([{ url: card.path, width: 1200, height: 630, alt: card.alt }]);

    const tw = meta.twitter as Record<string, unknown> & { images: { url: string; alt: string }[] };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.title).toBe(page.og.title);
    expect(tw.description).toBe(page.og.description);
    expect(tw.images).toEqual([{ url: card.path, alt: card.alt }]);
  });

  it("карточка соцсетей не наследует главную: у каждой страницы свой og:title", () => {
    const titles = SITE_PAGE_KEYS.map((k) => SITE_PAGES[k].og.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("закрыта от индекса только политика, у остальных index: true", () => {
    for (const key of SITE_PAGE_KEYS) {
      const robotsMeta = pageMetadata(key).robots as { index: boolean; follow: boolean };
      expect(robotsMeta.index, key).toBe(key !== "privacy");
      expect(robotsMeta.follow, key).toBe(true);
    }
  });

  it("у главной title absolute (бренд уже внутри), у остальных — строка под шаблон макета", () => {
    expect(pageMetadata("home").title).toEqual({ absolute: SITE_PAGES.home.title });
    for (const key of SITE_PAGE_KEYS.filter((k) => k !== "home")) {
      expect(pageMetadata(key).title).toBe(SITE_PAGES[key].title);
    }
  });
});

describe("страницы сайта берут метаданные из реестра, а не пишут свои", () => {
  const ROOT_DIR = "app/(marketing)";
  const FILES: Record<SitePageKey, string> = {
    home: `${ROOT_DIR}/page.tsx`,
    tariffs: `${ROOT_DIR}/tariffs/page.tsx`,
    cases: `${ROOT_DIR}/cases/page.tsx`,
    audit: `${ROOT_DIR}/audit/page.tsx`,
    privacy: `${ROOT_DIR}/privacy/page.tsx`,
  };

  it("файлов страниц ровно столько, сколько записей в реестре (новая страница без записи — красный)", () => {
    const found = (readdirSync(join(ROOT, ROOT_DIR), { recursive: true, encoding: "utf8" }) as string[])
      // Страница «не найдено» — не страница сайта из реестра: в карте и в выдаче её нет, метаданные в макете
      .filter((f) => f.endsWith("page.tsx") && !f.startsWith("site-not-found/"))
      .map((f) => join(ROOT_DIR, f))
      .sort();
    expect(found).toEqual(Object.values(FILES).sort());
  });

  it.each(Object.entries(FILES))("%s: metadata = pageMetadata(ключ), своих title/openGraph/canonical нет", (key, file) => {
    const text = read(file);
    expect(text).toContain(`export const metadata: Metadata = pageMetadata("${key}");`);
    // Свои поля рядом с вызовом — это уже вторая копия, которая разойдётся с реестром
    expect(text).not.toMatch(/\bopenGraph\s*:/);
    expect(text).not.toMatch(/\balternates\s*:/);
    expect(text).not.toMatch(/\btitle:\s*\{\s*absolute/);
  });

  it("уровни заголовков: на /cases имя клиента — h2 (под h1 сразу h3 пропускал уровень), на главной — h3", () => {
    expect(read(FILES.cases)).toContain('<Cases headingAs="h2" />');
    expect(read(FILES.home)).toContain("<Cases />");
  });

  it.each(Object.entries(FILES).filter(([key]) => key !== "privacy"))("%s: рисует разметку своей страницы", (key, file) => {
    expect(read(file)).toContain(`<StructuredData page="${key}" />`);
  });

  it("макет сайта: адрес сайта, заголовок-шаблон с брендом и никакого canonical/openGraph/robots", () => {
    const layout = read(`${ROOT_DIR}/layout.tsx`);
    expect(layout).toContain("metadataBase: new URL(siteOrigin())");
    expect(layout).toContain("template: TITLE_TEMPLATE");
    // Унаследованный canonical называл бы главную оригиналом каждой страницы, openGraph — подставлял её заголовок
    expect(layout).not.toMatch(/\balternates\s*:/);
    expect(layout).not.toMatch(/\bopenGraph\s*:/);
    // Разрешение на индексацию даёт только страница: у новой без него по умолчанию noindex
    expect(layout).not.toMatch(/\brobots\s*:/);
  });
});

describe("индекс: сайт открыт, всё остальное закрыто", () => {
  it("корневой макет закрывает приложение по умолчанию, сайт открывает страница", () => {
    expect(read("app/layout.tsx")).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("макеты кабинетов, входа и анкеты называют noindex сами (CABINET_METADATA), а не только по наследству", () => {
    expect(read("lib/cabinet-metadata.ts")).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    for (const layout of [
      "app/(agency)/a/layout.tsx",
      "app/(client)/layout.tsx",
      "app/(public)/layout.tsx",
      "app/(onboarding)/layout.tsx",
    ]) {
      expect(read(layout), layout).toContain("export const metadata = CABINET_METADATA;");
    }
  });

  it("прокси ставит X-Robots-Tag: noindex на ответы приложения", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain('"X-Robots-Tag", "noindex, nofollow"');
    expect(proxy).toContain("isApplicationHost(host)");
  });
});

describe("карта сайта", () => {
  it("только индексируемые страницы: политика закрыта noindex и в карте не нужна", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual([
      "https://example.ru",
      "https://example.ru/tariffs",
      "https://example.ru/cases",
      "https://example.ru/audit",
    ]);
    expect(urls.some((u) => u.endsWith("/privacy"))).toBe(false);
    // Страница в карте и со своим noindex — противоречие в самих указаниях поисковику
    for (const key of SITE_PAGE_KEYS) {
      expect(SITE_PAGES[key].indexable).toBe((pageMetadata(key).robots as { index: boolean }).index);
    }
  });

  it("lastmod — дата правки текста страницы из реестра: настоящая, не из будущего, не дата сборки", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const entry of sitemap()) {
      expect(entry.lastModified, entry.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(String(entry.lastModified))), entry.url).toBe(false);
      expect(String(entry.lastModified) <= today, `${entry.url} из будущего`).toBe(true);
    }
    for (const key of SITE_PAGE_KEYS) expect(SITE_PAGES[key].updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Дата не равна «сегодня»: так выглядела бы дата сборки
    const dates = sitemap().map((e) => e.lastModified);
    expect(dates.every((d) => d === today)).toBe(false);
  });

  it("changefreq и priority убраны: Google их не учитывает", () => {
    for (const entry of sitemap()) {
      expect(entry).not.toHaveProperty("changeFrequency");
      expect(entry).not.toHaveProperty("priority");
    }
  });
});

describe("robots.txt", () => {
  const PUBLIC = ["/", "/audit", "/tariffs", "/cases", "/privacy", "/sitemap.xml", "/manifest.webmanifest"];
  const PRIVATE_SAMPLES = [
    "/a/vacancies",
    "/api/health",
    "/login",
    "/register/company",
    "/forgot",
    "/reset/abc",
    "/confirm-email/abc",
    "/invite/abc",
    "/schedule/abc",
    "/consent/abc",
    "/disclosure/abc",
    "/security/two-factor",
    "/onboarding",
    "/dashboard",
    "/vacancies/new",
    "/candidates",
    "/messages/u1",
    "/students/new",
    "/settings",
  ];

  it("сайт: открыт, закрыт каждый раздел приложения, карта с абсолютным адресом, без устаревшей Host", async () => {
    onHost("example.ru");
    const result = await robots();
    expect(result).not.toHaveProperty("host");
    expect(result.sitemap).toBe("https://example.ru/sitemap.xml");

    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = ([] as string[]).concat(rules.disallow ?? []);
    const blocked = (path: string) => disallow.some((d) => path.startsWith(d));

    expect(rules.allow).toBe("/");
    for (const path of PUBLIC) expect(blocked(path), `${path} закрыт от робота`).toBe(false);
    for (const path of PRIVATE_SAMPLES) expect(blocked(path), `${path} открыт роботу`).toBe(true);
    // Каждый корень приложения закрыт: список не пишется отдельно от APP_ROOTS
    for (const root of APP_ROOTS) expect(blocked(`/${root}/x`), `/${root}`).toBe(true);
  });

  it("«/a/» с косой чертой: «/a» закрыл бы и /audit", async () => {
    onHost("example.ru");
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = ([] as string[]).concat(rules.disallow ?? []);
    expect(disallow).toContain("/a/");
    expect(disallow).not.toContain("/a");
    expect(disallow.some((d) => "/audit".startsWith(d))).toBe(false);
  });

  /** Как читают Google и Яндекс: побеждает самое длинное совпадение, при равенстве — Allow. */
  const allowedByRobots = (rules: { allow?: string | string[]; disallow?: string | string[] }, path: string) => {
    const match = (list: string | string[] | undefined) =>
      ([] as string[]).concat(list ?? []).filter((prefix) => path.startsWith(prefix)).reduce((n, p) => Math.max(n, p.length), -1);
    return match(rules.allow) >= match(rules.disallow);
  };

  it("приложение: закрыто целиком, кроме страниц, на которые ссылается сам сайт; карта указывает на сайт", async () => {
    onHost("my.example.ru");
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.disallow).toBe("/");
    expect(rules.allow).toEqual([...APP_ENTRY_PATHS]);
    expect(result.sitemap).toBe("https://example.ru/sitemap.xml");

    // Вход и регистрация читать можно (с любым хвостом): иначе робот не увидит noindex, и адрес из чужой
    // ссылки останется в выдаче без описания — запрет обхода и запрет индекса работают друг против друга
    for (const path of ["/login", "/login?callbackUrl=%2Fdashboard", "/register", "/register/company"]) {
      expect(allowedByRobots(rules, path), `${path} открыт роботу`).toBe(true);
    }
    // Всё остальное закрыто: кабинеты, ссылки по токенам (страница с данными человека не должна даже загружаться), API
    for (const path of [
      "/", "/dashboard", "/a/vacancies", "/api/health", "/schedule/abc", "/consent/abc", "/disclosure/abc",
      "/invite/abc", "/reset/abc", "/confirm-email/abc", "/forgot", "/onboarding", "/security/two-factor", "/robots.txt",
    ]) {
      expect(allowedByRobots(rules, path), `${path} закрыт роботу`).toBe(false);
    }
  });

  it("открытое роботу на адресе приложения закрыто от индекса, а не только сказано в комментарии", () => {
    // Смысл открытия в том, чтобы робот увидел запрет. Корневой макет закрывает индекс по умолчанию,
    // и ни одна страница входа и регистрации не должна открывать его обратно. Заголовок X-Robots-Tag
    // для обеих проверяет tests/site-proxy.test.ts на настоящем прокси
    expect(read("app/layout.tsx")).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|ts)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
      );
    for (const dir of ["app/(public)", "app/(onboarding)", "app/(client)", "app/(agency)"]) {
      for (const file of walk(dir)) {
        expect(read(file), `${file} открывает индекс`).not.toMatch(/robots\s*:\s*\{[^}]*index\s*:\s*true/);
      }
    }
  });

  it("каждая ссылка с сайта на приложение есть в APP_ENTRY_PATHS: новая без записи закрыта от обхода, и robots.txt её не прочтёт", () => {
    // Ссылки на приложение с сайта строятся через appUrl("/путь"); ищем их в разметке витрины
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : [],
      );
    const linked = new Set<string>();
    for (const file of [...walk("components/marketing"), ...walk("app/(marketing)")]) {
      for (const m of read(file).matchAll(/appUrl\(\s*["'`]([^"'`$?#]+)/g)) linked.add(m[1]);
    }
    // Проверка находит хотя бы вход и регистрацию: иначе она проверила бы пустоту
    expect([...linked].sort()).toEqual(expect.arrayContaining(["/login", "/register"]));
    for (const path of linked) expect(APP_ENTRY_PATHS, `${path}: ссылка с сайта`).toContain(path);
    // И наоборот: открытая роботу страница обязана существовать в приложении
    for (const path of APP_ENTRY_PATHS) expect(APP_ROOTS).toContain(path.slice(1));
  });

  it("домены не разведены (SITE_URL нет): сайт и кабинет на одном адресе, целиком закрывать нельзя", async () => {
    delete process.env.SITE_URL;
    onHost("localhost:3000");
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.allow).toBe("/");
  });
});

describe("манифест отвечает с того адреса, где открыта страница", () => {
  it("сайт: свой манифест без режима приложения, start_url в пределах сайта", async () => {
    onHost("example.ru");
    const m = await manifest();
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("browser");
    expect(m.name).toBe(SITE_NAME);
    expect((m.icons ?? []).length).toBeGreaterThan(0);
  });

  it("приложение: прежний манифест кабинета (standalone, старт с /dashboard)", async () => {
    onHost("my.example.ru");
    const m = await manifest();
    expect(m.start_url).toBe("/dashboard");
    expect(m.display).toBe("standalone");
    expect(m.description).toBe("Кабинет клиента и рабочее место рекрутера");
  });
});

describe("карточки соцсетей: файлы есть, 1200x630, по одной на страницу", () => {
  const dir = join(ROOT, "public", "og");

  it.each(SITE_PAGE_KEYS)("%s: файл карточки существует и это PNG %s", (key) => {
    const card = ogCard(key);
    expect(card.path).toMatch(new RegExp(`^/og/${key}-[0-9a-f]{8}\\.png$`));
    const file = join(ROOT, card.file);
    expect(existsSync(file), `нет ${card.file}: npm run og:cards (текст карточки менялся)`).toBe(true);

    const bytes = readFileSync(file);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(OG_SIZE.width);
    expect(bytes.readUInt32BE(20)).toBe(OG_SIZE.height);
    // Соцсети отбрасывают слишком тяжёлые картинки
    expect(statSync(file).size).toBeLessThan(500_000);
  });

  it("лишних файлов в public/og нет: старые карточки удаляет скрипт", () => {
    const expected = new Set(SITE_PAGE_KEYS.map((k) => ogCard(k).file.split("/").pop()));
    expect(readdirSync(dir).filter((f) => !expected.has(f))).toEqual([]);
  });

  it("имя файла зависит от текста карточки: правка слов меняет адрес, и соцсети не держат старую картинку", () => {
    const a = ogCard("home").path;
    const original = SITE_PAGES.home.og.title;
    SITE_PAGES.home.og.title = `${original}!`;
    try {
      expect(ogCard("home").path).not.toBe(a);
    } finally {
      SITE_PAGES.home.og.title = original;
    }
  });

  it("картинки — статика в public: прокси их не трогает (расширение png в исключениях matcher)", () => {
    expect(read("proxy.ts")).toMatch(/\.\*\\\\\.\(\?:svg\|png\|/);
  });
});

describe("микроразметка: валидный JSON-LD, данные из тех же источников, что и страница", () => {
  const ALLOWED = new Set(["Organization", "WebSite", "Service", "FAQPage", "BreadcrumbList"]);

  function graph(key: SitePageKey, base = "https://example.ru") {
    return jsonLdFor(key, base);
  }

  it("у каждой индексируемой страницы разметка есть, у политики нет", () => {
    for (const key of SITE_PAGE_KEYS) {
      expect(graph(key).length > 0, key).toBe(SITE_PAGES[key].indexable);
    }
  });

  it("сериализуется в разбираемый JSON без «<»: `</script>` не оборвёт тег", () => {
    for (const key of SITE_PAGE_KEYS) {
      const text = jsonLdSafe({ "@context": "https://schema.org", "@graph": graph(key) });
      expect(text).not.toContain("<");
      const parsed = JSON.parse(text);
      expect(parsed["@context"]).toBe("https://schema.org");
      for (const node of parsed["@graph"]) expect(ALLOWED.has(node["@type"]), node["@type"]).toBe(true);
    }
  });

  it("Organization и WebSite — только на главной; у них адреса сайта и один и тот же @id", () => {
    const home = graph("home");
    const org = home.find((n) => n["@type"] === "Organization");
    const site = home.find((n) => n["@type"] === "WebSite");
    expect(org).toMatchObject({ "@id": "https://example.ru/#organization", url: "https://example.ru", name: SITE_NAME });
    expect(site).toMatchObject({ "@id": "https://example.ru/#website", publisher: { "@id": "https://example.ru/#organization" } });
    for (const key of SITE_PAGE_KEYS.filter((k) => k !== "home")) {
      expect(graph(key).some((n) => n["@type"] === "Organization" || n["@type"] === "WebSite"), key).toBe(false);
    }
  });

  it("телефон и почта в Organization — те же, что в шапке и подвале (lib/contacts.ts)", () => {
    const org = graph("home").find((n) => n["@type"] === "Organization") as {
      contactPoint: { telephone: string; email: string };
    };
    expect(org.contactPoint.telephone).toBe("+79375711877");
    expect(org.contactPoint.email).toBe("info@fattakhovhr.ru");
  });

  it("хлебные крошки на внутренних страницах: Главная → страница, позиции подряд, адреса абсолютные и совпадают с canonical", () => {
    for (const key of ["tariffs", "cases", "audit"] as const) {
      const crumbs = graph(key).find((n) => n["@type"] === "BreadcrumbList") as {
        itemListElement: { "@type": string; position: number; name: string; item: string }[];
      };
      expect(crumbs, key).toBeDefined();
      expect(crumbs.itemListElement.map((i) => i.position)).toEqual([1, 2]);
      expect(crumbs.itemListElement.map((i) => i["@type"])).toEqual(["ListItem", "ListItem"]);
      expect(crumbs.itemListElement[0]).toMatchObject({ name: "Главная", item: "https://example.ru" });
      expect(crumbs.itemListElement[1]).toMatchObject({ name: SITE_PAGES[key].crumb, item: `https://example.ru${SITE_PAGES[key].path}` });
      for (const i of crumbs.itemListElement) expect(i.item).toMatch(/^https:\/\//);
    }
    // У главной крошек нет: она сама корень
    expect(graph("home").some((n) => n["@type"] === "BreadcrumbList")).toBe(false);
  });

  it("Service с тарифами — на главной и на /tariffs, цены ровно из тарифной лестницы", () => {
    for (const key of ["home", "tariffs"] as const) {
      const service = graph(key).find((n) => n["@type"] === "Service") as {
        provider: { name: string; url: string };
        offers: { name: string; price: number; priceCurrency: string; priceSpecification: { price: number; unitCode: string } }[];
      };
      expect(service, key).toBeDefined();
      expect(service.provider).toMatchObject({ name: SITE_NAME, url: "https://example.ru" });
      expect(service.offers.map((o) => o.price)).toEqual(TARIFFS.map((t) => t.price));
      // Название предложения — как на карточке тарифа: «Старт: одна вакансия в работе», а не «Старт: 1 в работе»
      expect(service.offers.map((o) => o.name)).toEqual(
        TARIFFS.map((t) => `${t.name}: ${t.title.toLowerCase()} в работе`),
      );
      for (const offer of service.offers) {
        expect(offer.priceCurrency).toBe("RUB");
        expect(offer.priceSpecification).toMatchObject({ price: offer.price, unitCode: "MON" });
      }
    }
    expect(graph("cases").some((n) => n["@type"] === "Service")).toBe(false);
  });

  it("FAQPage главной — те же вопросы и ответы, что у видимого списка (один источник)", () => {
    const faq = graph("home").find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(FAQ_ITEMS.map((f) => [f.q, f.a]));
    expect(faq.mainEntity).toHaveLength(4);
  });

  /**
   * Все числа дерева: и числовые значения, и цифры внутри строк. Раньше считались только значения
   * типа number — «закрываем за 14 дней» в описании организации тест не замечал (проверка PR 13.10.2026).
   * Строки, где цифры — часть технического значения (адрес, @id, телефон, почта, язык), не читаются как текст.
   */
  const TECHNICAL_KEYS = new Set(["@context", "@type", "@id", "url", "item", "telephone", "email", "inLanguage", "priceCurrency", "unitCode", "addressCountry", "availableLanguage"]);
  const digitTokens = (value: unknown, key = ""): { path: string; token: string }[] => {
    if (typeof value === "number") return [{ path: key, token: String(value) }];
    if (typeof value === "string") {
      if (TECHNICAL_KEYS.has(key.split(".").pop() ?? "")) return [];
      return [...value.matchAll(/\d+(?:[ \u00a0\u202f]\d{3})*/g)].map((m) => ({ path: key, token: m[0].replace(/\D/g, "") }));
    }
    if (Array.isArray(value)) return value.flatMap((v, i) => digitTokens(v, `${key}[${i}]`));
    if (value && typeof value === "object") {
      return Object.entries(value).flatMap(([k, v]) => (k === "position" ? [] : digitTokens(v, key ? `${key}.${k}` : k)));
    }
    return [];
  };

  it("в разметке нет чисел, кроме цен тарифной лестницы и числа слотов: неподтверждённых нет — ни значениями, ни в тексте", () => {
    // Подтверждено заказчиком: лестница 1–5 слотов и её цены (AGENTS.md, «Тарифы и числа на сайте»)
    const allowed = new Set<string>([...TARIFFS.map((t) => String(t.price)), ...TARIFFS.map((t) => String(t.slots))]);
    const found = ["home", "tariffs", "cases", "audit"].flatMap((k) => digitTokens(graph(k as SitePageKey), k));
    // Проверка видит хотя бы цены лестницы: иначе обход ничего не нашёл бы и «пустое» было бы зелёным
    expect(found.filter((f) => TARIFFS.some((t) => String(t.price) === f.token)).length).toBeGreaterThanOrEqual(TARIFFS.length);
    expect(found.filter((f) => !allowed.has(f.token))).toEqual([]);
  });

  it("сторож чисел в тексте разметки не пропускает выдуманное: «за 14 дней» и «30+ источников» красные", () => {
    const allowed = new Set<string>([...TARIFFS.map((t) => String(t.price)), ...TARIFFS.map((t) => String(t.slots))]);
    const bad = (text: string) =>
      digitTokens({ "@type": "Organization", description: text }).filter((f) => !allowed.has(f.token));
    expect(bad("Закрываем вакансии за 14 дней")).toHaveLength(1);
    expect(bad("Более 30 источников поиска")).toHaveLength(1);
    expect(bad("Берём 2-5 вакансий одновременно")).toEqual([]);
    expect(bad(`От ${TARIFFS[0].price.toLocaleString("ru-RU")} ₽ в месяц`)).toEqual([]);
    // Адрес, телефон и почта — не текст
    expect(digitTokens({ telephone: "+79375711877", url: "https://x1.ru/2026" })).toEqual([]);
  });
});
