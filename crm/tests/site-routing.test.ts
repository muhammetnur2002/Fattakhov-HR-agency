/**
 * Что отдаёт каждый из адресов продукта (проверка сайта 11.10.2026): неизвестный адрес сайта —
 * честный 404, а не два редиректа и страница входа с кодом 200; www — постоянный редирект на
 * сайт; приложение остаётся закрытым. Решение принимает чистая функция `routeByHost`
 * (lib/site-routing.ts), прокси только исполняет его. Заголовки живого сервера —
 * `tests/e2e/site-seo.spec.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  APP_ROOTS,
  SHARED_PATHS,
  SITE_NOT_FOUND_PATH,
  SITE_PATHS,
  isApplicationHost,
  isAppPath,
  isSiteHost,
  routeBeforeSession,
  routeByHost,
} from "@/lib/site-routing";

const ROOT = process.cwd();
const ENV_KEYS = ["APP_URL", "SITE_URL", "AUTH_URL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const SITE = "example.ru";
const WWW = "www.example.ru";
const APP = "my.example.ru";

beforeEach(() => {
  process.env.APP_URL = `https://${APP}`;
  process.env.SITE_URL = `https://${SITE}`;
  delete process.env.AUTH_URL;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const route = (host: string, pathname: string, signedIn = false, search = "") =>
  routeByHost({ host, pathname, search, signedIn });

describe("сайт: неизвестный адрес — настоящий 404", () => {
  it.each(["/nonexistent", "/wp-admin", "/index.php", "/tariffs/extra", "/Tariffs", "/.env", "/blog/post-1", "/sitemap"])(
    "%s: страница «не найдено», а не редирект на вход",
    (path) => {
      expect(route(SITE, path)).toEqual({ action: "not-found" });
      // Вошёл человек или нет — на сайте это ничего не меняет
      expect(route(SITE, path, true)).toEqual({ action: "not-found" });
    },
  );

  it.each(["/", "/audit", "/tariffs", "/cases", "/privacy", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"])(
    "%s: страницы и служебные файлы сайта отвечают на месте",
    (path) => {
      expect(route(SITE, path)).toEqual({ action: "pass" });
    },
  );

  it.each(["/login", "/register", "/invite/abc", "/consent/abc", "/dashboard", "/a/vacancies", "/api/health", "/vacancies/new"])(
    "%s: адрес приложения, набранный на сайте, ведёт в приложение (как и раньше)",
    (path) => {
      expect(route(SITE, path, false, "?x=1")).toEqual({
        action: "redirect",
        location: `https://${APP}${path}?x=1`,
        status: 307,
      });
    },
  );

  it("«/a» — корень кабинета агентства, но не «/audit» и не «/api»", () => {
    expect(isAppPath("/a")).toBe(true);
    expect(isAppPath("/a/vacancies")).toBe(true);
    expect(isAppPath("/audit")).toBe(false);
    expect(isAppPath("/abc")).toBe(false);
  });
});

describe("www — псевдоним сайта: насовсем и одним прыжком", () => {
  it.each(["/", "/tariffs", "/robots.txt", "/sitemap.xml", "/nonexistent"])("%s → сайт, 308", (path) => {
    expect(route(WWW, path, false, "?utm=1")).toEqual({
      action: "redirect",
      location: `https://${SITE}${path}?utm=1`,
      status: 308,
    });
  });

  it("адрес приложения на www сразу ведёт в приложение, а не через сайт (один прыжок)", () => {
    expect(route(WWW, "/login")).toEqual({ action: "redirect", location: `https://${APP}/login`, status: 308 });
  });

  it("robots.txt на www не отвечает «закрыто целиком»: он перенаправляет на сайт", () => {
    // Раньше www считался адресом приложения, и робот читал «Disallow: /» (проверка 11.10.2026)
    expect(isApplicationHost(WWW)).toBe(false);
    expect(route(WWW, "/robots.txt").action).toBe("redirect");
  });
});

describe("приложение: прежнее поведение", () => {
  it.each(["/", "/audit", "/tariffs", "/cases", "/privacy", "/sitemap.xml"])(
    "%s без входа — на сайт, путь сохраняется (/privacy открывает политику, а не главную)",
    (path) => {
      expect(route(APP, path, false, "?a=1")).toEqual({
        action: "redirect",
        location: `https://${SITE}${path}?a=1`,
        status: 307,
      });
    },
  );

  it("вошедшему страницы сайта открыты на месте: аудит смотрят, не выходя из кабинета", () => {
    for (const path of ["/", "/audit", "/tariffs", "/cases", "/privacy"]) {
      expect(route(APP, path, true)).toEqual({ action: "pass" });
    }
  });

  it("robots.txt и манифест отвечают на месте с обоих адресов", () => {
    // Список назван явно, а не взят из SHARED_PATHS: иначе убранный оттуда файл тихо выпал бы и из проверки
    expect([...SHARED_PATHS].sort()).toEqual(["/manifest.webmanifest", "/robots.txt"]);
    for (const path of ["/robots.txt", "/manifest.webmanifest"]) {
      expect(route(APP, path), `приложение ${path}`).toEqual({ action: "pass" });
      expect(route(SITE, path), `сайт ${path}`).toEqual({ action: "pass" });
      // Вошедшему — то же: манифест читает браузер при установке, сессия ему не важна
      expect(route(APP, path, true), `приложение, вошёл ${path}`).toEqual({ action: "pass" });
    }
  });

  it("неизвестный адрес приложения не 404 для прокси: без сессии его судьба — вход (решает applicationResponse)", () => {
    expect(route(APP, "/nonexistent")).toEqual({ action: "pass" });
    expect(route(APP, "/dashboard")).toEqual({ action: "pass" });
  });
});

describe("домены не разведены (SITE_URL нет): всегда «пропустить»", () => {
  it("разработка на одном адресе: сайт и кабинет рядом, ничего не перенаправляется", () => {
    delete process.env.SITE_URL;
    for (const path of ["/", "/nonexistent", "/login", "/tariffs", "/robots.txt"]) {
      expect(route("localhost:3000", path)).toEqual({ action: "pass" });
    }
    expect(isSiteHost("localhost:3000")).toBe(false);
    expect(isApplicationHost("localhost:3000")).toBe(false);
  });
});

describe("решение до сессии: то же, что полное, кроме одной ветки", () => {
  const HOSTS = [SITE, WWW, APP, "localhost:3000", null];
  const PATHS = [
    "/", "/audit", "/tariffs", "/cases", "/privacy", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest",
    "/nonexistent", "/Tariffs", "/tariffs/extra", SITE_NOT_FOUND_PATH,
    "/login", "/register", "/dashboard", "/a/vacancies", "/schedule/abc", "/api/health", "/students/new",
  ];

  it("различаться они вправе только там, где аноним на странице сайта по адресу приложения", () => {
    let compared = 0;
    for (const host of HOSTS) {
      for (const pathname of PATHS) {
        const input = { host, pathname, search: "?x=1" };
        const before = routeBeforeSession(input);
        const withSession = routeByHost({ ...input, signedIn: true });
        const anonymous = routeByHost({ ...input, signedIn: false });
        // «До сессии» — решение для вошедшего, и ничего больше
        expect(before, `${host} ${pathname}`).toEqual(withSession);
        // Без входа ответ тот же, если только до сессии не «пропустить», а дальше — редирект на сайт
        if (JSON.stringify(anonymous) !== JSON.stringify(before)) {
          expect(before, `${host} ${pathname}: до сессии`).toEqual({ action: "pass" });
          expect(anonymous.action, `${host} ${pathname}: без входа`).toBe("redirect");
          expect(isApplicationHost(host), `${host} ${pathname}: адрес приложения`).toBe(true);
          expect(SITE_PATHS.has(pathname) && !SHARED_PATHS.has(pathname), `${pathname} — страница сайта`).toBe(true);
        }
        compared += 1;
      }
    }
    expect(compared).toBe(HOSTS.length * PATHS.length);
  });

  it("не-найдено и редиректы сайта решаются до сессии: на них она не влияет", () => {
    expect(routeBeforeSession({ host: SITE, pathname: "/nonexistent", search: "" })).toEqual({ action: "not-found" });
    expect(routeBeforeSession({ host: APP, pathname: SITE_NOT_FOUND_PATH, search: "" })).toEqual({ action: "not-found" });
    expect(routeBeforeSession({ host: WWW, pathname: "/", search: "" }).action).toBe("redirect");
    expect(routeBeforeSession({ host: SITE, pathname: "/login", search: "" }).action).toBe("redirect");
    // А страница сайта на адресе приложения без входа — нет: это решает обёртка с сессией
    expect(routeBeforeSession({ host: APP, pathname: "/tariffs", search: "" })).toEqual({ action: "pass" });
  });
});

describe("список разделов приложения совпадает с папками app/", () => {
  const GROUPS = ["app/(client)", "app/(agency)", "app/(public)", "app/(onboarding)"];

  /** Папки верхнего уровня группы, внутри которых есть страница или обработчик маршрута. */
  const hasRoute = (dir: string): boolean =>
    (readdirSync(dir, { recursive: true, encoding: "utf8" }) as string[]).some(
      (f) => /(^|\/)(page\.tsx|route\.ts)$/.test(f),
    );

  const actualRoots = [
    ...GROUPS.flatMap((group) =>
      readdirSync(join(ROOT, group))
        .filter((name) => statSync(join(ROOT, group, name)).isDirectory() && !name.startsWith("(") && !name.startsWith("_"))
        .filter((name) => hasRoute(join(ROOT, group, name))),
    ),
    // app/api — обработчики без страниц
    "api",
  ];

  it("страницы найдены (иначе проверка ниже молча проверила бы пустоту)", () => {
    expect(actualRoots.length).toBeGreaterThan(20);
  });

  it("каждый раздел приложения есть в APP_ROOTS: новый раздел кабинета без записи там красит тест", () => {
    expect(actualRoots.filter((r) => !APP_ROOTS.includes(r))).toEqual([]);
  });

  it("в APP_ROOTS нет записей без папки: устаревший корень открывал бы чужой адрес редиректом", () => {
    expect(APP_ROOTS.filter((r) => !actualRoots.includes(r))).toEqual([]);
  });

  it("страниц сайта среди разделов приложения нет, и наоборот", () => {
    for (const path of SITE_PATHS) expect(isAppPath(path), path).toBe(false);
  });
});

