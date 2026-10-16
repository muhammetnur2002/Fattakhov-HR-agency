import http, { type IncomingHttpHeaders } from "node:http";

import { expect, test } from "@playwright/test";

import { FAQ_ITEMS } from "../../lib/marketing/faq";
import { NOT_FOUND_DESCRIPTION, SITE_NAME, SITE_PAGES, SITE_PAGE_KEYS, fullTitle, ogCard, type SitePageKey } from "../../lib/marketing/seo";

/**
 * Сайт для поисковиков на живом сервере (проверка сайта 11.10.2026): настоящий 404, карточки соцсетей,
 * разметка, robots.txt, карта сайта, манифест, заголовки X-Robots-Tag, перенаправление www.
 *
 * Хост у каждого запроса свой (сайт, кабинет, www), поэтому браузер не годится: ходим напрямую,
 * как робот, и подставляем заголовок Host. Сервер должен быть запущен с разведёнными адресами,
 * ровно как на проде, а проверка получает те же адреса из окружения:
 *
 *   APP_URL=https://my.fattakhovhr.ru SITE_URL=https://fattakhovhr.ru npm run dev -- -p 3200
 *   E2E_SITE_URL=https://fattakhovhr.ru E2E_APP_URL=https://my.fattakhovhr.ru  (и baseURL на :3200)
 *
 * Без этих двух переменных проверка пропускается: на одном адресе (обычная разработка) сайт и кабинет
 * различить нечем. Юнит-часть тех же правил — `tests/site-seo.test.ts`, `tests/site-routing.test.ts`.
 *
 * Прогонять нужно дважды: без `AUTH_URL` и с `AUTH_URL`, равным адресу кабинета (так задан штатный
 * `.env.example`). Обёртка auth() из next-auth подменяет им адрес запроса, и страница 404 сайта при этом
 * однажды отвечала 500 (проверка PR 13.10.2026). Подходят и `npm run dev`, и боевая сборка (`next build` +
 * `next start`); заголовок `Cache-Control: no-store` строго проверяет `tests/site-proxy.test.ts`, а здесь —
 * только что ответ не запоминается публично: dev-сервер подменяет его своим `no-cache`.
 */
const SITE_URL = process.env.E2E_SITE_URL?.replace(/\/+$/, "");
const APP_URL = process.env.E2E_APP_URL?.replace(/\/+$/, "");

test.skip(!SITE_URL || !APP_URL, "нужны E2E_SITE_URL и E2E_APP_URL и сервер с теми же SITE_URL и APP_URL");
test.use({ storageState: { cookies: [], origins: [] } });

type Reply = { status: number; headers: IncomingHttpHeaders; body: string; raw: Buffer };

/** Запрос как у робота: без перехода по редиректам, с нужным Host. */
function get(baseURL: string, host: string, path: string): Promise<Reply> {
  const { hostname, port } = new URL(baseURL);
  return new Promise((resolve, reject) => {
    http
      .get({ hostname, port, path, headers: { host }, timeout: 120_000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: raw.toString("utf8"), raw });
        });
      })
      .on("error", reject);
  });
}

