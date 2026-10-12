/**
 * «Заявки с сайта»: карточка — фиксированная сетка, одинаковая у всех заявок.
 *
 * Сверка по скриншоту заказчика: «Вакансий», «Сайт» и заметка то были, то нет; колонка кнопок
 * справа меняла ширину от статуса, и вторая колонка полей съезжала от карточки к карточке.
 * Заводим заявки с разной полнотой (все поля / только имя и контакт) и разными статусами и меряем:
 * набор подписей одинаков, левые края колонок совпадают, «Спам» стоит у правого края карточки и
 * не вплотную к «Взять в работу», на телефоне кнопки в столбик на всю ширину.
 */
import { expect, test, type Page } from "@playwright/test";

import { cleanupLeads, createLeads } from "./fixtures/db-client";

// Разбор заявок — владелец и аккаунт-менеджер (client.manage)
test.use({ storageState: "tests/e2e/.auth/owner.json" });

const PREFIX = "[e2e-заявка]";

test.beforeAll(async () => {
  await cleanupLeads({ namePrefix: PREFIX });
  await createLeads({
    leads: [
      {
        name: `${PREFIX} Полная`,
        contact: "+7 (937) 571-18-77",
        company: "ООО Ромашка",
        website: "romashka.example",
        vacancies: "1–2",
        note: "Нужен руководитель отдела продаж, быстро",
        status: "NEW",
      },
      { name: `${PREFIX} Пустая`, contact: "@only_contact", status: "NEW" },
      { name: `${PREFIX} В работе`, contact: "work@example.ru", vacancies: "3–5", status: "IN_PROGRESS" },
      { name: `${PREFIX} Закрытая`, contact: "89375711877", website: "closed.example", status: "SPAM" },
    ],
  });
});

test.afterAll(async () => {
  await cleanupLeads({ namePrefix: PREFIX });
});

/** Карточки наших заявок: по имени, а не по порядку, чтобы чужие заявки не мешали. */
async function cards(page: Page) {
  await page.goto("/a/leads", { waitUntil: "networkidle" });
  const result = [];
  for (const name of ["Полная", "Пустая", "В работе", "Закрытая"]) {
    const card = page.locator('[data-slot="card"]').filter({ hasText: `${PREFIX} ${name}` });
    await expect(card).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();
    result.push({ name, card });
  }
  return result;
}

test.describe("ноутбук", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("у всех карточек один набор подписей, и значения стоят на одних вертикалях", async ({ page }) => {
    const list = await cards(page);
    const layouts = [];
    for (const { name, card } of list) {
      const labels = await card.locator("dt").allTextContents();
      expect(labels, name).toEqual(["Контакт", "Вакансий", "Сайт", "Пришла", "Заметка"]);
      // левые края значений: первая колонка, вторая колонка, заметка
      const x = await card.locator("dd").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
      layouts.push({ name, x });
      // пустое поле — прочерк, а не пропуск строки
      if (name === "Пустая") {
        const values = await card.locator("dd").allTextContents();
        expect(values.filter((v) => v === "—")).toHaveLength(3); // вакансий, сайт, заметка
      }
    }
    for (const { name, x } of layouts) {
      for (let i = 0; i < x.length; i++) {
        expect(Math.abs(x[i] - layouts[0].x[i]), `«${name}», значение №${i + 1}: ${x[i]} против ${layouts[0].x[i]}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("«Спам» и «Не сложилось» — справа у края карточки, не вплотную к основной", async ({ page }) => {
    const list = await cards(page);
    for (const [name, primaryName, quietName] of [
      ["Полная", "Взять в работу", "Спам"],
      ["Пустая", "Взять в работу", "Спам"],
      ["В работе", "Стал клиентом", "Не сложилось"],
    ] as const) {
      const card = list.find((c) => c.name === name)!.card;
      const primary = (await card.getByRole("button", { name: primaryName }).boundingBox())!;
      const quiet = (await card.getByRole("button", { name: quietName }).boundingBox())!;
      const cardBox = (await card.boundingBox())!;
      // основная слева, тихая правее и дальше нескольких ширин промаха
      expect(quiet.x, name).toBeGreaterThan(primary.x + primary.width + 100);
      // тихая прижата к правому краю содержимого карточки (отступ карточки — до ~1.3rem*20)
      expect(cardBox.x + cardBox.width - (quiet.x + quiet.width), name).toBeLessThanOrEqual(32);
      // размер у обеих один (sm, ≈31px на телефоне — решение заказчицы не увеличивать кнопки)
      expect(Math.abs(primary.height - quiet.height), name).toBeLessThanOrEqual(1);
      // обе на одной строке
      expect(Math.abs(primary.y + primary.height / 2 - (quiet.y + quiet.height / 2)), name).toBeLessThanOrEqual(6);
    }
  });

  test("кнопки одной роли стоят на одном месте у карточек одного статуса", async ({ page }) => {
    const list = await cards(page);
    const rect = async (name: string) => {
      const box = (await list.find((c) => c.name === name)!.card.getByRole("button", { name: "Взять в работу" }).boundingBox())!;
      return { x: Math.round(box.x), w: Math.round(box.width) };
    };
    const [a, b] = [await rect("Полная"), await rect("Пустая")];
    expect(a).toEqual(b);
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("кнопки в столбик на всю ширину: основная выше, «Спам» под ней", async ({ page }) => {
    const list = await cards(page);
    for (const name of ["Полная", "Пустая"]) {
      const card = list.find((c) => c.name === name)!.card;
      const primary = (await card.getByRole("button", { name: "Взять в работу" }).boundingBox())!;
      const quiet = (await card.getByRole("button", { name: "Спам" }).boundingBox())!;
      expect(quiet.y, name).toBeGreaterThan(primary.y + primary.height - 1);
      expect(Math.abs(primary.width - quiet.width), name).toBeLessThanOrEqual(1);
      const panel = (await card.locator('[data-slot="panel"]').boundingBox())!;
      expect(Math.abs(primary.width - panel.width), `${name}: кнопка во всю ширину содержимого`).toBeLessThanOrEqual(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
