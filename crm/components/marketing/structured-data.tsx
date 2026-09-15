import { TARIFFS } from "@/lib/marketing/inhouse-cost";
import { siteOrigin } from "@/lib/urls";

/**
 * JSON.stringify не экранирует "<" — а строка `</script>` внутри значения
 * оборвала бы тег раньше срока. Сейчас все поля ниже — собственные
 * константы, поэтому это чисто защита на будущее: как только сюда
 * попадёт что-то не из наших же констант, экранирование уже стоит.
 */
function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Микроразметка для поисковиков.
 *
 * Даёт расширенный сниппет: название организации, контакты, цены,
 * свёрнутые ответы на вопросы прямо в выдаче. Занимает больше места,
 * чем обычная строка, и потому кликается чаще.
 *
 * Цены берутся из того же места, что и прайс на странице. Разойтись
 * они не могут по построению, и это важнее удобства: разметка,
 * обещающая в выдаче одну цену, а на странице показывающая другую,
 * читается поисковиком как обман и лечится понижением.
 *
 * Тексты вопросов дублируют раздел «Частые вопросы» намеренно:
 * поисковик показывает такой блок только тогда, когда ответ есть
 * и на самой странице.
 */

type Faq = { q: string; a: string };

const FAQ: Faq[] = [
  {
    q: "Чем подписка отличается от обычного агентства?",
    a: "Агентство берёт процент за каждое закрытие и работает по отдельным вакансиям. Подписка — это выделенная команда с фиксированной оплатой в месяц, которая ведёт 1-5 вакансий одновременно и отвечает за весь процесс от заявки до выхода сотрудника.",
  },
  {
    q: "Что считается активным слотом?",
    a: "Один слот — одна вакансия в активной работе. Закрыли позицию, переводим слот на следующую, сохраняя темп и накопленный контекст по вашему рынку.",
  },
  {
    q: "Можно ли начать с одной вакансии?",
    a: "Да. Тариф «Старт» — одна вакансия в работе за 100 000 ₽ в месяц. Минимальный срок сотрудничества 3 месяца.",
  },
  {
    q: "Сколько стоит свой отдел найма?",
    a: "Директор, менеджер и рекрутер с учётом страховых взносов и доступов к базам резюме обходятся примерно в 590 000 ₽ в месяц. Это без учёта поиска самой команды, отпусков и месяцев без вакансий.",
  },
];

export function StructuredData() {
  const base = siteOrigin();

  const данные = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: "Fattakhov HR Agency",
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
          telephone: "+7-937-571-18-77",
          contactType: "sales",
          availableLanguage: ["Russian"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: base,
        name: "Fattakhov HR Agency",
        inLanguage: "ru-RU",
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "Service",
        name: "Подбор персонала по подписке",
        serviceType: "Рекрутинг",
        provider: { "@id": `${base}/#organization` },
        areaServed: { "@type": "Country", name: "Россия" },
        offers: TARIFFS.map((t) => ({
          "@type": "Offer",
          name: `${t.name}: ${t.slots} в работе`,
          price: t.price,
          priceCurrency: "RUB",
          // Цена за календарный месяц, а не за закрытие: без этого
          // поисковик покажет её как разовую стоимость услуги
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: t.price,
            priceCurrency: "RUB",
            unitCode: "MON",
          },
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdSafe(данные) }}
    />
  );
}
