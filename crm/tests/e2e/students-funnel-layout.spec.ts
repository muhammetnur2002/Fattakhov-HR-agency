/**
 * Воронка студплатформы: первые карточки пяти колонок начинаются на одной высоте,
 * а кнопка «Все клиенты» стоит справа от заголовка, как на соседних страницах.
 *
 * Сверка по скриншоту заказчика: подсказки у этапов — от одной строки до пяти, шапка колонки была
 * блоком внутри колонки, и первые карточки стояли на разной высоте; а кнопка на 1280 уходила под
 * длинную подпись слева. Меряем на 1024 (там и название этапа, и подсказка переносятся сильнее
 * всего), 1280 и 1440.
 *
 * Данные приходят со студенческой платформы, которой на машине разработчика обычно нет. Поэтому
 * спек сам поднимает на адресе из STUDENTS_URL подставную платформу с тремя клиентами из seed. Нужно,
 * чтобы dev-сервер был запущен с STUDENTS_URL=http://localhost:<порт> и CRM_SERVICE_SECRET (32+ знака);
 * без этого тест пропускается. Если порт уже занят настоящей или подставной платформой — меряем то,
 * что она отдаёт: проверки не зависят от состава данных.
 */
import { createServer, type Server } from "node:http";

import { expect, test, type Page } from "@playwright/test";

// Воронка — аккаунт-менеджер и владелец (client.view)
test.use({ storageState: "tests/e2e/.auth/owner.json" });

const iso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Три клиента из seed в разных состояниях: один готов к предложению подбора, два с договором. */
const COMPANIES = [
  { crmClientId: "cl_lead", companyName: "Камская Логистика", vacancies: 3, published: 2, applications: 6, newApplications: 2, invited: 0, hired: 0, lastActivityAt: iso(1), registeredAt: iso(10) },
  { crmClientId: "cl_starfish", companyName: "Старфиш", vacancies: 5, published: 5, applications: 20, newApplications: 0, invited: 4, hired: 2, lastActivityAt: iso(1), registeredAt: iso(60) },
  { crmClientId: "cl_technopark", companyName: "Технопарк Вектор", vacancies: 1, published: 1, applications: 1, newApplications: 0, invited: 0, hired: 0, lastActivityAt: iso(5), registeredAt: iso(30) },
];

let server: Server | null = null;

test.beforeAll(async () => {
  const url = process.env.STUDENTS_URL;
  const port = url && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url) ? Number(new URL(url).port || 80) : null;
  if (!port) return;
  const candidate = createServer((req, res) => {
    if (req.url?.startsWith("/api/service/employer/funnel")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ companies: COMPANIES }));
      return;
    }
    res.writeHead(404);
    res.end("{}");
  });
  await new Promise<void>((resolve) => {
    candidate.once("error", () => resolve()); // порт занят — пользуемся тем, кто его держит
    candidate.listen(port, () => {
      server = candidate;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

async function openFunnel(page: Page) {
  await page.goto("/a/clients/funnel", { waitUntil: "networkidle" });
  const columns = page.locator("main section");
  test.skip(
    (await columns.count()) !== 5,
    "Воронки нет на экране: запустите dev-сервер с STUDENTS_URL=http://localhost:<порт> и CRM_SERVICE_SECRET (32+ знака)",
  );
}

for (const width of [1024, 1280, 1440]) {
  test(`на ${width} первые карточки пяти колонок начинаются на одной высоте`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openFunnel(page);

    const m = await page.evaluate(() =>
      [...document.querySelectorAll("main section")].map((section) => {
        const header = section.children[0].getBoundingClientRect();
        const cards = section.children[1];
        return {
          firstCardTop: cards.firstElementChild!.getBoundingClientRect().top,
          headerHeight: header.height,
          hintHeight: section.children[0].querySelector("p")!.getBoundingClientRect().height,
          width: section.getBoundingClientRect().width,
        };
      }),
    );

    const tops = m.map((c) => c.firstCardTop);
    expect(Math.max(...tops) - Math.min(...tops), `верх первых карточек: ${tops.join(", ")}`).toBeLessThanOrEqual(1);

    // Проверка вообще что-то доказывает, только если подсказки у колонок разной высоты
    const hints = m.map((c) => Math.round(c.hintHeight));
    expect(Math.max(...hints) - Math.min(...hints), `высоты подсказок: ${hints.join(", ")}`).toBeGreaterThan(10);

    // Колонки равной ширины, ничего не растянуло длинное слово
    const widths = m.map((c) => c.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}

for (const width of [1024, 1280, 1440]) {
  test(`на ${width} название этапа и счётчик не накладываются на соседнюю колонку`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openFunnel(page);
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main section")].flatMap((section) => {
        const box = section.getBoundingClientRect();
        return [...section.children[0].querySelectorAll("h2, [data-slot=badge], p")]
          .filter((el) => el.getBoundingClientRect().right > box.right + 0.5 || el.getBoundingClientRect().left < box.left - 0.5)
          .map((el) => (el.textContent ?? "").trim());
      }),
    );
    expect(overflow).toEqual([]);
  });
}

for (const width of [1024, 1280, 1440]) {
  test(`на ${width} кнопка «Все клиенты» справа от заголовка, а не под подписью`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openFunnel(page);
    const header = page.locator('[data-slot="page-header"]');
    const title = (await header.getByRole("heading", { level: 1 }).boundingBox())!;
    const button = (await header.getByRole("link", { name: "Все клиенты" }).boundingBox())!;
    expect(button.y, "кнопка на строке заголовка").toBeLessThan(title.y + title.height);
    expect(button.x, "кнопка правее заголовка").toBeGreaterThan(title.x + 200);
    const content = (await page.locator("main").boundingBox())!;
    expect(content.x + content.width - (button.x + button.width), "кнопка у правого края страницы").toBeLessThanOrEqual(40);
  });
}

test("на телефоне кнопка под подписью, ряды колонок не нужны — карточки стопкой", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: "tests/e2e/.auth/owner.json",
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await openFunnel(page);
  const m = await page.evaluate(() => {
    const header = document.querySelector('[data-slot="page-header"]')!;
    const description = header.querySelector("p")!.getBoundingClientRect();
    const button = header.querySelector("a")!.getBoundingClientRect();
    const sections = [...document.querySelectorAll("main section")].map((s) => s.getBoundingClientRect());
    return { descriptionBottom: description.bottom, buttonTop: button.top, stacked: sections.every((s, i) => i === 0 || s.top >= sections[i - 1].bottom - 1), over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(m.buttonTop).toBeGreaterThanOrEqual(m.descriptionBottom - 1);
  expect(m.stacked).toBe(true);
  expect(m.over).toBe(0);
  await context.close();
});
