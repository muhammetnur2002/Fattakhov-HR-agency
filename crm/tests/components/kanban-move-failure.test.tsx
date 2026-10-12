// @vitest-environment jsdom
/**
 * Перенос карточки на доске при сбое сети.
 *
 * Карточка двигается сразу, не дожидаясь сервера. Пока сеть не отвечает,
 * действие не возвращает «отказ», а бросает исключение; обработчика не было, и карточка
 * оставалась в новой колонке, хотя на сервере её там нет, а страница уходила в экран
 * «Что-то пошло не так». Теперь карточка возвращается на место и появляется сообщение.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { moveStageAction, moveStageBulkAction, toast } = vi.hoisted(() => ({
  moveStageAction: vi.fn(),
  moveStageBulkAction: vi.fn(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("@/app/(agency)/a/candidates/actions", () => ({ moveStageAction, moveStageBulkAction }));
vi.mock("@/app/actions/decisions", () => ({ decideAction: vi.fn(), undoRejectAction: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { KanbanBoard } from "@/components/kanban/kanban-board";
import type { KanbanCard, KanbanStage } from "@/components/kanban/types";

beforeAll(() => {
  // Меню Radix замеряет себя наблюдателем размера, которого в jsdom нет
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  // Выпадающий список Radix спрашивает у элемента захват указателя, которого в jsdom нет
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  moveStageAction.mockReset();
  moveStageBulkAction.mockReset();
  toast.error.mockReset();
});

afterEach(cleanup);

const stages: KanbanStage[] = [
  { id: "s1", code: "LONGLIST", name: "Лонг-лист", order: 1, visibleToClient: false, slaHours: null },
  { id: "s2", code: "SCREENING", name: "Скрининг", order: 2, visibleToClient: false, slaHours: null },
];

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
    currentPosition: null,
    currentCompany: null,
    city: null,
    salaryExpectation: null,
    consentStatus: "GIVEN",
  },
  _count: { comments: 0 },
};

/**
 * Этап карточки — по меню «Переместить на этап»: в нём нет текущего этапа.
 * Так проверяется то, что видит человек, а не внутреннее состояние доски.
 */
async function stageNamesOfferedByMenu() {
  const user = userEvent.setup();
  const trigger = screen.getAllByRole("button", { name: "Переместить на этап" })[0];
  trigger.focus();
  await user.keyboard("{Enter}");
  const names = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
  return names;
}

async function moveTo(stageName: string) {
  const user = userEvent.setup();
  const trigger = screen.getAllByRole("button", { name: "Переместить на этап" })[0];
  trigger.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: stageName }));
}

describe("перенос карточки при сбое связи", () => {
  it("сеть не ответила: карточка возвращается на прежний этап и появляется сообщение", async () => {
    moveStageAction.mockRejectedValue(new Error("Failed to fetch"));
    render(<KanbanBoard stages={stages} cards={[card]} hrefBase="/a/vacancies/v1/candidates" draggable now={Date.parse("2026-10-09T10:00:00Z")} />);

    expect(await stageNamesOfferedByMenu()).toEqual(["Скрининг"]);
    await moveTo("Скрининг");

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toMatch(/Не удалось перенести кандидата/);
    expect(moveStageAction).toHaveBeenCalledWith({ applicationId: "app1", toStageId: "s2" });
    // Карточка там, где и была: в меню снова «Скрининг», а не «Лонг-лист»
    await waitFor(async () => expect(await stageNamesOfferedByMenu()).toEqual(["Скрининг"]));
  });

  it("отказ сервера работает как прежде: карточка на месте, текст отказа в сообщении", async () => {
    moveStageAction.mockResolvedValue({ error: "Нужно резюме" });
    render(<KanbanBoard stages={stages} cards={[card]} hrefBase="/a/vacancies/v1/candidates" draggable now={Date.parse("2026-10-09T10:00:00Z")} />);

    await moveTo("Скрининг");

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Нужно резюме"));
    await waitFor(async () => expect(await stageNamesOfferedByMenu()).toEqual(["Скрининг"]));
  });

  it("сбой связи при переводе пачкой: карточки возвращаются, сообщение одно", async () => {
    moveStageBulkAction.mockRejectedValue(new Error("Failed to fetch"));
    render(
      <KanbanBoard
        stages={stages}
        cards={[card]}
        hrefBase="/a/vacancies/v1/candidates"
        draggable
        bulkEnabled
        now={Date.parse("2026-10-09T10:00:00Z")}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("checkbox", { name: "Выбрать Иван Петров" })[0]);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Скрининг" }));
    await user.click(screen.getByRole("button", { name: "Перевести" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(moveStageBulkAction).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await stageNamesOfferedByMenu()).toEqual(["Скрининг"]));
  });
});
