import type { Metadata, MetadataRoute } from 'next';
import { appOrigin } from '@/lib/app-url';
import { LEGAL_DOCUMENTS } from '@/lib/legal';
import { NOINDEX_PREFIXES, ROBOTS_DISALLOW, isNoindexPath } from '@/lib/seo-paths';

export { NOINDEX_PREFIXES, ROBOTS_DISALLOW, isNoindexPath };

/**
 * Поисковая выдача и превью ссылок: один источник для robots.txt, sitemap.xml,
 * canonical, Open Graph и запрета индексации.
 *
 * Раньше не было ничего: ни robots.txt, ни sitemap.xml, ни canonical, ни og-тегов, а вход,
 * регистрация и кабинеты открыты индексу. Правила собраны здесь, а не размазаны по страницам:
 * новая закрытая страница добавляется в NOINDEX_PREFIXES один раз и попадает сразу в заголовок
 * X-Robots-Tag (proxy.ts) и в robots.txt; новая публичная — в PUBLIC_PAGES. Сторожа — tests/unit.ts.
 *
 * Адрес платформы — из окружения (APP_URL, lib/app-url.ts), не зашитый localhost. Поэтому всё,
 * что его содержит (canonical, og:url, sitemap, robots), считается на запрос: страница с таким
 * адресом обязана быть force-dynamic, иначе сборка образа без окружения запомнила бы
 * http://localhost:3001 навсегда (так уже ломался сайт агентства 19.09.2026).
 */

export const SITE_NAME = 'Fattakhov HR Agency';
export const SITE_TITLE = 'Fattakhov HR Agency — работа для студентов';
export const SITE_DESCRIPTION =
  'Подработка и стажировки для студентов: смахните вправо — отклик уходит работодателю. Проверенные компании, график под учёбу.';

/** Картинка для превью ссылок: 1200×630, лежит в public/brand. Одна на все страницы. */
export const OG_IMAGE = { path: '/brand/og-students.png', width: 1200, height: 630 } as const;
export const OG_IMAGE_ALT = 'Fattakhov HR Agency — работа, которая помещается между парами';

/** Публичные страницы без параметров: их индексируем и кладём в sitemap. */
export const PUBLIC_PAGES: string[] = [
  '/',
  '/help',
  '/institutions',
  '/institutions/rating',
  ...Object.keys(LEGAL_DOCUMENTS).map((slug) => `/legal/${slug}`),
];

/** Метка «не индексировать» для макетов и страниц закрытых разделов. */
export const NOINDEX_METADATA: Metadata = { robots: { index: false, follow: false } };

/** Абсолютный адрес страницы платформы. Путь начинается со слэша. */
export function absoluteUrl(path = '/'): string {
  return `${appOrigin()}${path}`;
}

/**
 * Метаданные публичной страницы: заголовок, описание, canonical и Open Graph с Twitter-карточкой.
 * Общий шаблон — чтобы у страниц не расходились site_name, тип и картинка.
 * `title` без названия сайта (его добавляет шаблон из app/layout.tsx); без `title` — главная.
 */
export function pageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
}: {
  title?: string;
  description?: string;
  path: string;
}): Metadata {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_TITLE;
  const url = absoluteUrl(path);
  const image = absoluteUrl(OG_IMAGE.path);
  return {
    // Главная: абсолютный заголовок, а не «… · Fattakhov HR Agency» дважды
    title: title ?? { absolute: SITE_TITLE },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ru_RU',
      title: fullTitle,
      description,
      url,
      images: [{ url: image, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE_ALT }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [{ url: image, alt: OG_IMAGE_ALT }],
    },
  };
}

/** Содержимое robots.txt: открыто всё, кроме кабинетов и служебного; Sitemap — абсолютным адресом. */
export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ROBOTS_DISALLOW }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}

/**
 * Содержимое sitemap.xml: публичные страницы и страницы учебных заведений (их список — из
 * справочника, его читает app/sitemap.ts). Адреса абсолютные, от публичного адреса платформы.
 * Дат изменения нет намеренно: «сейчас» на каждый запрос — неправда, и поисковики это учатся
 * замечать.
 */
export function buildSitemap(institutionSlugs: string[]): MetadataRoute.Sitemap {
  const paths = [...PUBLIC_PAGES, ...institutionSlugs.map((slug) => `/institutions/${slug}`)];
  return [...new Set(paths)].filter((path) => !isNoindexPath(path)).map((path) => ({ url: absoluteUrl(path) }));
}