const hostOf = (url: string) => new URL(url).host;
const siteHost = () => hostOf(SITE_URL!);
const appHost = () => hostOf(APP_URL!);
const wwwHost = () => `www.${siteHost()}`;

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Все <meta> страницы: имя или property → список значений (robots у Next бывает дважды). */
function metas(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of html.matchAll(/<meta\s+([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const key = attrs.name ?? attrs.property;
    if (key && attrs.content !== undefined) out.set(key, [...(out.get(key) ?? []), attrs.content]);
  }
  return out;
}

const titleOf = (html: string) => decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
const canonicalOf = (html: string) => decode(html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "");
const levelsOf = (html: string) => [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
const jsonLdOf = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test.describe("сайт: неизвестный адрес", () => {
  for (const path of ["/nonexistent", "/wp-admin/setup.php", "/tariffs/extra", "/Tariffs", "/site-not-found"]) {
    test(`${path}: настоящий 404 в оформлении сайта, без редиректа на вход`, async ({ baseURL }) => {
      const r = await get(baseURL!, siteHost(), path);
      expect(r.status).toBe(404);
      expect(r.headers.location, "переадресации нет: ни в приложение, ни на вход").toBeUndefined();
      expect(r.headers["content-type"]).toContain("text/html");
      // Не запоминается чужим кешем: статическая страница по умолчанию отдаётся с годовым s-maxage.
      // Боевая сборка отвечает no-store, dev-сервер — своим no-cache: оба публично не кешируются
      const cacheControl = r.headers["cache-control"] ?? "";
      expect(cacheControl).toMatch(/no-store|no-cache/);
      expect(cacheControl).not.toMatch(/s-maxage|public|max-age=[1-9]/);
      // Переписывание — внутри сайта (относительный путь), а не на чужой адрес: иначе Next проксирует наружу и отвечает 500
      const rewrite = r.headers["x-middleware-rewrite"];
      if (rewrite) expect(rewrite).toBe("/site-not-found");

      expect(titleOf(r.body)).toBe(`Страница не найдена · ${SITE_NAME}`);
      // Своё описание, а не унаследованное от главной
      expect(metas(r.body).get("description")).toEqual([NOT_FOUND_DESCRIPTION]);
      expect(levelsOf(r.body).filter((l) => l === 1)).toHaveLength(1);
      expect(r.body).toContain("Страница не найдена");
      // Каркас сайта: шапка, единственный main, подвал и ссылки на страницы сайта
      expect(r.body.match(/<main[\s>]/g)).toHaveLength(1);
      expect(r.body).toContain("<header");
      expect(r.body).toContain("<footer");
      for (const href of ["/", "/tariffs", "/audit"]) expect(r.body).toContain(`href="${href}"`);
      // Закрыта от индекса: адрес из чужой ссылки не должен попасть в выдачу
      expect((metas(r.body).get("robots") ?? []).join(" ")).toContain("noindex");
    });
  }

  test("адрес приложения, набранный на сайте, по-прежнему ведёт в приложение", async ({ baseURL }) => {
    for (const path of ["/login", "/dashboard", "/a/vacancies", "/register?from=site"]) {
      const r = await get(baseURL!, siteHost(), path);
      expect(r.status, path).toBe(307);
      expect(r.headers.location, path).toBe(`${APP_URL}${path}`);
    }
  });
});

test.describe("приложение: закрыто от индекса и прежнее поведение", () => {
  test("страница входа: X-Robots-Tag и meta robots — noindex, nofollow", async ({ baseURL }) => {
    const r = await get(baseURL!, appHost(), "/login");
    expect(r.status).toBe(200);
    expect(r.headers["x-robots-tag"]).toBe("noindex, nofollow");
    const robots = (metas(r.body).get("robots") ?? []).join(" ");
    expect(robots).toContain("noindex");
    expect(robots).toContain("nofollow");
  });

  test("защищённая и неизвестная страница без входа — на вход, и тоже с X-Robots-Tag", async ({ baseURL }) => {
    for (const [path, callback] of [
      ["/dashboard", "%2Fdashboard"],
      ["/a/vacancies", "%2Fa%2Fvacancies"],
      ["/nonexistent", "%2Fnonexistent"],
    ] as const) {
      const r = await get(baseURL!, appHost(), path);
      expect(r.status, path).toBe(307);
      // Адрес входа — относительный, а при заданном AUTH_URL — абсолютный с адресом кабинета (так было и раньше):
      // в обоих случаях это вход в приложение, а не на сайт
      expect(new URL(r.headers.location!, APP_URL).href, path).toBe(`${APP_URL}/login?callbackUrl=${callback}`);
      expect(r.headers["x-robots-tag"], path).toBe("noindex, nofollow");
    }
  });

  test("страница «не найдено» сайта, открытая прямо на адресе приложения, — тоже 404, а не 200", async ({ baseURL }) => {
    const r = await get(baseURL!, appHost(), "/site-not-found");
    expect(r.status).toBe(404);
    expect(r.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("страница сайта, набранная на адресе приложения без входа, уходит на сайт с тем же путём", async ({ baseURL }) => {
    const r = await get(baseURL!, appHost(), "/privacy");
    expect(r.status).toBe(307);
    expect(r.headers.location).toBe(`${SITE_URL}/privacy`);
  });

  test("robots.txt приложения: закрыто целиком, кроме входа и регистрации, карта на сайте", async ({ baseURL }) => {
    const r = await get(baseURL!, appHost(), "/robots.txt");
    expect(r.status).toBe(200);
    expect(r.body).toMatch(/^Disallow: \/$/m);
    // Страницы, на которые ссылается сайт, роботу читать можно: иначе он не увидит их noindex
    expect(r.body).toMatch(/^Allow: \/login$/m);
    expect(r.body).toMatch(/^Allow: \/register$/m);
    expect(r.body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});

test.describe("www: постоянный редирект одним прыжком", () => {
  for (const [path, target] of [
    ["/", () => `${SITE_URL}/`],
    ["/tariffs?utm_source=x", () => `${SITE_URL}/tariffs?utm_source=x`],
    ["/robots.txt", () => `${SITE_URL}/robots.txt`],
    ["/nonexistent", () => `${SITE_URL}/nonexistent`],
    // Адрес приложения на www ведёт сразу в приложение, а не через сайт
    ["/login", () => `${APP_URL}/login`],
  ] as const) {
    test(`www${path}: 308 → ${path === "/login" ? "приложение" : "сайт"}`, async ({ baseURL }) => {
      const r = await get(baseURL!, wwwHost(), path);
      expect(r.status).toBe(308);
      expect(r.headers.location).toBe(target());
    });
  }
});

test.describe("служебные файлы сайта", () => {
  test("robots.txt: без устаревшей Host, карта абсолютным адресом, закрыты разделы приложения", async ({ baseURL }) => {
    const r = await get(baseURL!, siteHost(), "/robots.txt");
    expect(r.status).toBe(200);
    expect(r.body).not.toMatch(/^host:/im);
    expect(r.body).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(r.body).toMatch(/^Allow: \/$/m);
    for (const path of ["/a/", "/api/", "/login", "/register", "/schedule", "/consent", "/confirm-email", "/dashboard", "/settings"]) {
      expect(r.body, path).toContain(`Disallow: ${path}`);
    }
    // Страницы сайта не закрыты
    for (const path of ["/audit", "/tariffs", "/cases", "/privacy"]) {
      const closed = [...r.body.matchAll(/^Disallow: (\S+)$/gm)].some((m) => path.startsWith(m[1]));
      expect(closed, `${path} закрыт от робота`).toBe(false);
    }
  });

  test("sitemap.xml: индексируемые страницы с настоящей датой, без политики, changefreq и priority", async ({ baseURL }) => {
    const r = await get(baseURL!, siteHost(), "/sitemap.xml");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("xml");
    const entries = [...r.body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
      loc: m[1].match(/<loc>([^<]*)<\/loc>/)?.[1],
      lastmod: m[1].match(/<lastmod>([^<]*)<\/lastmod>/)?.[1],
    }));
    const expected = SITE_PAGE_KEYS.filter((k) => SITE_PAGES[k].indexable).map((k) => ({
      loc: SITE_PAGES[k].path === "/" ? SITE_URL : `${SITE_URL}${SITE_PAGES[k].path}`,
      lastmod: SITE_PAGES[k].updated,
    }));
    expect(entries).toEqual(expected);
    expect(r.body).not.toContain("/privacy");
    expect(r.body).not.toContain("changefreq");
    expect(r.body).not.toContain("<priority>");
    // Не одна дата у всех: так выглядела бы дата сборки образа
    expect(new Set(entries.map((e) => e.lastmod)).size).toBeGreaterThan(1);
  });

  test("манифест отвечает с того же адреса, где открыта страница, без перенаправления", async ({ baseURL }) => {
    const onSite = await get(baseURL!, siteHost(), "/manifest.webmanifest");
    expect(onSite.status).toBe(200);
    expect(onSite.headers.location).toBeUndefined();
    expect(onSite.headers["content-type"]).toContain("manifest+json");
    const site = JSON.parse(onSite.body);
    expect(site.start_url).toBe("/");
    expect(site.display).toBe("browser");
    expect(site.icons.length).toBeGreaterThan(0);

    const onApp = await get(baseURL!, appHost(), "/manifest.webmanifest");
    expect(onApp.status).toBe(200);
    expect(JSON.parse(onApp.body).display).toBe("standalone");
  });
});

for (const key of SITE_PAGE_KEYS) {
  const page = SITE_PAGES[key];

  test.describe(`страница ${page.path}`, () => {
    test("заголовок 30–60, описание 70–160, свой canonical, карточка соцсетей целиком", async ({ baseURL }) => {
      const r = await get(baseURL!, siteHost(), page.path);
      expect(r.status).toBe(200);
      const m = metas(r.body);
      const first = (name: string) => m.get(name)?.[0];

      const title = titleOf(r.body);
      expect(title).toBe(fullTitle(key));
      expect(title.length).toBeGreaterThanOrEqual(30);
      expect(title.length).toBeLessThanOrEqual(60);
      const description = first("description") ?? "";
      expect(description).toBe(page.description);
      expect(description.length).toBeGreaterThanOrEqual(70);
      expect(description.length).toBeLessThanOrEqual(160);

      expect(canonicalOf(r.body)).toBe(page.path === "/" ? SITE_URL : `${SITE_URL}${page.path}`);

      const card = ogCard(key);
      expect(first("og:title")).toBe(page.og.title);
      expect(first("og:description")).toBe(page.og.description);
      expect(first("og:site_name")).toBe(SITE_NAME);
      expect(first("og:type")).toBe("website");
      expect(first("og:url")).toBe(page.path === "/" ? SITE_URL : `${SITE_URL}${page.path}`);
      expect(first("og:image")).toBe(`${SITE_URL}${card.path}`);
      expect(first("og:image:width")).toBe("1200");
      expect(first("og:image:height")).toBe("630");
      expect(first("twitter:card")).toBe("summary_large_image");
      expect(first("twitter:title")).toBe(page.og.title);
      expect(first("twitter:image")).toBe(`${SITE_URL}${card.path}`);

      // Индекс: открыта у всех страниц, кроме политики
      const robots = (m.get("robots") ?? []).join(" ");
      expect(robots.includes("noindex"), robots).toBe(!page.indexable);
    });

    test("картинка карточки отдаётся: PNG 1200x630, не тяжелее 500 КБ, без редиректа", async ({ baseURL }) => {
      const card = ogCard(key);
      const r = await get(baseURL!, siteHost(), card.path);
      expect(r.status).toBe(200);
      expect(r.headers["content-type"]).toBe("image/png");
      expect(r.raw.readUInt32BE(16)).toBe(1200);
      expect(r.raw.readUInt32BE(20)).toBe(630);
      expect(r.raw.length).toBeLessThan(500_000);
    });

    test("заголовки без пропуска уровня и ровно один h1", async ({ baseURL }) => {
      const r = await get(baseURL!, siteHost(), page.path);
      const levels = levelsOf(r.body);
      expect(levels.filter((l) => l === 1), "h1").toHaveLength(1);
      expect(levels[0]).toBe(1);
      levels.forEach((level, i) => {
        if (i > 0) expect(level - levels[i - 1], `после h${levels[i - 1]} сразу h${level} (позиция ${i})`).toBeLessThanOrEqual(1);
      });
    });
  });
}

test("карточки соцсетей разных страниц не повторяют друг друга", async ({ baseURL }) => {
  const seen = new Map<string, SitePageKey>();
  for (const key of SITE_PAGE_KEYS) {
    const r = await get(baseURL!, siteHost(), SITE_PAGES[key].path);
    const m = metas(r.body);
    for (const name of ["og:title", "og:image"]) {
      const value = m.get(name)?.[0] ?? "";
      const id = `${name}=${value}`;
      expect(seen.has(id), `${key} повторяет ${seen.get(id)}: ${id}`).toBe(false);
      seen.set(id, key);
    }
  }
});

test.describe("микроразметка", () => {
  test("главная: Organization, WebSite, Service, FAQPage; вопросы те же, что видит человек", async ({ baseURL }) => {
    const r = await get(baseURL!, siteHost(), "/");
    const blocks = jsonLdOf(r.body);
    expect(blocks).toHaveLength(1);
    const graph = blocks[0]["@graph"] as { "@type": string }[];
    expect(graph.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "Service", "FAQPage"]);

    const faq = graph.find((n) => n["@type"] === "FAQPage") as unknown as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(FAQ_ITEMS.map((f) => [f.q, f.a]));
    // И видимая часть страницы содержит те же слова: в разметке нет ничего, чего человек не прочтёт
    const visible = decode(r.body.replace(/<script[\s\S]*?<\/script>/g, ""));
    for (const q of faq.mainEntity) {
      expect(visible, q.name).toContain(q.name);
      expect(visible, q.name).toContain(q.acceptedAnswer.text);
    }
  });

  for (const path of ["/tariffs", "/cases", "/audit"]) {
    test(`${path}: хлебные крошки «Главная → страница» с абсолютными адресами`, async ({ baseURL }) => {
      const r = await get(baseURL!, siteHost(), path);
      const graph = jsonLdOf(r.body).flatMap((b) => b["@graph"]) as { "@type": string; itemListElement?: { position: number; item: string }[] }[];
      const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList");
      expect(crumbs).toBeDefined();
      expect(crumbs!.itemListElement!.map((i) => i.position)).toEqual([1, 2]);
      expect(crumbs!.itemListElement!.map((i) => i.item)).toEqual([SITE_URL, `${SITE_URL}${path}`]);
    });
  }

  test("политика закрыта от индекса и разметки не несёт", async ({ baseURL }) => {
    const r = await get(baseURL!, siteHost(), "/privacy");
    expect(jsonLdOf(r.body)).toHaveLength(0);
  });
});
