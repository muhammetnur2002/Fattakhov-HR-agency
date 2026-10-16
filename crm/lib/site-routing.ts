/**
 * Что отдаёт каждый из трёх адресов продукта — решение прокси (`proxy.ts`).
 *
 *   fattakhovhr.ru      сайт: пять страниц, карта сайта, robots, манифест;
 *   my.fattakhovhr.ru   приложение: кабинеты, вход, ссылки по токенам;
 *   www.fattakhovhr.ru  псевдоним сайта: только перенаправляет.
 *
 * Модуль чистый, без Next и сессии: прокси работает в edge-рантайме, а решение
 * проверяется юнит-тестом (`tests/site-routing.test.ts`) по всем сочетаниям
 * «адрес × путь × вошёл ли человек». Пока `SITE_URL` не задан (разработка, один
 * адрес на всё), домены не разведены и решение всегда «пропустить».
 */
import { appOrigin, siteHost, siteOrigin } from "@/lib/urls";

/**
 * Страницы, которые отдаёт сайт, и служебные файлы к ним. Список, а не префикс:
 * каждая запись открывает путь наружу, и добавлять сюда нужно осознанно.
 */
export const SITE_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/audit",
  "/tariffs",
  "/cases",
  "/privacy",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
]);

/**
 * Файлы, которые отвечают на месте с любого из двух адресов.
 *
 * Перенаправлять их нельзя. Робот и браузер ждут их с того адреса, на котором
 * открыли страницу: редирект на другой домен вместо правил отдаёт им html
 * (robots.txt — «сайт открыт всем» по умолчанию), а манифест браузер читает как
 * CORS-запрос, и без заголовков на чужом домене он просто не загружается (проверка
 * сайта 11.10.2026: оба случая). У каждого адреса своё содержимое: `app/robots.ts` и
 * `app/manifest.ts` смотрят на хост запроса.
 */
export const SHARED_PATHS: ReadonlySet<string> = new Set(["/robots.txt", "/manifest.webmanifest"]);

/**
 * Первые сегменты путей приложения: всё, что живёт в `app/(public)`, `(onboarding)`,
 * `(client)`, `(agency)` и `app/api`. Сайт такие адреса уводит в приложение
 * (человек набрал fattakhovhr.ru/login — ему туда), а любой другой путь на сайте —
 * честный 404. Список проверяет `tests/site-routing.test.ts`: он сверяет его с папками
 * `app/`, и новый раздел кабинета без записи здесь красит тест.
 */
export const APP_ROOTS: readonly string[] = [
  // Агентство и служебное
  "a",
  "api",
  // Вход и ссылки по токенам
  "login",
  "register",
  "forgot",
  "reset",
  "confirm-email",
  "invite",
  "schedule",
  "consent",
  "disclosure",
  "security",
  "onboarding",
  // Кабинет клиента
  "dashboard",
  "vacancies",
  "candidates",
  "applications",
  "calendar",
  "analytics",
  "documents",
  "messages",
  "notifications",
  "search",
  "settings",
  "company",
  "students",
  "help",
];

/**
 * Страницы приложения, на которые ведут ссылки с самого сайта («Войти», «Обсудить найм»).
 *
 * Только их роботу и разрешено читать на адресе приложения (`app/robots.ts`): запрет обхода и
 * запрет индекса работают друг против друга. Робот, которому обход закрыт, не загружает страницу
 * и не видит ни `noindex` в ней, ни заголовка `X-Robots-Tag`; адрес, на который есть внешние ссылки,
 * при этом может остаться в выдаче без описания. Ссылки на вход и регистрацию стоят в шапке сайта, то
 * есть найдутся у любого робота — их он должен прочитать, чтобы увидеть запрет индекса. Остальное
 * приложение — кабинеты за входом и ссылки по токенам — снаружи не линкуется, и там обход закрыт целиком.
 * Тест `tests/site-seo.test.ts` ищет в разметке сайта ссылки на приложение: новая без записи здесь красит тест.
 */
export const APP_ENTRY_PATHS: readonly string[] = ["/login", "/register"];

