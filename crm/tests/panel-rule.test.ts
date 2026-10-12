/**
 * Рамка с отступом — это Panel, а не очередная копия классов.
 *
 * Сверка 08.10.2026 насчитала около 40 самодельных `rounded-md|lg|xl border p-N`
 * в 30 файлах: пять радиусов, девять отступов. Тест не даёт появиться новой:
 * блок с рамкой, скруглением и своим p-N вне components/ui — только из списка
 * намеренных исключений (у каждого своя роль, не врезка внутри карточки).
 */
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { hasClass, jsxTags, read, sources } from "./helpers/jsx-source";

/** Намеренные исключения: у каждого своя роль. */
const ALLOWED = new Set([
  "components/client/contract-gate.tsx", // окно-заслон поверх страницы
  "components/consent/consent-form.tsx", // прокручиваемый текст согласия
  "components/consent/disclosure-form.tsx", // прокручиваемый текст согласия
  "components/kanban/compare-view.tsx", // колонка сравнения
  "components/kanban/kanban-board.tsx", // подсказка при перетаскивании
  "components/settings/two-factor.tsx", // рамка QR-кода на белом (подсказка — Panel)
  "app/(agency)/a/analytics/page.tsx", // ссылка-плитка со счётчиком
  "app/(agency)/a/reviews/students/page.tsx", // ссылка-плитка раздела
  "components/comments/comment-thread.tsx", // пузырь комментария
  "components/students/student-candidate-panel.tsx", // пузырь сообщения в беседе (цвет по автору)
  "components/kanban/candidate-card.tsx", // карточка кандидата на доске: тянется мышью и пальцем
  "components/consent/disclosure-form.tsx", // прокручиваемый текст согласия (перечень данных — Panel)
  "components/shell/bottom-tabs.tsx", // плавающая нижняя панель
]);

describe("врезки с рамкой", () => {
  it("рамка с p-N вне списка исключений — только Panel", () => {
    const offenders: string[] = [];
    for (const file of [...sources("app"), ...sources("components")]) {
      if (file.startsWith("app/(marketing)") || file.includes("components/marketing/") || file.includes("components/ui/") || file.includes("components/audit/")) continue;
      if (ALLOWED.has(file)) continue;
      // Теги читаются по скобкам: `=>` и `>` внутри `{…}` не обрывают тег раньше className
      // (так `<form onSubmit={() => …} className="… rounded-md border p-3">` прошёл мимо).
      for (const tag of jsxTags(read(file))) {
        const cls = tag.classes;
        if (
          hasClass(cls, /^rounded-(md|lg|xl|2xl|\[)/) &&
          hasClass(cls, /^border$/) &&
          hasClass(cls, /^p-\d/)
        ) {
          offenders.push(`${relative(".", file)}:${tag.line}  ${cls.slice(0, 80)}`);
        }
      }
    }
    expect(offenders, "блок с рамкой и отступом — <Panel> (тон: plain / muted / accent / danger)").toEqual([]);
  });

  it("разбор тегов видит className после стрелки `=>` в пропсах", () => {
    // Сторож самого сторожа: до правки regex `[^<>]*?` обрывался на `=>`.
    const [tag] = jsxTags(
      `<form action={formAction} onSubmit={() => (last.current = "REJECT")} className="space-y-4 rounded-md border p-3">`,
    );
    expect(tag.classes).toBe("space-y-4 rounded-md border p-3");
  });
});
