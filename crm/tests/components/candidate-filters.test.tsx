// @vitest-environment jsdom
/**
 * Поиск и вилка зарплаты кандидатов (components/candidates/candidate-filters.tsx).
 *
 * Замечание независимой проверки к PR #119: таймер на 300 мс срабатывал и при показе страницы и
 * уходил на тот же адрес, а после того как переход получил ожидание, это стало видно — спиннер,
 * затемнение списка и «Список обновлён» на каждом заходе в базу кандидатов.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/a/candidates",
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { CandidateFilters } from "@/components/candidates/candidate-filters";

beforeEach(() => {
  vi.useFakeTimers();
  nav.pathname = "/a/candidates";
  nav.search = "";
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  nav.replace.mockReset();
  localStorage.clear();
});

const search = () => screen.getByRole("textbox", { name: "Поиск по кандидатам" });
const from = () => screen.getByRole("spinbutton", { name: "Зарплата от" });
const to = () => screen.getByRole("spinbutton", { name: "Зарплата до" });

async function settle(ms = 5000) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("поиск и вилка кандидатов при показе страницы", () => {
  it("«голый» адрес и пустые поля: переход не уходит, спиннера нет", async () => {
    render(<CandidateFilters />);
    await settle();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="list-search-pending"]')).toBeNull();
  });

  it("поля равны адресу (?q=…&sf=…&st=…): переход не уходит", async () => {
    nav.search = "q=%D0%90%D0%BD%D0%BD%D0%B0&sf=100000&st=200000";
    render(<CandidateFilters />);
    expect((search() as HTMLInputElement).value).toBe("Анна");
    expect((from() as HTMLInputElement).value).toBe("100000");
    expect((to() as HTMLInputElement).value).toBe("200000");
    await settle();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("страница ?page=2 при показе остаётся на месте: сбрасывать её нужно только новым фильтром", async () => {
    nav.search = "q=%D0%90%D0%BD%D0%BD%D0%B0&page=2";
    render(<CandidateFilters />);
    await settle();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("набранное запоминается, как и раньше, — даже когда переходить некуда", async () => {
    nav.search = "q=%D0%90%D0%BD%D0%BD%D0%B0";
    render(<CandidateFilters />);
    await settle();
    expect(JSON.parse(localStorage.getItem("candidateFilters")!)).toEqual({ q: "Анна", sf: "", st: "" });
  });
});

describe("поиск и вилка кандидатов при вводе", () => {
  it("поиск уходит в адрес один раз после паузы и с первой страницы", async () => {
    nav.search = "page=3";
    render(<CandidateFilters />);
    fireEvent.change(search(), { target: { value: "Иван" } });
    await settle(299);
    expect(nav.replace).not.toHaveBeenCalled();
    await settle(1);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/a/candidates?q=%D0%98%D0%B2%D0%B0%D0%BD", { scroll: false });
  });

  it("вилка зарплаты — тоже в адрес; повторный ввод того же значения второй переход не даёт", async () => {
    render(<CandidateFilters />);
    fireEvent.change(from(), { target: { value: "90000" } });
    await settle(300);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenLastCalledWith("/a/candidates?sf=90000", { scroll: false });

    fireEvent.change(from(), { target: { value: "90001" } });
    fireEvent.change(from(), { target: { value: "90000" } });
    await settle(300);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it("очистили поле, которое было в адресе, — переход без этого параметра", async () => {
    nav.search = "q=%D0%90%D0%BD%D0%BD%D0%B0";
    render(<CandidateFilters />);
    fireEvent.change(search(), { target: { value: "" } });
    await settle(300);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/a/candidates?", { scroll: false });
  });
});
