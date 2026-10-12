// @vitest-environment jsdom
/**
 * Автосохранение заявки переживает сбой сети.
 *
 * Раньше флаг «идёт сохранение» сбрасывался после ответа, а не в finally: пропавшая
 * сеть бросала исключение, флаг навсегда оставался взведённым, и каждый следующий тик
 * таймера выходил на первой строке. Черновик молча переставал сохраняться, а человек
 * видел прежнее «сохранится автоматически» и продолжал писать.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveDraftAction, submitVacancyAction } = vi.hoisted(() => ({
  saveDraftAction: vi.fn(),
  submitVacancyAction: vi.fn(),
}));
vi.mock("@/app/actions/vacancies", () => ({ saveDraftAction, submitVacancyAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  // useStaleGuard: «устаревшей вкладки» в этих сценариях нет
  unstable_isUnrecognizedActionError: () => false,
}));

import { VacancyWizard } from "@/components/vacancies/vacancy-wizard";

const TICK = 10_000;

beforeEach(() => {
  vi.useFakeTimers();
  saveDraftAction.mockReset();
  window.history.replaceState(null, "", "/vacancies/new");
});

afterEach(() => {
  vi.useRealTimers();
});

const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(TICK);
  });

function typeSomething() {
  render(<VacancyWizard hiringManagers={[]} initialValues={{ title: "Логист" }} />);
  fireEvent.change(screen.getByLabelText(/Сколько человек нужно/), { target: { value: "3" } });
}

describe("автосохранение заявки", () => {
  it("сбой сети: сообщение об этом, а следующий тик повторяет попытку и снимает его", async () => {
    saveDraftAction
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue({ vacancyId: "vac_1", savedAt: new Date().toISOString() });
    typeSomething();

    await tick();
    expect(saveDraftAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось сохранить черновик, повторим");

    // Флаг «идёт сохранение» сброшен: вторая попытка действительно уходит
    await tick();
    expect(saveDraftAction).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Черновик сохранён в/)).toBeTruthy();
  });

  it("несколько сбоев подряд не залипают: каждый тик пробует снова", async () => {
    saveDraftAction.mockRejectedValue(new Error("Failed to fetch"));
    typeSomething();

    await tick();
    await tick();
    await tick();

    expect(saveDraftAction).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось сохранить черновик");
  });

  it("отказ сервера (не сбой связи) показывается как раньше и тоже не залипает", async () => {
    saveDraftAction
      .mockResolvedValueOnce({ error: "Название слишком длинное" })
      .mockResolvedValue({ vacancyId: "vac_1", savedAt: new Date().toISOString() });
    typeSomething();

    await tick();
    expect(screen.getByText("Название слишком длинное")).toBeTruthy();
    expect(screen.queryByText("Не удалось сохранить черновик, повторим")).toBeNull();

    await tick();
    expect(saveDraftAction).toHaveBeenCalledTimes(2);
  });
});