describe("страница «не найдено» сайта: обычная страница, код 404 даёт прокси", () => {
  const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
  /** Код без комментариев: пояснения называют запрещённые вызовы по имени, и не они нарушают правило. */
  const code = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const FOLDER = `app/(marketing)${SITE_NOT_FOUND_PATH}`;

  it("страница лежит в группе сайта и рисует содержимое 404, а не вызывает notFound()", () => {
    // notFound() отдаёт код 404, но тело — пустой каркас, который наполняет браузер после загрузки скриптов
    expect(existsSync(join(ROOT, FOLDER, "page.tsx"))).toBe(true);
    const page = code(`${FOLDER}/page.tsx`);
    expect(page).toContain("<SiteNotFound />");
    expect(page).not.toMatch(/\bnotFound\s*\(/);
    expect(page).not.toMatch(/next\/navigation/);
    // Каркас сайта — от макета группы, своего main у страницы нет
    expect(page).not.toContain("<main");
    // Это не страница приложения и не страница сайта из списка: путь решает прокси
    expect(isAppPath(SITE_NOT_FOUND_PATH)).toBe(false);
    expect(SITE_PATHS.has(SITE_NOT_FOUND_PATH)).toBe(false);
  });

  it("заголовок и запрет индекса — в макете страницы: для ответа 404 Next читает метаданные только макетов", () => {
    const layout = read(`${FOLDER}/layout.tsx`);
    expect(layout).toContain("title: { absolute: NOT_FOUND_TITLE }");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
    // metadata в page.tsx молча отбрасывается — не должно быть второй копии, которая выглядит рабочей
    expect(code(`${FOLDER}/page.tsx`)).not.toMatch(/export const metadata|generateMetadata/);
  });

  it("корневой not-found не смотрит на адрес: динамический вызов там делает динамическими все страницы сайта", () => {
    const text = code("app/not-found.tsx");
    expect(text).not.toMatch(/next\/headers/);
    expect(text).not.toMatch(/\b(headers|cookies|connection)\s*\(/);
    expect(text).not.toContain("isSiteHost");
    // Прежнее лицо для приложения: свой main и «На главную»
    expect(text).toContain("<main");
  });

  it("proxy.ts исполняет решение: редирект с кодом из него, переписывание на страницу с кодом 404, заголовок для приложения", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain("NextResponse.redirect(new URL(route.location), route.status)");
    expect(proxy).toContain("NextResponse.rewrite(new URL(SITE_NOT_FOUND_PATH, req.nextUrl), { status: 404 })");
    // Статическая страница отдаётся с годовым s-maxage; «здесь ничего нет» чужому кешу на год не нужно
    expect(proxy).toContain('response.headers.set("Cache-Control", "no-store")');
    // Своих списков страниц сайта в прокси больше нет: они в lib/site-routing.ts
    expect(proxy).not.toMatch(/const SITE_PATHS/);
    expect(proxy).not.toMatch(/const ROBOTS_PATH/);
  });

  it("переписывание на страницу 404 строится ДО обёртки auth(): внутри неё адрес запроса подменяет AUTH_URL", () => {
    // Живая проверка с разными AUTH_URL — tests/site-proxy.test.ts; здесь порядок в самом файле, чтобы
    // «упростить» прокси обратно в одну функцию внутри auth() было видно сразу, а не по 500 на проде
    const proxy = code("proxy.ts");
    const rewriteAt = proxy.indexOf("NextResponse.rewrite(");
    const wrapperAt = proxy.indexOf("= auth(");
    expect(rewriteAt).toBeGreaterThan(-1);
    expect(wrapperAt).toBeGreaterThan(-1);
    expect(rewriteAt, "rewrite до auth()").toBeLessThan(wrapperAt);
    // Внутри обёртки (после неё) переписывать нечего
    expect(proxy.slice(wrapperAt)).not.toContain("NextResponse.rewrite(");
    expect(proxy).toContain("routeBeforeSession(");
  });

  it("сама страница, набранная в адресной строке, тоже 404 — на сайте и в приложении, вошёл человек или нет", () => {
    for (const host of [SITE, APP]) {
      for (const signedIn of [false, true]) {
        expect(route(host, SITE_NOT_FOUND_PATH, signedIn), `${host}, вошёл: ${signedIn}`).toEqual({ action: "not-found" });
      }
    }
  });
});
