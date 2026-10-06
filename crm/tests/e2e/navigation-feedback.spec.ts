/**
 * Нажатие на раздел отвечает сразу, а не когда страница готова целиком.
 *
 * Без loading.tsx у агентства (замер 05.10.2026, телефон, медленная
 * сеть) после нажатия на «Кандидаты» 3,7–5,9 секунды не менялось
 * ничего: ни экран, ни подсветка вкладки внизу — адрес переключается
 * только вместе с готовой страницей. С заготовкой вкладка и заготовка
 * страницы встают через 0,6 секунды, полная загрузка — та же.
 *
 * Медленная сеть — через протокол отладки Chromium: на локальном
 * сервере страница собирается быстрее, чем глаз заметит паузу.
 */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("вкладка внизу: отклик до готовой страницы, на медленной сети", async ({ page }) => {
  await page.goto("/a/vacancies", { waitUntil: "networkidle" });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: 40 * 1024,
    uploadThroughput: 40 * 1024,
  });

  const tab = page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Кандидаты" });
  const box = (await tab.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  // Отклик: заготовка на месте страницы и подсветка нажатой вкладки
  await expect(page.getByRole("status", { name: "Страница загружается" })).toBeVisible({ timeout: 3_000 });
  await expect(tab).toHaveAttribute("aria-current", "page");

  // И сама страница — потом, на месте заготовки
  await expect(page.getByRole("heading", { level: 1, name: "Кандидаты" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status", { name: "Страница загружается" })).toHaveCount(0);
});
