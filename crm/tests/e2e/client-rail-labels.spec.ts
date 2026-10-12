/**
 * Подписи узкой панели разделов кабинета клиента — см. rail-labels.spec.ts.
 *
 * Сверка 08.10.2026: правка «10px → text-xs» сделала подписи 17,5px на мыши и
 * на экранах от 1024px, а ширина панели осталась прежней: слова «Кандидаты»,
 * «Сообщения», «Студенческая» (95–122px) не помещались в 85px и обрезались
 * у 7 пунктов из 14. Измеряем самое длинное слово каждой подписи в её же
 * шрифте против ширины, которая ему отведена.
 */
import { expect, test } from "@playwright/test";

import { clippedRailLabels } from "./fixtures/rail";


const VIEWPORTS = [
  { name: "iPad портрет 768, палец", width: 768, height: 1024, touch: true },
  { name: "планшет 820, палец", width: 820, height: 1180, touch: true },
  { name: "iPad альбом 1024, палец", width: 1024, height: 768, touch: true },
  { name: "окно 1024, мышь", width: 1024, height: 768, touch: false },
  { name: "окно 1180, мышь", width: 1180, height: 800, touch: false },
];

for (const vp of VIEWPORTS) {
  test(`подписи панели разделов клиента помещаются: ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.touch,
      hasTouch: vp.touch,
      storageState: "tests/e2e/.auth/client-admin.json",
    });
    const page = await ctx.newPage();
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const cut = await clippedRailLabels(page);

    expect(cut, "панель разделов не видна").not.toBeNull();
    expect(cut, `обрезанные подписи: ${cut?.join("; ")}`).toEqual([]);
    await ctx.close();
  });
}
