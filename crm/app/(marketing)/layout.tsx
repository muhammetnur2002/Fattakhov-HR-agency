import type { Metadata } from "next";

import { CookieBanner } from "@/components/analytics/cookie-banner";
import { YandexMetrika } from "@/components/analytics/metrika";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { SkipLink } from "@/components/shell/skip-link";
import { MAIN_LANDMARK_PROPS } from "@/lib/a11y";
import { SITE_PAGES, TITLE_TEMPLATE, fullTitle } from "@/lib/marketing/seo";
import { siteOrigin } from "@/lib/urls";

/**
 * Общие метаданные сайта. Страница задаёт свои целиком через `pageMetadata`
 * (lib/marketing/seo.ts): Next не сливает вложенные поля, а заменяет их, поэтому
 * здесь нет ни canonical, ни openGraph — унаследованные, они называли бы
 * главную оригиналом каждой страницы и подставляли её заголовок в карточку.
 *
 * Здесь остаётся то, что верно для любой страницы витрины: адрес сайта для
 * абсолютных ссылок, а также заголовок (`absolute` — иначе шаблон корневого
 * макета «%s · Платформа» дописался бы к нему) и шаблон с брендом для заголовков
 * страниц. Разрешения на индексацию здесь нет намеренно: корневой макет закрывает
 * от неё всё приложение, и открывает её только сама страница в `pageMetadata`.
 * Новая страница без явного разрешения в выдачу не попадёт.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { absolute: fullTitle("home"), template: TITLE_TEMPLATE },
  description: SITE_PAGES.home.description,
};

/**
 * Публичная часть сайта. Без сессии и без каркаса кабинета: сюда приходят
 * с рекламы и из поиска, а не из системы.
 *
 * Счётчик Метрики подключён здесь, а не в корневой разметке, и это
 * не мелочь: в кабинетах и на страницах кандидата - согласие на
 * обработку, выбор времени интервью, приглашение - стороннему
 * сервису делать нечего. Там вводят персональные данные, и пускать
 * туда чужой скрипт значит своими руками отдать то, что по выбранной
 * архитектуре наружу не уходит вовсе.
 *
 * Страница «не найдено» сайта (`site-not-found`, см. lib/site-routing.ts) живёт в этой же
 * группе и потому получает этот каркас сама.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // marketing-shell — точка входа для мобильной шкалы шрифта, см. globals.css
  return (
    <div className="marketing-shell flex min-h-svh flex-col bg-background">
      {/* Плашка встаёт под липкой шапкой сайта, а не поверх логотипа и меню */}
      <SkipLink below="var(--site-header-h) + 1px" />
      <MarketingHeader />
      <main {...MAIN_LANDMARK_PROPS} className="flex-1">
        {children}
      </main>
      <MarketingFooter />
      <CookieBanner />
      <YandexMetrika />
    </div>
  );
}
