import { expect, test } from "@playwright/test";

/**
 * Поле личного сообщения растёт с текстом и упирается в предел.
 *
 * Было: Chrome растил поле без предела (кнопка «Отправить» уезжала с экрана),
 * Safari и Firefox не растили вовсе. Теперь высоту ведёт код, field-sizing
 * выключен — одинаково во всех движках, в том числе в этом.
 */
test("растёт по строкам, дальше прокрутка внутри поля, после очистки — снова одна строка", async ({ page }) => {
  await page.goto("/a/messages/usr_head");
  const field = page.getByRole("textbox", { name: "Текст сообщения" });
  await expect(field).toBeVisible();

  const metrics = () =>
    field.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        height: Math.round(el.getBoundingClientRect().height),
        max: Math.round(parseFloat(cs.maxHeight)),
        overflowY: cs.overflowY,
        fieldSizing: (cs as unknown as Record<string, string>).fieldSizing ?? "",
        scrollable: el.scrollHeight > el.clientHeight + 1,
      };
    });

  const empty = await metrics();
  expect(empty.fieldSizing, "CSS field-sizing должен быть выключен: рост ведёт код").not.toBe("content");

  await field.click();
  for (let i = 0; i < 3; i++) await field.pressSequentially(`строка ${i}`).then(() => field.press("Shift+Enter"));
  const three = await metrics();
  expect(three.height).toBeGreaterThan(empty.height);

  for (let i = 0; i < 30; i++) await field.pressSequentially(`строка ${i}`).then(() => field.press("Shift+Enter"));
  const many = await metrics();
  expect(many.height, "поле выросло выше предела").toBeLessThanOrEqual(many.max);
  expect(many.height).toBeGreaterThanOrEqual(many.max - 2);
  expect(many.overflowY).toBe("auto");
  expect(many.scrollable, "за пределом должна быть прокрутка внутри поля").toBe(true);

  await field.fill("");
  const cleared = await metrics();
  expect(cleared.height).toBe(empty.height);
  expect(cleared.overflowY).toBe("hidden");
});
