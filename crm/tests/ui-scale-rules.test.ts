/**
 * Правила шкалы интерфейса, которые проще проверить по исходникам, чем в браузере.
 *
 * 1. Нет произвольных размеров шрифта (`text-[13px]`): размер берётся
 *    только из ступеней шкалы (xs, sm, base, lg, 2xl, 4xl). Лишние
 *    размеры и были «кучей разных кеглей на одной вкладке».
 *    Исключения: подписи вкладок нижней панели (10px, на экранах до 350px —
 *    9px), подписи узкой панели разделов на планшете и временная отладочная
 *    строка панели разделов (9px, не интерфейс продукта).
 *    Витрина сайта (маркетинг) живёт по своей шкале и здесь не проверяется.
 * 2. У CardContent нет своих отступов: вертикальный отступ карточки даёт
 *    сама Card, а чужой pt-6 или p-4 складывался с ним — сверху 50px,
 *    снизу 20px, и ещё четыре разных отступа у карточек одного вида.
 *    Не считаются пустые состояния (text-center) и полосные таблицы (p-0).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return e.name === "marketing" || e.name === "(marketing)" ? [] : sources(rel);
    return e.name.endsWith(".tsx") ? [rel] : [];
  });
}

const FILES = [...sources("app"), ...sources("components")];

describe("шкала текста в исходниках", () => {
  it("нет произвольных размеров шрифта вне шкалы", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      readFileSync(join(ROOT, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/(?<![\w:-])((?:[\w-]+:)*)text-\[[0-9.]+(?:px|rem)\]/g)) {
            // единственное исключение — подписи вкладок нижней панели: при 12px
            // «Кандидаты» и «Сообщения» слипаются (зазор 2,7px при норме 3px)
            if (file.endsWith("bottom-tabs.tsx") && ["text-[10px]", "max-[350px]:text-[9px]"].includes(m[0])) continue;
            // и подписи узкой панели разделов на планшете: стандартные 17,5px на мыши в неё не влезают
            if (file.endsWith("icon-rail.tsx") && m[0] === "text-[12px]") continue;
            // и временная отладочная строка панели разделов (components/shell/tabbar-debug.tsx): это не интерфейс
            // продукта, а инструмент владельца на телефоне; 12px вытянули бы её на четверть экрана. Удаляется вместе с ней
            if (file.endsWith("tabbar-debug.tsx") && m[0] === "text-[9px]") continue;
            offenders.push(`${relative(".", file)}:${i + 1}  ${m[0]}`);
          }
        });
    }
    expect(offenders, "замените на text-xs (подпись) или text-sm (текст)").toEqual([]);
  });
});

describe("отступы карточек", () => {
  it("у CardContent нет своих отступов — только отступ самой карточки", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const m of text.matchAll(/<CardContent\b[^>]*?className=("[^"]*"|\{`[^`]*`\})/g)) {
        const classes = m[1];
        if (/text-center|\bp-0\b|\bpx-0\b|\bpy-0\b/.test(classes)) continue;
        if (/(?<![\w-])(p|px|py|pt|pb)-(\d|\[)/.test(classes)) {
          offenders.push(`${relative(".", file)}  ${classes.replace(/\s+/g, " ").slice(0, 90)}`);
        }
      }
    }
    expect(offenders, "уберите p-N, py-N, pt-N у CardContent: отступ даёт Card").toEqual([]);
  });

  it("у самой Card, CardHeader и CardFooter нет своих вертикальных отступов: верх равен низу", () => {
    // Свой pt-/pb-/py-/p-/m* у обёртки карточки ломает симметрию, которую держит --card-spacing
    const offenders: string[] = [];
    for (const file of FILES) {
      if (file.endsWith("components/ui/card.tsx")) continue;
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const m of text.matchAll(/<(Card|CardHeader|CardFooter)\b[^>]*?className=("[^"]*"|\{`[^`]*`\})/g)) {
        if (/(?<![\w-])(p|py|pt|pb|my|mt|mb)-(\d|\[|\()/.test(m[2].replace(/(?:data-|group-|has-|\[)[^\s"]*/g, ""))) {
          offenders.push(`${relative(".", file)}  <${m[1]} ${m[2].replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }
    expect(offenders, "отступ Card даёт --card-spacing; убери вертикальные p-/m- у обёртки").toEqual([]);
  });
});

describe("отступы витрины сайта", () => {
  it("нет произвольных отступов в пикселях: только ступени Tailwind", () => {
    // Сверка 08.10.2026: на витрине 31 из 331 отступа — полушаги 0.5/1.5/2.5/3.5
    // (2/6/10/14px). Это ступени самого Tailwind, а не выдумка в пикселях; такие
    // допуски принимаем, а вот p-[13px], gap-[18px] — нет: их нет вовсе, и тест
    // держит это так.
    const offenders: string[] = [];
    for (const file of FILES) {
      if (!file.startsWith("app/(marketing)") && !file.includes("components/marketing/")) continue;
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const m of text.matchAll(/(?<![\w-])(?:-?m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-\[\d+(?:\.\d+)?px\]/g)) {
        offenders.push(`${relative(".", file)}  ${m[0]}`);
      }
    }
    expect(offenders, "отступ — ступенью Tailwind (p-4), а не в пикселях").toEqual([]);
  });
});
