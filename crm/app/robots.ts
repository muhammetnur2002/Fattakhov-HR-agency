import { headers } from "next/headers";
import type { MetadataRoute } from "next";

import { siteHost, siteOrigin } from "@/lib/urls";

/**
 * Правила для поисковых роботов.
 *
 * Файл отдаётся с обоих доменов и говорит с них разное.
 *
 * Сайт — витрина, её индексировать нужно, закрыты только кабинеты,
 * служебные маршруты и публичные ссылки по токенам. Последнее важнее
 * прочего: ссылка на форму согласия кандидата или на выбор времени
 * интервью содержит одноразовый токен, и попадание такой страницы
 * в индекс означало бы, что персональные данные конкретного человека
 * доступны из поиска.
 *
 * Домен приложения индексировать не нужно вовсе: там нет ни одной
 * страницы для посторонних, а форма входа в выдаче — ровно то, ради
 * чего домены и разводили.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = siteHost();
  const host = (await headers()).get("host");

  // Пока домены не разведены (site === null), всё живёт на одном
  // адресе, и закрывать его целиком нельзя — там же лендинг
  const onApplicationHost = site !== null && host !== site;

  if (onApplicationHost) {
    return {
      rules: { userAgent: "*", disallow: "/" },
      // Карта сайта всё равно указывает на витрину: у приложения
      // своих страниц для поиска нет
      sitemap: `${siteOrigin()}/sitemap.xml`,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        // Кабинет агентства живёт на /a — как AGENCY_PREFIX в proxy.ts.
        // Раньше здесь стоял «/agency», путь из более ранней версии:
        // правило выглядело рабочим и не закрывало ничего
        "/a/",
        "/login",
        "/forgot",
        "/reset",
        "/invite",
        "/consent",
        "/schedule",
      ],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
    host: siteOrigin(),
  };
}
