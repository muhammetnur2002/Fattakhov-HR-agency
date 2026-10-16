import NextAuth, { type NextAuthRequest } from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { authConfig } from "@/auth.config";
import { actionLoginResponse, isServerActionRequest, loginPathFor } from "@/lib/auth/login-redirect";
import { AGENCY_HOME, CLIENT_HOME, homePathFor, TWO_FACTOR_SETUP_PATH } from "@/lib/nav";
import { isApplicationHost, routeBeforeSession, routeByHost, SITE_NOT_FOUND_PATH } from "@/lib/site-routing";

const { auth } = NextAuth(authConfig);

/**
 * Корень отдан лендингу и открыт всем.
 *
 * Проверяется точным совпадением, а не префиксом: "/" префикс любого
 * пути, и через startsWith он открыл бы наружу весь сайт целиком.
 */
const LANDING_PATH = "/";

/** Доступно без сессии. Публичные ссылки для кандидатов — по одноразовым токенам. */
const PUBLIC_PREFIXES = [
  "/login",
  // Самостоятельная регистрация компании (см. app/(public)/register/company):
  // человек по определению ещё не заведён в системе. Защита — код на почту,
  // ограниченный по времени и числу попыток, и общий лимит частоты формы
  "/register",
  // Восстановление пароля: человек по определению не может войти,
  // поэтому маршруты открыты. Защита - одноразовый токен со сроком
  // и ограничение частоты в самих действиях
  "/forgot",
  "/reset",
  // Подтверждение рабочей почты по ссылке из письма: письмо читают и на
  // телефоне, где кабинет не открыт. Защита — подпись в самой ссылке
  // (lib/services/email-confirmation.ts), а подключает адрес кнопка
  // на странице, не переход: почтовые сканеры открывают ссылки сами
  "/confirm-email",
  "/invite",
  "/schedule",
  "/consent",
  // Подтверждение передачи данных конкретному работодателю (§4.2
  // согласия). Как и /consent: аккаунта у кандидата нет, защита —
  // одноразовый токен со сроком, он проверяется в самом обработчике
  // (getDisclosureRequest / giveDisclosure), плюс лимит частоты
  "/disclosure",
  // Экспресс-аудит открыт всем, включая вошедших: его проходят
  // до всякого договора, и заставлять человека выйти из кабинета,
  // чтобы посмотреть свой же лид-магнит, бессмысленно
  "/audit",
  "/tariffs",
  "/cases",
  // Политика обязана открываться без входа: на неё ссылаются
  // галочки согласия и уведомление о cookie
  "/privacy",
  // Проверка живости: за ней ходит балансировщик, у которого нет
  // и не может быть сессии. Наружу отдаёт только признак готовности
  "/api/health",
  // Приёмник формы, отправленной до загрузки скриптов (lib/forms/no-script.ts). Нужен и ещё не вошедшим:
  // вход по номеру и регистрация — формы на клиентском коде. Закрытый от них, он отвечал бы редиректом
  // на /login с тем же POST и телом. Защищать нечего: тело не читается, ответ — возврат на ту же страницу
  "/api/no-script-form",
  // За этими двумя ходит поисковый робот. Без сессии, разумеется:
  // редирект на вход вместо карты сайта означает, что сайта
  // в выдаче не будет вовсе
  "/robots.txt",
  "/sitemap.xml",
  "/api/auth",
  // Календарные ссылки открываются без сессии намеренно: за ними ходит
  // приложение календаря, у которого нет наших кук, а кандидат вообще
  // не имеет аккаунта. Защита — подпись в самой ссылке, проверяется
  // в обработчике маршрута
  "/api/calendar",
  // Служебные вызовы со студенческой платформы (см. app/api/webhooks/
  // students-event) — у сервера нет и не может быть сессии агентства,
  // проверка — общий секрет CRM_SERVICE_SECRET внутри самого обработчика
  "/api/webhooks",
  // Манифест PWA (app/manifest.ts): его читает браузер/ОС при установке
  // на экран телефона, без какой-либо сессии — редирект на /login сделал
  // бы установку невозможной. Иконки (public/, app/apple-icon.png) под
  // редирект и так не попадают — их расширения исключены матчером ниже
  "/manifest.webmanifest",
  // Воркер пуш-уведомлений (public/push-sw.js). Браузер перепроверяет его
  // сам, когда захочет, — в том числе с давно истёкшей сессией, — а для
  // скрипта воркера редирект на /login означает «обновить не удалось».
  // Внутри нет ничего, кроме показа уведомления: открывать нечего
  "/push-sw.js",
];

