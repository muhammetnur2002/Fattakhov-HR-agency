/**
 * Микроразметка сайта (schema.org, JSON-LD): какие узлы и у какой страницы.
 *
 * Функции чистые и без React — их разбирает и компонент `StructuredData`, и тест
 * валидности. Что стоит на какой странице:
 *
 *   главная   — Organization, WebSite, Service с тарифами, FAQPage (вопросы те же,
 *               что на странице: `lib/marketing/faq.ts`);
 *   /tariffs  — хлебные крошки и тот же Service с тарифами: цены на странице видны;
 *   /cases, /audit — хлебные крошки.
 *
 * У политики разметки нет: страница закрыта от индекса, поисковику её не показывают.
 *
 * Цены берутся из тарифной лестницы (`TARIFFS`), та же, что рисует прайс. Разойтись
 * они не могут по построению: разметка, обещающая в выдаче одну цену, а на странице
 * показывающая другую, читается как обман. Других чисел здесь нет — на публичных
 * страницах нет ни одного неподтверждённого (AGENTS.md, «Тарифы и числа на сайте»).
 */
import { EMAIL_DISPLAY, PHONE_HREF } from "@/lib/contacts";
import { FAQ_ITEMS } from "@/lib/marketing/faq";
import { TARIFFS } from "@/lib/marketing/inhouse-cost";
import { SITE_NAME, SITE_PAGES, type SitePageKey } from "@/lib/marketing/seo";
import { siteOrigin } from "@/lib/urls";

export type JsonLdNode = Record<string, unknown>;

const orgId = (base: string) => `${base}/#organization`;

function organization(base: string): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": orgId(base),
    name: SITE_NAME,
    url: base,
    description:
      "Внешняя команда найма по подписке: 2-5 вакансий одновременно, выделенная команда, прозрачная воронка.",
    areaServed: { "@type": "Country", name: "Россия" },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Казань",
      addressCountry: "RU",
    },
    contactPoint: {
      "@type": "ContactPoint",
      // Тот же номер, что в шапке и подвале (lib/contacts.ts): ссылка tel: без пробелов
      telephone: PHONE_HREF.replace(/^tel:/, ""),
      // Та же почта, что в подвале: публичный адрес для связи
      email: EMAIL_DISPLAY,
      contactType: "sales",
      availableLanguage: ["Russian"],
    },
  };
}

function website(base: string): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: base,
    name: SITE_NAME,
    inLanguage: "ru-RU",
    publisher: { "@id": orgId(base) },
  };
}

/** Подписка с пятью тарифами. На странице тарифов узла Organization нет, поэтому поставщик назван по имени. */
function service(base: string): JsonLdNode {
  return {
    "@type": "Service",
    name: "Подбор персонала по подписке",
    serviceType: "Рекрутинг",
    provider: { "@type": "Organization", "@id": orgId(base), name: SITE_NAME, url: base },
    areaServed: { "@type": "Country", name: "Россия" },
    offers: TARIFFS.map((t) => ({
      "@type": "Offer",
      // Название и состав — как на карточке тарифа («Старт», «Одна вакансия»): читалось «Старт: 1 в работе»
      name: `${t.name}: ${t.title.toLowerCase()} в работе`,
      price: t.price,
      priceCurrency: "RUB",
      // Цена за календарный месяц, а не за закрытие: без этого поисковик
      // покажет её как разовую стоимость услуги
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: t.price,
        priceCurrency: "RUB",
        unitCode: "MON",
      },
    })),
  };
}

function faqPage(): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Путь «Главная → страница»: две ступени, адреса абсолютные. */
export function breadcrumbs(key: SitePageKey, base = siteOrigin()): JsonLdNode {
  const page = SITE_PAGES[key];
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_PAGES.home.crumb, item: base },
      { "@type": "ListItem", position: 2, name: page.crumb, item: `${base}${page.path}` },
    ],
  };
}

/** Весь набор узлов страницы; пустой список — у страницы разметки нет. */
export function jsonLdFor(key: SitePageKey, base = siteOrigin()): JsonLdNode[] {
  switch (key) {
    case "home":
      return [organization(base), website(base), service(base), faqPage()];
    case "tariffs":
      return [breadcrumbs(key, base), service(base)];
    case "cases":
    case "audit":
      return [breadcrumbs(key, base)];
    default:
      return [];
  }
}
