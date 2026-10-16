/**
 * Настоящий `proxy.ts` на настоящих запросах: ответ сайта на неизвестный путь не должен зависеть
 * от `AUTH_URL` (проверка PR 13.10.2026).
 *
 * Обёртка `auth()` из next-auth подменяет адрес запроса на `AUTH_URL`, если он задан (reqWithEnvURL),
 * и `req.nextUrl` внутри неё указывает на кабинет, даже когда пришли на сайт. Переписывание страницы
 * 404 на такой адрес Next считает чужим и пробует проксировать наружу: ответ 500. Юнит-тесты чистой
 * функции `routeByHost` этого не видят — она адрес запроса не читает; нужен сам прокси. AUTH_URL штатный:
 * он первым стоит в `.env.example`, а проверка боевого окружения принимает «APP_URL или AUTH_URL».
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APP_ENTRY_PATHS } from "@/lib/site-routing";
import proxy from "@/proxy";

const SITE = "example.ru";
const WWW = "www.example.ru";
const APP = "my.example.ru";

const ENV_KEYS = ["APP_URL", "SITE_URL", "AUTH_URL", "NEXTAUTH_URL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

/** Запрос, каким его видит Next на сервере: адрес из заголовка Host, как у реального входящего. */
function request(host: string, path: string, init: { cookie?: string } = {}) {
  const headers: Record<string, string> = { host };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`https://${host}${path}`, { headers });
}

async function run(host: string, path: string) {
  // Второй аргумент — событие запроса: прокси его не читает
  return (await proxy(request(host, path), {} as never)) as Response;
}

/** Куда Next переписал бы запрос: пусто — на тот же адрес (внутренне), иначе наружу. */
function rewriteTarget(res: Response): { origin: string; path: string } | null {
  const header = res.headers.get("x-middleware-rewrite");
  if (!header) return null;
  const url = new URL(header);
  return { origin: url.origin, path: url.pathname };
}

beforeEach(() => {
  process.env.APP_URL = `https://${APP}`;
  process.env.SITE_URL = `https://${SITE}`;
  delete process.env.AUTH_URL;
  delete process.env.NEXTAUTH_URL;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Значения AUTH_URL, какие бывают в деле: адрес кабинета, адрес сайта, чужой, с путём. */
const AUTH_URLS: Array<string | undefined> = [undefined, `https://${APP}`, `https://${SITE}`, "http://localhost:3000", "https://other.example.org/base"];

describe.each(AUTH_URLS)("AUTH_URL = %s", (authUrl) => {
  beforeEach(() => {
    if (authUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = authUrl;
  });

  it.each(["/nonexistent", "/wp-admin/setup.php", "/tariffs/extra", "/Tariffs", "/site-not-found"])(
    "сайт, %s: страница «не найдено» переписывается на тот же адрес, а не наружу",
    async (path) => {
      const res = await run(SITE, path);
      const target = rewriteTarget(res);
      expect(target, "переписывание есть").not.toBeNull();
      // Тот же адрес, что у входящего запроса: иначе Next проксирует запрос на другой origin (500)
      expect(target!.origin).toBe(`https://${SITE}`);
      expect(target!.path).toBe("/site-not-found");
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("location")).toBeNull();
      // Сайт — не приложение: заголовка закрытия от индекса нет
      expect(res.headers.get("x-robots-tag")).toBeNull();
    },
  );

  it("страница «не найдено», набранная на адресе приложения: тоже на том же адресе и с X-Robots-Tag", async () => {
    const res = await run(APP, "/site-not-found");
    const target = rewriteTarget(res);
    expect(target).not.toBeNull();
    expect(target!.origin).toBe(`https://${APP}`);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it.each(APP_ENTRY_PATHS)(
    "приложение, %s: открытая роботу страница отвечает с X-Robots-Tag: noindex, nofollow — иначе открывать её незачем",
    async (path) => {
      const res = await run(APP, path);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );

  it("www и адрес приложения на сайте — редиректы с абсолютным адресом назначения, как и были", async () => {
    const www = await run(WWW, "/tariffs");
    expect(www.status).toBe(308);
    expect(www.headers.get("location")).toBe(`https://${SITE}/tariffs`);

    const login = await run(SITE, "/login");
    expect(login.status).toBe(307);
    expect(login.headers.get("location")).toBe(`https://${APP}/login`);
  });

  it("страница сайта на адресе приложения без входа — на сайт; страница сайта на сайте — на месте", async () => {
    const away = await run(APP, "/tariffs");
    expect(away.status).toBe(307);
    expect(away.headers.get("location")).toBe(`https://${SITE}/tariffs`);
    expect(away.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const here = await run(SITE, "/tariffs");
    expect(here.headers.get("location")).toBeNull();
    expect(rewriteTarget(here)).toBeNull();
  });
});