/**
 * Защита маршрутов и разведение ролей по кабинетам.
 *
 * Файл называется proxy.ts, а не middleware.ts: в Next 16 прежнее соглашение
 * объявлено устаревшим.
 *
 * Здесь только навигация — никаких решений о правах на объекты.
 * Настоящие проверки живут в lib/access и вызываются на уровне данных:
 * прокси знает лишь роль из токена и не ходит в БД.
 *
 * Порядок важен. Сначала решение по адресу (`routeBeforeSession`, lib/site-routing.ts): сайт,
 * приложение и www отдают разное, и ему сессия не нужна. Оно выполняется ДО обёртки `auth()`:
 * та, если задан `AUTH_URL`, подменяет адрес запроса (`req.nextUrl`) на адрес кабинета
 * (`reqWithEnvURL` в next-auth), и переписывание страницы 404 на такой адрес Next считает
 * чужим — проксирует наружу и отвечает 500 (проверка 13.10.2026; до этого неизвестный путь
 * сайта был редиректом, и подмена ничего не ломала). Редиректы строятся из `APP_URL` и
 * `SITE_URL`, не из адреса запроса, поэтому им подмена не мешает. Потом, внутри `auth()`, —
 * единственное решение по адресу, которому нужна сессия, и роли. Ответы приложения помечены
 * `X-Robots-Tag: noindex, nofollow`: робот, которому обход не запрещён (страницы входа и
 * регистрации, на которые ссылается сайт, — app/robots.ts), увидит запрет индекса.
 */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("host");

  // Домены разведены: сайт отдаёт только свои страницы, всё остальное живёт
  // в приложении. Без этого кабинет открывался бы по двум адресам сразу,
  // и поисковики индексировали бы страницу входа как часть сайта
  const route = routeBeforeSession({ host, pathname: req.nextUrl.pathname, search: req.nextUrl.search });
  if (route.action === "redirect") {
    return markApplication(NextResponse.redirect(new URL(route.location), route.status), host);
  }
  if (route.action === "not-found") {
    // Страница «не найдено» в оформлении сайта, с кодом 404: путь в адресной строке
    // остаётся прежним, меняется только то, что нарисовано. Код задан здесь, потому что
    // страница обычная; почему не `notFound()` и не корневой not-found — у SITE_NOT_FOUND_PATH.
    // Адрес переписывания — из настоящего `req.nextUrl` (его здесь ещё не подменил `auth()`).
    // `no-store`: страница статическая и по умолчанию отдаётся с годовым `s-maxage`, а
    // запомнить на год «здесь ничего нет» чужому кешу значит закрыть адрес, на котором
    // позже появится настоящая страница
    const response = NextResponse.rewrite(new URL(SITE_NOT_FOUND_PATH, req.nextUrl), { status: 404 });
    response.headers.set("Cache-Control", "no-store");
    return markApplication(response, host);
  }

  return withSession(req, event);
}

/** Всё, что зависит от сессии. Запрос здесь уже с адресом из `AUTH_URL`: новых переписываний на его основе не строить. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- второй параметр нужен типу: с ним next-auth выбирает перегрузку «прокси», а не «обработчик маршрута»
const withSession = auth((req: NextAuthRequest, _event: NextFetchEvent) => {
  const host = req.headers.get("host");

  // Единственное решение по адресу, которому нужна сессия: страница сайта, набранная на адресе
  // приложения без входа, уходит на сайт (редирект, адрес назначения — из SITE_URL)
  const route = routeByHost({
    host,
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    signedIn: Boolean(req.auth?.user),
  });
  if (route.action === "redirect") {
    return markApplication(NextResponse.redirect(new URL(route.location), route.status), host);
  }

  return markApplication(applicationResponse(req), host);
});

/** Ответы адреса приложения не для поиска: `noindex, nofollow` заголовком, а не только в теле страницы. */
function markApplication(response: NextResponse, host: string | null): NextResponse {
  if (isApplicationHost(host)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

/** Защита и разведение по ролям — то, что было всем прокси, пока адреса не разводились. */
function applicationResponse(req: NextAuthRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const user = req.auth?.user;

  // Аноним на корне видит лендинг, а не форму входа
  if (pathname === LANDING_PATH && !user) return NextResponse.next();

  if (!user) {
    // Форма, отправленная после окончания сессии: ответ не страницей, а так, как понимает
    // серверное действие (иначе вместо входа — «Что-то пошло не так»)
    if (isServerActionRequest(req)) {
      return actionLoginResponse(loginPathFor(pathname, true));
    }
    const loginUrl = new URL("/login", req.nextUrl);
    // Чтобы после входа вернуть человека туда, куда он шёл
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Разведение по кабинетам — про страницы, а не про API. Маршруты
  // под /api проверяют права сами и отдают данные, а не разметку:
  // редирект превратил бы выгрузку отчёта в HTML дашборда
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const home = homePathFor(user.role);
  const isAgencyUser = home === AGENCY_HOME;
  const wantsAgency = pathname === AGENCY_HOME || pathname.startsWith(`${AGENCY_HOME}/`);

  // Вошедшему лендинг не нужен: у него есть свой кабинет
  if (pathname === LANDING_PATH) {
    return NextResponse.redirect(new URL(home, req.nextUrl));
  }

  // Экран обязательной настройки 2FA — не часть кабинета /a (иначе макет
  // кабинета гонял бы человека по кругу), но агентству открыт. Клиенту его
  // страница сама ответит 404: настройка там только для сотрудников
  if (pathname === TWO_FACTOR_SETUP_PATH) return NextResponse.next();

  if (isAgencyUser && !wantsAgency) {
    return NextResponse.redirect(new URL(AGENCY_HOME, req.nextUrl));
  }

  if (!isAgencyUser && wantsAgency) {
    return NextResponse.redirect(new URL(CLIENT_HOME, req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Всё, кроме статики, картинок и видео — иначе фоновый ролик в hero
  // (public/brand/hero-loop.mp4) уходит на /login как защищённый маршрут
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)"],
};
