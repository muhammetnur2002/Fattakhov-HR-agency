import { expect, test } from "@playwright/test";

/**
 * Первый экран главной: обе кнопки героя целиком над сгибом.
 *
 * Замер 11.10.2026 на локальном сайте: нижняя граница кнопок — 1012–1057px на 1280x720 и 1366x768
 * (за сгибом на ~337), 855–900 на 1440x900 (впритык) и 855–900 на 1536x864 (за сгибом на ~36);
 * влезало только на 1920x1080. Причина — компоновка: заголовок акцентной ступени (100px) стоял в
 * левой колонке шириной 556px (правую раздувал ценник) и занимал пять строк по 108px, а кнопки лежали
 * под абзацем в той же колонке. Теперь заголовок на всю ширину контейнера (две строки), под ним
 * абзац с кнопками слева и ценник справа.
 *
 * Размер заголовка и абзаца и шкала шрифтов сайта — решение заказчика, их тест тоже держит: правится
 * компоновка, а не кегль. Первая версия правки молча уменьшила абзац с 30 до 22px на 1280–1535 (так
 * кнопки заканчивались на 605px); проверка к PR #118 это поймала, кегль вернули — теперь на 1280 и 1366
 * абзац идёт в четыре строки, и кнопки заканчиваются на 693px при окне 720 (на 3px выше предела).
 * Запас 24px до нижнего края окна — чтобы кнопка не упиралась в границу экрана.
 *
 * Плашка о cookie — поверх страницы и размера раскладки не меняет, поэтому здесь не закрывается и в
 * критерий «над сгибом» не входит. Первому посетителю она закрывает кнопки: замер 12.10.2026 — верх
 * плашки 606px на 1280x720 (кнопки 648–693), 654px на 1366x768, 493px на 375x667 (кнопки 502–538);
 * на 1440x900 и 1536x864 плашка ниже кнопок. Это решение заказчика, а не поломка вёрстки.
 */
test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

const MARGIN = 24;

type Screen = { name: string; width: number; height: number };

const LAPTOPS: Screen[] = [
  { name: "ноутбук 1280x720", width: 1280, height: 720 },
  { name: "ноутбук 1366x768", width: 1366, height: 768 },
  { name: "ноутбук 1440x900", width: 1440, height: 900 },
  { name: "ноутбук 1536x864", width: 1536, height: 864 },
];

