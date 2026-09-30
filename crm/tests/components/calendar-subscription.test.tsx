// @vitest-environment jsdom
/**
 * Подписка на календарь: кнопка «Обновить ссылку» просит подтверждения и только потом обновляет.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const regenerate = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/app/actions/calendar", () => ({ regenerateCalendarLinkAction: regenerate.fn }));

import { CalendarSubscription } from "@/components/interviews/calendar-subscription";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

async function openPanel() {
  render(<CalendarSubscription url="https://crm.example/api/calendar/token.ics" />);
  await userEvent.click(screen.getByRole("button", { name: "Подписаться на календарь" }));
}

describe("обновление ссылки календаря", () => {
  it("просит подтверждения и не обновляет без него", async () => {
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Обновить ссылку" }));
    expect(screen.getByText(/Прежняя ссылка перестанет работать/)).toBeInTheDocument();
    expect(regenerate.fn).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByText(/Прежняя ссылка перестанет работать/)).not.toBeInTheDocument();
    expect(regenerate.fn).not.toHaveBeenCalled();
  });

  it("после подтверждения обновляет и показывает сообщение", async () => {
    regenerate.fn.mockResolvedValue({ ok: "Ссылка обновлена. Прежняя больше не работает." });
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Обновить ссылку" }));
    await userEvent.click(screen.getByRole("button", { name: "Да, обновить" }));
    await waitFor(() => expect(regenerate.fn).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Прежняя больше не работает/)).toBeInTheDocument();
  });
});
