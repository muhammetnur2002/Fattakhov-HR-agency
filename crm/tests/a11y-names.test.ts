/**
 * Доступные имена: кнопка с одной иконкой читалке не видна, а подпись на английском для
 * русского интерфейса — шум (12.10.2026, сверка a11y-16).
 *
 * Сторож читает исходники: падает в момент правки, а не после жалобы. Живую проверку — axe и
 * дерево доступности на ключевых страницах — делает `tests/e2e/consistency-status-money-settings.spec.ts`.
 */
import { describe, expect, it } from "vitest";
import { jsxTags, read, sources } from "./helpers/jsx-source";

const files = [...sources("app"), ...sources("components")];

/** Закрывающий тег той же сущности: считаем вложенные открытия того же имени. */
function innerOf(text: string, tag: { name: string; index: number; text: string; selfClosing: boolean }): string | null {
  if (tag.selfClosing) return null;
  const open = new RegExp(`(?<![\\w$])<${tag.name.replace(".", "\\.")}(?![\\w.-])`, "g");
  const close = new RegExp(`</${tag.name.replace(".", "\\.")}\\s*>`, "g");
  let depth = 1;
  let pos = tag.index + tag.text.length;
  for (;;) {
    open.lastIndex = pos;
    close.lastIndex = pos;
    const o = open.exec(text);
    const c = close.exec(text);
    if (!c) return null;
    if (o && o.index < c.index) {
      // вложенный тег того же имени: самозакрытый не считаем
      const nested = jsxTags(text.slice(o.index), tag.name)[0];
      if (nested && !nested.selfClosing) depth++;
      pos = o.index + 1;
      continue;
    }
    depth--;
    if (depth === 0) return text.slice(tag.index + tag.text.length, c.index);
    pos = c.index + 1;
  }
}

const NAMED = /\b(aria-label|aria-labelledby|title)=/;

describe("у кнопок и ссылок есть доступное имя", () => {
  it("кнопка или ссылка, где одна иконка и ни слова, подписана aria-label, title или скрытым текстом", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = read(file);
      const icons = new Set(
        [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)].flatMap((m) =>
          m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop() as string).filter(Boolean),
        ),
      );
      if (icons.size === 0) continue;

      for (const tag of jsxTags(text, "Button|button|a|Link|DialogClose|SheetClose|DropdownMenuTrigger|TooltipTrigger")) {
        if (NAMED.test(tag.text)) continue;
        const inner = innerOf(text, tag);
        if (inner === null) continue;
        // Иконки вырезаем; остаётся ли что-то, что может стать словом?
        const withoutIcons = inner.replace(/<([A-Z]\w*)\b[^>]*\/>/g, (whole, name: string) => (icons.has(name) ? "" : whole));
        if (withoutIcons === inner) continue; // иконок нет
        const hasWords = /[A-Za-zА-Яа-яЁё]/.test(withoutIcons.replace(/\{[^}]*\}/g, (x) => (/[A-Za-z]/.test(x) ? "x" : "")));
        if (!hasWords) offenders.push(`${file}:${tag.line} <${tag.name}>`);
      }
    }
    expect(offenders, "кнопка-иконка без aria-label: читалка скажет просто «кнопка»").toEqual([]);
  });

  it("каждый <aside> подписан: на странице сообщений два боковых ориентира, и без имён их не различить", () => {
    // axe: landmark-unique на /a/messages — боковое меню кабинета и список диалогов оба «complementary»
    const offenders: string[] = [];
    for (const file of files) {
      for (const tag of jsxTags(read(file), "aside")) {
        if (!/\baria-label(ledby)?=/.test(tag.text)) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ссылки «Открыть» одинаковые по подписи различаются доступным именем", () => {
    // Три карточки настроек вели в «Открыть»: читалка по списку ссылок слышала три одинаковых слова
    const text = read("components/settings/settings-sections.tsx");
    expect(text).toMatch(/aria-label=\{`\$\{title\}: открыть`\}/);
  });
});

describe("подписи по-русски", () => {
  /** Образцы и бренд — не перевод: адрес почты, ссылка, название агентства, формат файла. */
  const ALLOWED = [/@/, /https?:\/\//, /Fattakhov HR Agency/, /^[A-Z]{2,6}$/, /Excel, SMM/, /QR/];

  it("aria-label, title, alt и подписи скрытого текста не написаны только латиницей", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = read(file);
      for (const m of text.matchAll(/\b(aria-label|title|alt|aria-description)="([^"{}]+)"/g)) {
        const value = m[2];
        if (!/[A-Za-z]{3,}/.test(value) || /[А-Яа-яЁё]/.test(value)) continue;
        if (ALLOWED.some((re) => re.test(value))) continue;
        offenders.push(`${file}: ${m[1]}="${value}"`);
      }
      for (const m of text.matchAll(/className="[^"]*\bsr-only\b[^"]*">([^<{]+)</g)) {
        const value = m[1].trim();
        if (!/[A-Za-z]{3,}/.test(value) || /[А-Яа-яЁё]/.test(value)) continue;
        if (ALLOWED.some((re) => re.test(value))) continue;
        offenders.push(`${file}: sr-only «${value}»`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("тосты (Sonner) говорят по-русски: у контейнера есть своя подпись", () => {
    const text = read("components/ui/sonner.tsx");
    expect(text).toMatch(/containerAriaLabel="Уведомления"/);
    expect(text).toMatch(/closeButtonAriaLabel: "Закрыть"/);
  });
});