/**
 * Страница «не найдено» сайта и путь, на который прокси переписывает неизвестный адрес.
 *
 * Это обычная страница группы `app/(marketing)/site-not-found` — в каркасе сайта, с шапкой
 * и подвалом, — а код 404 ей даёт сам прокси (`NextResponse.rewrite(…, { status: 404 })`).
 * Другие пути не годятся, оба проверены 12.10.2026 в dev и в боевой сборке:
 *
 * - страница с `notFound()` отдаёт 404, но тело — пустой каркас, который наполняет
 *   браузер после загрузки скриптов: поисковик без JS видит пустую страницу;
 * - хост в корневом `app/not-found.tsx` (одна страница на два адреса) вызывает `headers()`,
 *   а динамическое обращение там делает динамическими ВСЕ страницы: сайт перестаёт быть
 *   статикой, готовой при сборке образа.
 *
 * Метаданные (заголовок, `noindex`) страница берёт из своего макета, а не из `metadata` в
 * `page.tsx`: у ответа с кодом 404 Next читает метаданные только макетов. Тест
 * `tests/site-routing.test.ts` держит все три условия.
 */
export const SITE_NOT_FOUND_PATH = "/site-not-found";

const firstSegment = (pathname: string) => pathname.split("/")[1] ?? "";

export function isAppPath(pathname: string): boolean {
  return APP_ROOTS.includes(firstSegment(pathname));
}

export type HostRoute =
  | { action: "pass" }
  | { action: "redirect"; location: string; status: 307 | 308 }
  /** Показать страницу «не найдено» сайта с кодом 404 (`SITE_NOT_FOUND_PATH`) — без перехода на вход. */
  | { action: "not-found" };

const PASS: HostRoute = { action: "pass" };

/** `www` — псевдоним сайта; пока домены не разведены, его нет. */
function wwwHost(): string | null {
  const site = siteHost();
  return site === null ? null : `www.${site}`;
}

/** Запрос пришёл на адрес сайта. Пока домены не разведены, сайта как отдельного адреса нет. */
export function isSiteHost(host: string | null): boolean {
  const site = siteHost();
  return site !== null && host === site;
}

/** Запрос пришёл на адрес приложения (не на сайт и не на его псевдоним). */
export function isApplicationHost(host: string | null): boolean {
  const site = siteHost();
  return site !== null && host !== site && host !== wwwHost();
}

export function routeByHost({
  host,
  pathname,
  search,
  signedIn,
}: {
  host: string | null;
  pathname: string;
  search: string;
  signedIn: boolean;
}): HostRoute {
  const site = siteHost();
  if (site === null) return PASS;

  // Псевдоним: адрес у сайта один, поэтому www уводит сюда же, насовсем (308) и одним
  // прыжком — туда, где страница на самом деле живёт. Раньше ответ был 307: временный,
  // и поисковик не переносил на основной адрес вес страниц; а /robots.txt на www
  // отвечал «закрыто целиком», как у приложения
  if (host === wwwHost()) {
    const origin = isAppPath(pathname) ? appOrigin() : siteOrigin();
    return { action: "redirect", location: `${origin}${pathname}${search}`, status: 308 };
  }

  if (host === site) {
    if (SITE_PATHS.has(pathname)) return PASS;
    if (isAppPath(pathname)) {
      return { action: "redirect", location: `${appOrigin()}${pathname}${search}`, status: 307 };
    }
    // Любой другой путь — опечатка или чужая ссылка. Раньше его уводили в приложение, там
    // без сессии — на вход, и поисковик получал два перехода и страницу входа с кодом 200
    return { action: "not-found" };
  }

  // Страница «не найдено» — тоже страница, и открытая прямо отвечала бы 200 вместо 404
  if (pathname === SITE_NOT_FOUND_PATH) return { action: "not-found" };

  // Адрес приложения. Страница сайта, набранная здесь, уходит на сайт — вошедшему не нужно:
  // он открывает аудит и тарифы, не выходя из кабинета. Путь сохраняется: без него
  // /privacy открывал бы не политику, а главную
  if (SITE_PATHS.has(pathname) && !SHARED_PATHS.has(pathname) && !signedIn) {
    return { action: "redirect", location: `${siteOrigin()}${pathname}${search}`, status: 307 };
  }
  return PASS;
}

/**
 * То же решение, но без сессии: всё, что от неё не зависит, — www, страницы и неизвестные пути
 * сайта, страница «не найдено». Прокси выполняет его до обёртки `auth()`: она подменяет адрес
 * запроса на `AUTH_URL`, а переписывание на страницу 404 нужно строить от настоящего (см. `proxy.ts`).
 *
 * Единственная ветка, зависящая от входа, — анонимный на странице сайта по адресу приложения.
 * Здесь «вошёл» принято как данность, и она остаётся «пропустить»; её решает `routeByHost` с настоящей
 * сессией. Тест `tests/site-routing.test.ts` сверяет оба по всем сочетаниям: различаться они вправе
 * только там, где без входа сработал бы редирект на сайт.
 */
export function routeBeforeSession(input: { host: string | null; pathname: string; search: string }): HostRoute {
  return routeByHost({ ...input, signedIn: true });
}
