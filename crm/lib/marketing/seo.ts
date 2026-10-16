/**
 * Описание страниц сайта для поисковиков и соцсетей — одно место.
 *
 * Раньше у каждой страницы был свой набор тегов, написанный вручную, и они
 * разъехались: у /audit и /privacy в карточке соцсетей стоял заголовок главной,
 * у /cases и /tariffs не было названия сайта, бренд в заголовках писался тремя
 * способами («Fattakhov HR Agency», «Fattakhov HR», «Платформа»), а описание
 * у трёх страниц не помещалось в сниппет. Здесь страница описана один раз,
 * а заголовок, описание, canonical, карточка соцсетей, хлебные крошки и карта
 * сайта берутся отсюда. Страницы сайта метаданные сами не пишут: тест
 * `tests/site-seo.test.ts` ищет в них вызов `pageMetadata` и запрещает свой `title`.
 *
 * Правило длин (тест их проверяет): заголовок вкладки целиком, с брендом, —
 * 30–60 знаков, описание — 70–160.
 */
import type { Metadata } from "next";

import { MAX_SCORE, STAGES } from "@/lib/audit/stages";
import { ENTRY_PRICE, TARIFFS } from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/format-money";

export const SITE_NAME = "Fattakhov HR Agency";

/** Шаблон заголовка внутренних страниц: тема, потом бренд. Тот же стоит в макете сайта. */
export const TITLE_TEMPLATE = `%s · ${SITE_NAME}`;

/** Заголовок страницы «не найдено» на сайте — по тому же шаблону, что у страниц (тест проверяет длину). */
export const NOT_FOUND_TITLE = TITLE_TEMPLATE.replace("%s", "Страница не найдена");

/** Описание страницы «не найдено»: свое, а не унаследованное от главной (длина по общему правилу, тест проверяет). */
export const NOT_FOUND_DESCRIPTION =
  "Такой страницы на сайте нет: возможно, адрес набран с опечаткой. Перейдите на главную, посмотрите тарифы или пройдите экспресс-аудит найма.";

export type SitePageKey = "home" | "tariffs" | "cases" | "audit" | "privacy";

/** Размер карточки для соцсетей: 1200x630 — общий для Telegram, ВКонтакте и остальных. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * Версия шаблона карточки. Меняешь вёрстку в `scripts/generate-og-cards.ts` —
 * поднимай число: имя файла зависит от него, и соцсети перестанут показывать
 * старую картинку из своего кеша.
 */
export const OG_TEMPLATE_VERSION = 1;

type SitePage = {
  path: string;
  /** Заголовок вкладки: у внутренних страниц без бренда (его добавляет шаблон), у главной целиком. */
  title: string;
  description: string;
  /** Для карты сайта и robots: страница, закрытая от индекса, в карту не входит. */
  indexable: boolean;
  /** Название в хлебных крошках разметки. */
  crumb: string;
  /** Заголовок и описание в карточке соцсетей: отдельный текст, не копия заголовка вкладки. */
  og: { title: string; description: string; eyebrow: string };
  /**
   * Дата последней правки ТЕКСТА страницы (ГГГГ-ММ-ДД) — в `lastmod` карты сайта.
   * Правка вёрстки, отступов и стилей её не двигает: поисковик, которого несколько
   * раз обманули «свежей» датой, перестаёт ей верить. Поправил текст или цены — поправь
   * и дату здесь. Даты первого заполнения (12.10.2026) взяты из истории git: последний
   * коммит, менявший слова на странице, а не её классы.
   */
  updated: string;
};

/** Числа из тарифов, а не руками: описание не должно разойтись с прайсом на странице. */
const price = (value: number) => formatNumber(value).replace(/\s/g, " ");
const TOP_PRICE = TARIFFS[TARIFFS.length - 1].price;

