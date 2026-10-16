// @vitest-environment jsdom
/**
 * Сайт для поисковиков, часть, которую видно только в отрисованной разметке (проверка 11.10.2026):
 * разметка FAQPage совпадает с видимым списком вопросов; у кейсов правильный уровень заголовков;
 * кнопка «Рассчитать под мой план» ведёт на форму, а не в пустоту.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Pricing } from "@/components/marketing/pricing";
import { Cases, Faq } from "@/components/marketing/sections";
import { StructuredData } from "@/components/marketing/structured-data";
import { FAQ_ITEMS } from "@/lib/marketing/faq";

beforeAll(() => {
  // Появление блоков (motion) в jsdom не нужно: наблюдателя пересечений нет
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("FAQPage: разметка и видимый список — одни и те же вопросы и ответы", () => {
  it("каждый вопрос и ответ из разметки есть на странице, в том же порядке, и ничего лишнего", () => {
    const { container: page } = render(<Faq />);
    const { container: head } = render(<StructuredData page="home" />);

    const visible = [...page.querySelectorAll("details")].map((d) => [
      text(d.querySelector("summary")),
      text(d.querySelector("p")),
    ]);

    const json = JSON.parse(head.querySelector('script[type="application/ld+json"]')?.textContent ?? "{}");
    const faq = json["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage");
    const marked = faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [
      q.name,
      q.acceptedAnswer.text,
    ]);

    expect(visible).toHaveLength(FAQ_ITEMS.length);
    expect(marked).toEqual(visible);
  });
});

describe("кейсы: уровень заголовка", () => {
  it("на главной (под h2 раздела) имя клиента — h3", () => {
    const { container } = render(<Cases />);
    expect(container.querySelectorAll("h3")).toHaveLength(2);
    expect(container.querySelectorAll("h2")).toHaveLength(0);
  });

  it("на /cases (сразу под h1, раздела с заголовком нет) — h2: h1 → h3 пропускал уровень", () => {
    const { container } = render(<Cases headingAs="h2" />);
    expect(container.querySelectorAll("h2")).toHaveLength(2);
    expect(container.querySelectorAll("h3")).toHaveLength(0);
  });

  it("размер шрифта у обоих уровней один: он в классах, а не в теге", () => {
    const h3 = render(<Cases />).container.querySelector("h3")?.className;
    cleanup();
    const h2 = render(<Cases headingAs="h2" />).container.querySelector("h2")?.className;
    expect(h2).toBe(h3);
  });
});

describe("«Рассчитать под мой план»", () => {
  it("ведёт на форму главной ссылкой «/#diagnostic»: на /tariffs голый «#diagnostic» указывал в пустоту", () => {
    const { getByText } = render(<Pricing />);
    const link = getByText("Рассчитать под мой план").closest("a");
    expect(link?.getAttribute("href")).toBe("/#diagnostic");
  });
});
