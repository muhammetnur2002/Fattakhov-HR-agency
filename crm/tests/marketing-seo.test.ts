/**
 * Витрина для поисковиков: у каждой страницы свой canonical, в карте сайта нет выдуманных дат.
 *
 * Обе ошибки не ломают ни типы, ни отрисовку — их видно только по выдаче, через недели. До 04.10.2026
 * /audit и /privacy наследовали из макета canonical «/» и называли своим оригиналом главную, а карта
 * сайта ставила всем страницам дату сборки образа.
 *
 * С 12.10.2026 страницы описаны в одном реестре (`lib/marketing/seo.ts`), canonical и дата берутся оттуда;
 * остальные правила (длины, карточки соцсетей, robots, разметка) — `tests/site-seo.test.ts`.
 * Прежнее правило «у карты нет lastmod» заменено: даты есть, но это даты правки текста страницы,
 * записанные вручную, а не дата сборки (тест ниже).
 */
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { SITE_PAGE_KEYS, SITE_PAGES, pageMetadata } from "@/lib/marketing/seo";

describe("canonical страниц витрины", () => {
  it("у каждой страницы свой адрес — главная не называется оригиналом чужой страницы", () => {
    const canonicals = SITE_PAGE_KEYS.map((key) => pageMetadata(key).alternates?.canonical);
    expect(new Set(canonicals).size).toBe(SITE_PAGE_KEYS.length);
    for (const key of SITE_PAGE_KEYS.filter((k) => k !== "home")) {
      expect(pageMetadata(key).alternates?.canonical, key).toBe(SITE_PAGES[key].path);
      expect(pageMetadata(key).alternates?.canonical, key).not.toBe("/");
    }
  });
});

describe("карта сайта", () => {
  it("даты не одинаковы у всех: дата сборки образа ставила бы всем страницам одну", () => {
    const dates = sitemap().map((e) => e.lastModified);
    expect(new Set(dates).size).toBeGreaterThan(1);
  });
});