export const SITE_PAGES: Record<SitePageKey, SitePage> = {
  home: {
    path: "/",
    title: `${SITE_NAME}: внешняя команда найма`,
    description:
      "Берём в работу 2-5 вакансий одновременно. Выделенная команда, прозрачная воронка и фиксированная стоимость в месяц.",
    indexable: true,
    crumb: "Главная",
    og: {
      eyebrow: "Внешняя команда найма",
      title: "Отдел найма, который не нужно нанимать",
      description: `Выделенная команда, 30+ источников поиска и прозрачная воронка. От ${price(ENTRY_PRICE)} ₽ в месяц, оплата фиксированная, без процентов за закрытие.`,
    },
    updated: "2026-10-04",
  },
  tariffs: {
    path: "/tariffs",
    title: "Стоимость подбора персонала: тарифы",
    description: `Сколько стоит внешняя команда найма: от ${price(ENTRY_PRICE)} ₽ в месяц за одну вакансию до ${price(TOP_PRICE)} ₽ за пять. Открытый прайс и калькулятор для сравнения со своим отделом.`,
    indexable: true,
    crumb: "Тарифы",
    og: {
      eyebrow: "Тарифы",
      title: `Тарифы: от ${price(ENTRY_PRICE)} ₽ в месяц за вакансию в работе`,
      description:
        "Пять конфигураций, открытые цены и калькулятор: сравните подписку с расходами на свой отдел найма на своих цифрах.",
    },
    updated: "2026-10-01",
  },
  cases: {
    path: "/cases",
    title: "Кейсы подбора персонала",
    description:
      "Реальные задачи найма из практики агентства: сложные роли на стыке аналитики и инженерии, подбор под разные направления бизнеса. Без выдуманных цифр.",
    indexable: true,
    crumb: "Кейсы",
    og: {
      eyebrow: "Кейсы",
      title: "Кейсы: не обещания, а реальные рабочие ситуации",
      description:
        "Что агентство закрывало на практике и по каким задачам клиенты возвращались.",
    },
    updated: "2026-10-04",
  },
  audit: {
    path: "/audit",
    title: "Экспресс-аудит системы найма",
    description: `Проверьте за 15 минут, где компания теряет кандидатов и деньги: ${STAGES.length} этапов найма от диагностики потребности до испытательного срока и план действий.`,
    indexable: true,
    crumb: "Экспресс-аудит",
    og: {
      eyebrow: "Бесплатный аудит",
      title: "Экспресс-аудит найма за 15 минут",
      description: `${STAGES.length} этапов, ${MAX_SCORE} балла и план действий: проверьте, где компания теряет кандидатов, время и деньги. Результат видите только вы.`,
    },
    updated: "2026-09-30",
  },
  privacy: {
    path: "/privacy",
    title: "Политика обработки персональных данных",
    description:
      "Порядок обработки и защиты персональных данных на сайте и в платформе Fattakhov HR Agency: цели, основания, сроки хранения, права субъекта.",
    // В выдаче политике делать нечего: она нужна для доверия и для закона,
    // а не для поиска. Поэтому noindex (follow оставлен: ссылка должна работать),
    // и поэтому её нет в карте сайта — страница с запретом индексации там
    // противоречит сама себе (проверка сайта 11.10.2026)
    indexable: false,
    crumb: "Политика в отношении персональных данных",
    og: {
      eyebrow: "Документ",
      title: "Политика обработки персональных данных",
      description:
        "Порядок обработки и защиты персональных данных на сайте и в платформе Fattakhov HR Agency.",
    },
    updated: "2026-10-04",
  },
};

export const SITE_PAGE_KEYS = Object.keys(SITE_PAGES) as SitePageKey[];

/** Заголовок вкладки целиком — как его увидит человек и поисковик. */
export function fullTitle(key: SitePageKey): string {
  const page = SITE_PAGES[key];
  return key === "home" ? page.title : TITLE_TEMPLATE.replace("%s", page.title);
}

/**
 * Короткий отпечаток (FNV-1a, 8 знаков) текста карточки. Чистый JS без `node:crypto`:
 * модуль читают и сервер, и скрипт генерации, и тесты, и нужен он одинаково везде.
 */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Что нарисовано на карточке страницы. Скрипт генерации берёт ровно это.
 *
 * Имя файла содержит отпечаток текста и версии шаблона: правишь слова в `og` или
 * вёрстку карточки — имя меняется, тест видит «файла нет» и просит перегенерировать
 * (`npm run og:cards`), а соцсети не показывают старую картинку из кеша.
 */
export function ogCard(key: SitePageKey) {
  const { og } = SITE_PAGES[key];
  const hash = fingerprint(`${OG_TEMPLATE_VERSION}|${og.eyebrow}|${og.title}`);
  return {
    eyebrow: og.eyebrow,
    headline: og.title,
    /** Путь от корня сайта: файл лежит в `public/og/`. */
    path: `/og/${key}-${hash}.png`,
    file: `public/og/${key}-${hash}.png`,
    alt: `${SITE_NAME}. ${og.title}`,
  };
}

/**
 * Метаданные страницы сайта: единственный способ их задать.
 *
 * Карточка соцсетей и `twitter` описаны у каждой страницы целиком: Next не сливает
 * `openGraph` макета со страничным, а заменяет, и страница без собственного
 * получала чужие заголовок и описание. Адреса картинок и страницы относительные —
 * абсолютными их делает `metadataBase` макета (адрес сайта из окружения сервера).
 */
export function pageMetadata(key: SitePageKey): Metadata {
  const page = SITE_PAGES[key];
  const card = ogCard(key);
  const image = { url: card.path, ...OG_SIZE, alt: card.alt };

  return {
    // У главной заголовок с брендом внутри: без absolute шаблон макета дописал бы его второй раз
    title: key === "home" ? { absolute: page.title } : page.title,
    description: page.description,
    // Свой адрес у каждой страницы: макет не ставит ничего, и страница без своего
    // canonical называла бы оригиналом главную
    alternates: { canonical: page.path },
    robots: { index: page.indexable, follow: true },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: SITE_NAME,
      url: page.path,
      title: page.og.title,
      description: page.og.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.og.title,
      description: page.og.description,
      images: [{ url: card.path, alt: card.alt }],
    },
  };
}
