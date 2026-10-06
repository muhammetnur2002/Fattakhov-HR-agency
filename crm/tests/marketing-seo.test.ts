/**
 * Витрина для поисковиков: у каждой страницы свой canonical, у карты
 * сайта нет выдуманной даты изменения.
 *
 * Обе ошибки не ломают ни типы, ни отрисовку — их видно только по выдаче,
 * через недели. До 04.10.2026 /audit и /privacy наследовали из макета
 * canonical «/» и называли своим оригиналом главную, а карта сайта ставила
 * всем страницам дату сборки образа.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";

describe("canonical страниц витрины", () => {
  const ROOT = "app/(marketing)";
  const pages = readdirSync(ROOT, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith("page.tsx") && f !== "page.tsx")
    .map((f) => join(ROOT, f));

  it("страницы найдены", () => {
    // Иначе тест ниже молча проверил бы пустоту
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages)("%s называет своим адресом себя, а не главную", (file) => {
    // Макет ставит canonical «/» всем страницам без своего: поисковик
    // счёл бы такую страницу копией главной и убрал бы из выдачи
    const own = readFileSync(file, "utf8").match(/canonical:\s*"([^"]+)"/);

    expect(own, `у ${file} нет своего canonical`).not.toBeNull();
    expect(own?.[1]).not.toBe("/");
  });
});

describe("карта сайта", () => {
  it("без даты изменения: дата сборки — не дата правки страницы", () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified, entry.url).toBeUndefined();
    }
  });
});
