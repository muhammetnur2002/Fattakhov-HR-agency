import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { AGENCY_HOME, CLIENT_HOME, homePathFor } from "@/lib/nav";
import { appOrigin, siteHost, siteOrigin } from "@/lib/urls";

const { auth } = NextAuth(authConfig);

/**
 * Корень отдан лендингу и открыт всем.
 *
 * Проверяется точным совпадением, а не префиксом: "/" префикс любого
 * пути, и через startsWith он открыл бы наружу весь сайт целиком.
 */
const LANDING_PATH = "/";

/**
 * Что живёт на сайтовом домене, а не в приложении.
 *
 * Лендинг и маркетинговые страницы вроде экспресс-аудита. Список,
 * а не префикс: страницы сайта нужно добавлять сюда осознанно,
 * потому что каждая запись открывает путь наружу.
 */
const SITE_PATHS = new Set([
  LANDING_PATH,
  "/audit",
  "/tariffs",
  "/cases",
  "/privacy",
  "/robots.txt",
  "/sitemap.xml",
]);

/**
 * Домену приложения нужен собственный robots.txt.
 *
 * Всё прочее из SITE_PATHS уводится отсюда на витрину, но с этим
 * файлом так нельзя: редирект отдаёт корень сайта (new URL(siteOrigin())
 * теряет путь), робот получает в ответ html вместо правил и обращается
 * с доменом как с открытым. Отдаём файл на месте — app/robots.ts
 * отвечает на домене приложения «Disallow: /».
 */
const ROBOTS_PATH = new Set(["/robots.txt"]);

/** Доступно без сессии. Публичные ссылки для кандидатов — по одноразовым токенам. */
const PUBLIC_PREFIXES = [
  "/login",
  // Восстановление пароля: человек по определению не может войти,
  // поэтому маршруты открыты. Защита - одноразовый токен со сроком
  // и ограничение частоты в самих действиях
  "/forgot",
  "/reset",
  "/invite",
  "/schedule",
  "/consent",
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
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const site = siteHost();
  const onSite = site !== null && req.headers.get("host") === site;

  // Домены разведены: сайт отдаёт только лендинг, всё остальное живёт
  // в приложении. Без этого кабинет открывался бы по двум адресам
  // сразу, и поисковики индексировали бы страницу входа как часть сайта.
  if (site !== null) {
    if (onSite && !SITE_PATHS.has(pathname)) {
      return NextResponse.redirect(new URL(`${appOrigin()}${pathname}${req.nextUrl.search}`));
    }
    if (
      !onSite &&
      SITE_PATHS.has(pathname) &&
      !ROBOTS_PATH.has(pathname) &&
      !req.auth?.user
    ) {
      // Путь сохраняем — как и в обратном направлении строкой выше.
      // Без него любой сайтовый адрес, набранный на домене приложения,
      // приводил на главную витрины: /privacy открывал не политику,
      // а лендинг
      return NextResponse.redirect(
        new URL(`${siteOrigin()}${pathname}${req.nextUrl.search}`),
      );
    }
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const user = req.auth?.user;

  // Аноним на корне видит лендинг, а не форму входа
  if (pathname === LANDING_PATH && !user) return NextResponse.next();

  if (!user) {
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

  if (isAgencyUser && !wantsAgency) {
    return NextResponse.redirect(new URL(AGENCY_HOME, req.nextUrl));
  }

  if (!isAgencyUser && wantsAgency) {
    return NextResponse.redirect(new URL(CLIENT_HOME, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Всё, кроме статики и картинок
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
