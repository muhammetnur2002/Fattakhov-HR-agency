// @vitest-environment jsdom
/**
 * «Посадить в вакансию» на карточке кандидата: поиск по списку, вакансии, где человек
 * уже сидит, недоступны, а «Посадить» отдаёт действию выбранную вакансию.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const seat = vi.hoisted(() => vi.fn());
vi.mock("@/app/(agency)/a/candidates/seat-actions", () => ({ seatInVacancyAction: seat }));

import { SeatInVacancy } from "@/components/candidates/seat-in-vacancy";

afterEach(() => {
  cleanup();
  seat.mockReset();
});

const vacancies = [
  { id: "v2", label: "№2 Товаровед · Старфиш" },
  { id: "v3", label: "№3 Инженер-электронщик · Технопарк" },
];
const taken = [{ id: "v1", label: "№1 Руководитель отдела продаж · Старфиш", stage: "Скрининг рекрутера" }];

function open() {
  render(
    <SeatInVacancy candidateId="c1" candidateName="Анна Веретенникова" vacancies={vacancies} taken={taken} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Посадить в вакансию/ }));
}

describe("SeatInVacancy", () => {
  it("«Посадить» недоступна, пока вакансия не выбрана; «уже здесь» не выбирается", () => {
    open();
    expect(screen.getByRole("button", { name: "Посадить" })).toBeDisabled();
    expect(screen.getByText(/Уже в этой вакансии · Скрининг рекрутера/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /№1 .*уже в этой вакансии/i })).toBeDisabled();
  });

  it("поиск сужает список по номеру и клиенту", () => {
    open();
    fireEvent.change(screen.getByLabelText("Поиск вакансии"), { target: { value: "технопарк" } });
    expect(screen.queryByText("№2 Товаровед · Старфиш")).toBeNull();
    expect(screen.getByText("№3 Инженер-электронщик · Технопарк")).toBeTruthy();
  });

  it("выбранная вакансия уходит в действие вместе с кандидатом", async () => {
    seat.mockResolvedValue({ ok: "Кандидат добавлен в воронку" });
    open();
    fireEvent.click(screen.getByText("№2 Товаровед · Старфиш"));
    fireEvent.click(screen.getByRole("button", { name: "Посадить" }));
    await waitFor(() => expect(seat).toHaveBeenCalledWith({ candidateId: "c1", vacancyId: "v2" }));
  });

  it("отказ сервера показывается в окне, окно остаётся открытым", async () => {
    seat.mockResolvedValue({ error: "Этот кандидат уже в воронке этой вакансии" });
    open();
    fireEvent.click(screen.getByText("№2 Товаровед · Старфиш"));
    fireEvent.click(screen.getByRole("button", { name: "Посадить" }));
    expect(await screen.findByText("Этот кандидат уже в воронке этой вакансии")).toBeTruthy();
  });
});
