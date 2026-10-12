/**
 * Кнопка, которая делает дело, показывает, что она его делает.
 *
 * Сверка 11.10.2026: после перевода кабинета на `Button loading` и `SubmitButton` (08.10) осталось
 * ещё ~33 кнопки вида `<Button …>{pending ? "Сохраняем…" : "Сохранить"}</Button>` без `loading`
 * и ~22 кнопки `type="submit"` вне `SubmitButton`: у них только блеклый `disabled` — ни индикатора,
 * ни `aria-busy`, неотличимо от недоступной. Тест не даёт появиться новым.
 *
 * - подпись, меняющаяся по состоянию («идёт»), — только вместе с `loading`;
 * - кнопка отправки формы — `SubmitButton` (берёт состояние у формы, а для формы, что уходит через
 *   `onSubmit` и `startTransition`, — `loading={pending}`).
 */
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxTags, read, sources } from "./helpers/jsx-source";

const FILES = [...sources("app"), ...sources("components")].filter((f) => !f.includes("components/ui/"));

/** Исключения: кнопки отправки, которым `SubmitButton` не подходит (у каждой своя причина). */
const SUBMIT_EXCEPTIONS = new Map<string, string>([
  [
    "components/shell/user-menu.tsx",
    "пункт выпадающего меню «Выйти»: Radix рисует его как строку меню (DropdownMenuItem asChild), рамка и высота Button здесь чужие; выход — мгновенный переход",
  ],
]);

/** Подпись зависит от состояния «идёт»: `{pending ? "…" : "…"}`, `{saving ? …}`, `{busy ? …}`. */
// Второй вариант — по троеточию в подписи: `{addingId === c.id ? "Добавляем…" : "Добавить"}` не называет
// состояние «pending/busy», но ветка с «…» и есть подпись «идёт работа» (замечание проверки 11.10).
const BUSY_TERNARY =
  /\{\s*!?\s*(?:pending|isPending|busy|loading|[a-z]+ing)\s*\?\s*["'`]|\?\s*["'`][^"'`{}]*(?:…|\.\.\.)["'`]\s*:/i;

function buttonBody(text: string, tag: { index: number; text: string; name: string }): string {
  const from = tag.index + tag.text.length;
  const end = text.indexOf(`</${tag.name}>`, from);
  return end < 0 ? "" : text.slice(from, end);
}

describe("кнопки показывают, что идёт работа", () => {
  it("подпись по состоянию «идёт» — только с loading", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = read(file);
      for (const tag of jsxTags(text, "Button")) {
        if (/\bloading\b/.test(tag.text)) continue;
        if (BUSY_TERNARY.test(buttonBody(text, tag))) {
          offenders.push(`${relative(".", file)}:${tag.line}  <Button> с подписью по состоянию, но без loading`);
        }
      }
    }
    expect(offenders, "добавьте loading={…}: спиннер, aria-busy, полный цвет").toEqual([]);
  });

  it("type=\"submit\" — только через SubmitButton (кроме явного списка)", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      if (SUBMIT_EXCEPTIONS.has(file)) continue;
      for (const tag of jsxTags(read(file), "Button|button")) {
        if (/\btype="submit"/.test(tag.text)) {
          offenders.push(`${relative(".", file)}:${tag.line}  <${tag.name} type="submit"> — взять SubmitButton`);
        }
      }
    }
    expect(offenders, "components/ui/submit-button.tsx: indicator, pendingLabel, защита от двойного нажатия").toEqual([]);
  });

  it("исключения — не пустые слова: файл существует и кнопка в нём ещё есть", () => {
    for (const [file, reason] of SUBMIT_EXCEPTIONS) {
      expect(reason.length, `у исключения ${file} нет причины`).toBeGreaterThan(20);
      const has = jsxTags(read(file), "Button|button").some((t) => /\btype="submit"/.test(t.text));
      expect(has, `${file}: исключение устарело — кнопки type="submit" там больше нет`).toBe(true);
    }
  });

  it("разбор видит и подпись с троеточием при условии вида `id === x`", () => {
    const src = `<Button type="button" disabled={addingId === c.id} onClick={run}>{addingId === c.id ? "Добавляем…" : "Добавить"}</Button>`;
    const [tag] = jsxTags(src, "Button");
    expect(BUSY_TERNARY.test(buttonBody(src, tag))).toBe(true);
    expect(/\bloading\b/.test(tag.text)).toBe(false);
  });

  it("разбор видит подпись по состоянию и отсутствие loading", () => {
    const src = `<Button type="button" disabled={pending} onClick={run}>{pending ? "Удаляем…" : "Да"}</Button>`;
    const [tag] = jsxTags(src, "Button");
    expect(BUSY_TERNARY.test(buttonBody(src, tag))).toBe(true);
    expect(/\bloading\b/.test(tag.text)).toBe(false);
  });
});
