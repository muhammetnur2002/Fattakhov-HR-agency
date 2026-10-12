// @vitest-environment jsdom
/**
 * «+ Посадить сюда» в колонке воронки: кнопка только там, куда сервер разрешает
 * сажать (внутренние этапы), и клик отдаёт именно этот этап.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/actions/decisions", () => ({
  decideAction: vi.fn(),
  undoRejectAction: vi.fn(),
}));
vi.mock("@/app/(agency)/a/candidates/actions", () => ({
  moveStageAction: vi.fn(),
  moveStageBulkAction: vi.fn(),
}));

import { KanbanBoard } from "@/components/kanban/kanban-board";
import type { KanbanStage } from "@/components/kanban/types";

// Доска следит за шириной через ResizeObserver, которого в jsdom нет
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

const stages: KanbanStage[] = [
  { id: "s1", code: "LONGLIST", name: "Лонг-лист", order: 1, visibleToClient: false, slaHours: null },
  { id: "s2", code: "SCREENING", name: "Скрининг", order: 2, visibleToClient: false, slaHours: null },
  { id: "s3", code: "PRESENTED", name: "Представлен", order: 3, visibleToClient: true, slaHours: null },
];

function renderBoard(onSeatHere?: (stageId: string) => void) {
  return render(
    <KanbanBoard
      stages={stages}
      cards={[]}
      hrefBase="/a/applications"
      draggable
      seatStageIds={["s1", "s2"]}
      onSeatHere={onSeatHere}
      now={Date.UTC(2026, 9, 11)}
    />,
  );
}

describe("KanbanBoard: «Посадить сюда»", () => {
  it("кнопка есть только у внутренних этапов, клик отдаёт этап колонки", () => {
    const onSeatHere = vi.fn();
    renderBoard(onSeatHere);

    // Телефонный список идёт в разметке первым (одна кнопка для его активного
    // этапа), затем доска: по кнопке на каждую из двух внутренних колонок
    const buttons = screen.getAllByRole("button", { name: /Посадить сюда/ });
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[2]);
    expect(onSeatHere).toHaveBeenCalledWith("s2");
  });

  it("без обработчика кнопок нет, доска выглядит как раньше", () => {
    renderBoard(undefined);
    expect(screen.queryByRole("button", { name: /Посадить сюда/ })).toBeNull();
  });
});
