// @vitest-environment jsdom
/**
 * Карточка кандидата на доске: ссылка, меню и галочка выбора должны быть доступны диктору.
 *
 * dnd-kit по умолчанию делает из всей карточки role="button" с aria-disabled="true", если
 * перетаскивание выключено (кабинет клиента). Вложенные ссылка и галочка тогда читались
 * недоступными. Датчика клавиатуры на доске нет, так что и обещание «пробел поднимает
 * карточку» было неправдой.
 */
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CandidateCard } from "@/components/kanban/candidate-card";
import type { KanbanCard, KanbanStage } from "@/components/kanban/types";

afterEach(cleanup);

const stage: KanbanStage = {
  id: "s1",
  code: "LONGLIST",
  name: "Лонг-лист",
  order: 1,
  visibleToClient: true,
  slaHours: null,
};

const card: KanbanCard = {
  id: "app1",
  stageId: "s1",
  stageEnteredAt: new Date("2026-10-01T10:00:00Z"),
  outcome: "IN_PROGRESS",
  presentedAt: null,
  presentationSummary: null,
  rejectionReason: null,
  rejectedBy: null,
  clientDecision: null,
  candidate: {
    id: "c1",
    fullName: "Иван Петров",
    currentPosition: "Менеджер",
    currentCompany: "Ромашка",
    city: "Казань",
    salaryExpectation: null,
    consentStatus: "GIVEN",
  },
  _count: { comments: 0 },
};

function renderCard(draggable: boolean) {
  return render(
    <DndContext>
      <SortableContext items={[card.id]}>
        <CandidateCard
          card={card}
          stage={stage}
          allStages={[stage]}
          hrefBase="/vacancies/v1/candidates"
          draggable={draggable}
          selectable
          selected={false}
          onToggleSelect={() => {}}
          onMoveToStage={() => {}}
          now={Date.parse("2026-10-09T10:00:00Z")}
        />
      </SortableContext>
    </DndContext>,
  );
}

describe("карточка кандидата", () => {
  for (const draggable of [false, true]) {
    it(`${draggable ? "перетаскиваемая" : "неподвижная"}: не превращается в одну недоступную кнопку`, () => {
      renderCard(draggable);
      const link = screen.getByRole("link", { name: "Иван Петров" });
      const checkbox = screen.getByRole("checkbox", { name: "Выбрать Иван Петров" });

      const root = link.closest("div.rounded-md") as HTMLElement;
      expect(root.hasAttribute("role")).toBe(false);
      expect(root.hasAttribute("tabindex")).toBe(false);
      expect(root.hasAttribute("aria-roledescription")).toBe(false);
      expect(root.hasAttribute("aria-describedby")).toBe(false);

      // Ни карточка, ни её предки не объявляют внутренности недоступными
      expect(link.closest('[aria-disabled="true"]')).toBeNull();
      expect(checkbox.closest('[aria-disabled="true"]')).toBeNull();
    });
  }
});
