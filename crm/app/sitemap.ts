import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/urls";

/**
 * Карта сайта.
 *
 * Только публичные страницы. Приоритеты расставлены по смыслу,
 * а не по привычке ставить всем единицу: главная продаёт, аудит
 * приводит людей из поиска по запросам про найм, политика нужна
 * для доверия и для закона, но в выдаче ей делать нечего.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "monthly", priority: 1 },
    {
      url: `${base}/audit`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/tariffs`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/cases`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
