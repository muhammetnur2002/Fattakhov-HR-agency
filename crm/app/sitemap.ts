import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/urls";

/**
 * Карта сайта.
 *
 * Только публичные страницы. Приоритеты расставлены по смыслу,
 * а не по привычке ставить всем единицу: главная продаёт, аудит
 * приводит людей из поиска по запросам про найм, политика нужна
 * для доверия и для закона, но в выдаче ей делать нечего.
 *
 * Даты изменения нет намеренно: карта готовится при сборке образа,
 * и «дата» была бы моментом сборки — при каждой выкатке все страницы
 * выглядели бы обновлёнными. Робот, которого так обманули несколько
 * раз, перестаёт верить этой дате. Честной даты у страниц нет, и лучше
 * не указывать никакой.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();

  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/audit`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/tariffs`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/cases`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
