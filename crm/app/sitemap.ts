import type { MetadataRoute } from "next";

import { SITE_PAGE_KEYS, SITE_PAGES } from "@/lib/marketing/seo";
import { siteOrigin } from "@/lib/urls";

/**
 * Карта сайта.
 *
 * Только страницы, открытые для индекса: политика закрыта `noindex`, и в карте её
 * быть не должно — страница с запретом индексации в списке «индексируйте это»
 * противоречит сама себе (проверка сайта 11.10.2026). Список и даты берутся из
 * `lib/marketing/seo.ts`, отдельного перечня здесь нет.
 *
 * `lastModified` — дата последней правки текста страницы, записанная вручную там же.
 * Не дата сборки образа: при каждой выкатке все страницы выглядели бы обновлёнными, и
 * робот, которого так обманули несколько раз, перестаёт верить этой дате. `changeFrequency`
 * и `priority` убраны: Google их не учитывает, а выдуманные приоритеты только вводили
 * в заблуждение.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();

  return SITE_PAGE_KEYS.filter((key) => SITE_PAGES[key].indexable).map((key) => {
    const page = SITE_PAGES[key];
    return {
      // Главная — без хвостового слэша, как её canonical
      url: page.path === "/" ? base : `${base}${page.path}`,
      lastModified: page.updated,
    };
  });
}
