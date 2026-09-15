import type { Metadata } from "next";

import { CookieBanner } from "@/components/analytics/cookie-banner";
import { YandexMetrika } from "@/components/analytics/metrika";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { siteOrigin } from "@/lib/urls";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),

  // absolute, иначе корневой шаблон допишет «· Платформа»: для главной
  // страницы сайта это лишнее слово в выдаче и в заголовке вкладки
  title: {
    absolute: "Fattakhov HR Agency: внешняя команда найма",
  },
  description:
    "Берём в работу 2-5 вакансий одновременно. Выделенная команда, прозрачная воронка и фиксированная стоимость в месяц.",

  // Канонический адрес: сайт открывается и с www, и без, и поисковик
  // иначе считает это двумя разными страницами с одинаковым текстом
  alternates: { canonical: "/" },

  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Fattakhov HR Agency",
    title: "Отдел найма, который не нужно нанимать",
    description:
      "Выделенная команда, 30+ источников поиска и прозрачная воронка. От 100 000 ₽ в месяц вместо своего отдела найма за 590 000 ₽.",
  },

  // Заголовок в соцсетях и мессенджерах отличается от заголовка
  // в выдаче намеренно: в поиске человек ищет услугу словами,
  // а в ленте его останавливает обещание
  twitter: { card: "summary_large_image" },

  robots: { index: true, follow: true },
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
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // marketing-shell — точка входа для мобильной шкалы шрифта, см. globals.css
  return (
    <div className="marketing-shell flex min-h-svh flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      <CookieBanner />
      <YandexMetrika />
    </div>
  );
}