async function heroMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const hero = document.querySelector("main section")!;
    const h1 = hero.querySelector("h1")!;
    const links = ["Получить план найма", "Как устроена подписка"].map((text) => {
      const a = [...hero.querySelectorAll("a")].find((x) => x.textContent?.trim() === text);
      if (!a) throw new Error(`нет кнопки «${text}»`);
      const r = a.getBoundingClientRect();
      return { text, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    const cs = getComputedStyle(h1);
    const card = hero.querySelector("[class*='backdrop-blur']")!;
    const cardRect = card.getBoundingClientRect();
    const cardCs = getComputedStyle(card);
    // Именно знак рубля у цены в 100px: отдельный span с одним символом. Число рядом (`100 000`) стоит левее
    // и остаётся в карточке, даже когда «₽» уже срезан её `overflow-hidden`
    const rub = [...card.querySelectorAll("span")].filter((s) => s.textContent?.trim() === "₽");
    if (rub.length !== 1) throw new Error(`знаков «₽» у цены ${rub.length}, ждали один`);
    const header = document.querySelector("header")!.getBoundingClientRect();
    const logo = document.querySelector("header a[aria-label='Fattakhov HR Agency']")!.getBoundingClientRect();
    const lead = hero.querySelector("p")!;
    return {
      links,
      headerBottom: header.bottom,
      h1Size: parseFloat(cs.fontSize),
      h1Lines: Math.round(h1.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
      h1Left: h1.getBoundingClientRect().left,
      logoLeft: logo.left,
      leadSize: parseFloat(getComputedStyle(lead).fontSize),
      rubRight: rub[0].getBoundingClientRect().right,
      // правый край содержимого карточки: за ним начинается её внутренний отступ, а за краем — срез
      cardContentRight: cardRect.right - parseFloat(cardCs.paddingRight) - parseFloat(cardCs.borderRightWidth),
      cardClipped: card.scrollWidth - card.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const screen of LAPTOPS) {
  test(`${screen.name}: кнопки героя целиком в первом экране, заголовок в две строки`, async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto("/");
    const m = await heroMetrics(page);

    for (const link of m.links) {
      expect(link.bottom, `«${link.text}»: нижняя граница ≤ высота окна − ${MARGIN}`).toBeLessThanOrEqual(screen.height - MARGIN);
      expect(link.top, `«${link.text}» ниже шапки`).toBeGreaterThan(m.headerBottom);
    }
    expect(m.h1Size, "акцентная ступень заголовка не менялась: 100px").toBe(100);
    expect(m.leadSize, "абзац под заголовком с 1280 — 30px, как до правки компоновки (шкала не менялась)").toBe(30);
    expect(m.h1Lines, "заголовок на ширину контейнера, а не в узкой колонке").toBeLessThanOrEqual(2);
    expect(Math.abs(m.h1Left - m.logoLeft), `заголовок ${m.h1Left} против логотипа ${m.logoLeft}`).toBeLessThanOrEqual(1);
    expect(m.rubRight, "знак «₽» у цены не выходит за содержимое карточки (за ним её отступ, потом срез)").toBeLessThanOrEqual(m.cardContentRight + 0.5);
    expect(m.cardClipped, "карточка ничего не срезает справа").toBeLessThanOrEqual(0);
    expect(m.overflow, "страница не шире окна").toBe(0);
  });
}

test("ноутбук 1920x1080: кнопки на месте, как и было", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  const m = await heroMetrics(page);
  for (const link of m.links) expect(link.bottom).toBeLessThanOrEqual(1080 - MARGIN);
});

test("узкий ноутбук и планшет 1024x768: абзац и кнопки над ценником, кнопки над сгибом", async ({ page }) => {
  // С 1280 колонки (ценник справа), ниже — друг под другом: в 944px контейнера левая колонка была 364px,
  // абзац шёл в пять строк, а кнопки уезжали на 844px при окне 768
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const m = await heroMetrics(page);
  for (const link of m.links) expect(link.bottom).toBeLessThanOrEqual(768 - MARGIN);
  expect(m.leadSize, "ниже 1280 абзац — 22px, как и был").toBe(22);
  expect(m.rubRight).toBeLessThanOrEqual(m.cardContentRight + 0.5);
  expect(Math.abs(m.h1Left - m.logoLeft)).toBeLessThanOrEqual(1);
  expect(m.overflow).toBe(0);
});

test("телефон 375x667: кнопка видна без прокрутки, акцент 48px, ценник под кнопками", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const m = await heroMetrics(page);
  for (const link of m.links) expect(link.bottom, `«${link.text}»`).toBeLessThanOrEqual(667 - MARGIN);
  expect(m.h1Size).toBe(48);
  expect(m.leadSize, "абзац на телефоне — 18px, как и был").toBe(18);
  expect(Math.abs(m.h1Left - m.logoLeft)).toBeLessThanOrEqual(1);
  expect(m.rubRight).toBeLessThanOrEqual(m.cardContentRight + 0.5);
  expect(m.overflow).toBe(0);
  // ценник идёт после кнопок, как было: первым после заголовка и абзаца человек видит действие
  const order = await page.evaluate(() => {
    const hero = document.querySelector("main section")!;
    const btn = [...hero.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Получить план найма")!;
    const card = hero.querySelector("[class*='backdrop-blur']")!;
    return card.getBoundingClientRect().top - btn.getBoundingClientRect().bottom;
  });
  expect(order, "ценник ниже кнопок").toBeGreaterThan(0);
});
