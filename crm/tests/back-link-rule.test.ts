/**
 * Ссылка «назад» над заголовком страницы — это `BackLink`, а не очередная копия.
 *
 * Сверка 11.10.2026: после перевода 21 копии на `BackLink` (08.10) остались две голые ссылки
 * в разделе «Студенты» кабинета клиента (`text-sm text-muted-foreground` со стрелкой своего размера)
 * и страница сотрудника в аналитике, повторившая стрелку вручную. Тест не даёт вернуть:
 * `<Link>` и `<a>` со стрелкой влево или словом «Назад» внутри — только из списка исключений.
 */
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxTags, read, sources } from "./helpers/jsx-source";

const FILES = [...sources("app"), ...sources("components")].filter((f) => f !== "components/ui/back-link.tsx");

/** Ссылки со стрелкой влево, которые не «назад на уровень выше». */
const ALLOWED = new Map<string, string>([
  ["app/(client)/messages/[userId]/page.tsx", "значок без подписи в шапке диалога на телефоне (md:hidden), aria-label «К списку диалогов»"],
  ["app/(agency)/a/messages/[userId]/page.tsx", "значок без подписи в шапке диалога на телефоне (md:hidden), aria-label «К списку диалогов»"],
  ["app/(agency)/a/reviews/students/page.tsx", "«Назад» в постраничном переключении — предыдущая страница списка, а не уровень выше"],
]);

const HAND_MADE_BACK = /ArrowLeft(?:Icon)?\b|>\s*Назад\s*</;

function handMadeBackLinks(file: string): number[] {
  const text = read(file);
  const lines: number[] = [];
  for (const tag of jsxTags(text, "Link|a")) {
    const from = tag.index + tag.text.length;
    const end = text.indexOf(`</${tag.name}>`, from);
    if (end >= 0 && HAND_MADE_BACK.test(text.slice(from, end))) lines.push(tag.line);
  }
  return lines;
}

describe("ссылка «назад»", () => {
  it("нет ссылок со стрелкой влево или словом «Назад» вне BackLink", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      if (ALLOWED.has(file)) continue;
      for (const line of handMadeBackLinks(file)) offenders.push(`${relative(".", file)}:${line}`);
    }
    expect(offenders, "components/ui/back-link.tsx: <BackLink href=…>Куда</BackLink>").toEqual([]);
  });

  it("исключения не устарели: ссылка со стрелкой там ещё есть", () => {
    for (const [file, reason] of ALLOWED) {
      expect(reason.length).toBeGreaterThan(20);
      expect(handMadeBackLinks(file).length, `${file}: исключение устарело`).toBeGreaterThan(0);
    }
  });

  it("буква-стрелка «←» в разметке не используется (плавает по высоте строки)", () => {
    const bad = FILES.filter((f) => /^[^/*\n]*[>"'`{ ]←[ <"'`}]/m.test(read(f))).map((f) => relative(".", f));
    expect(bad).toEqual([]);
  });
});
