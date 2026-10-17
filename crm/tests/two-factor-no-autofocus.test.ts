import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "components/settings/two-factor.tsx"), "utf8");

/** Текст элемента <Input …/> с данным id: от `<Input` до ближайшего `/>` */
function inputWithId(id: string): string {
  const at = source.indexOf(`id="${id}"`);
  expect(at, `поле ${id} есть в разметке`).toBeGreaterThan(-1);
  const start = source.lastIndexOf("<Input", at);
  const end = source.indexOf("/>", at);
  return source.slice(start, end + 2);
}

describe("двухфакторная защита в настройках: автофокус", () => {
  it("поле «Текущий пароль» стоит на странице сразу и не берёт фокус при открытии настроек", () => {
    const field = inputWithId("proof");
    // Голый autoFocus прокручивал «Настройки» клиента к карточке 2FA и прятал панель разделов
    expect(field).not.toMatch(/\bautoFocus\s*(?:\/|\n|$)/);
    expect(field).toMatch(/autoFocus=\{usesSms\}/);
  });

  it("поле кода из приложения берёт фокус: оно появилось по нажатию человека", () => {
    expect(inputWithId("totp-code")).toMatch(/\bautoFocus\b/);
  });
});
