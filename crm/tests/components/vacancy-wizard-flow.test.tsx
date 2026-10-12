// @vitest-environment jsdom
/**
 * Мастер заявки: число человек, шаг в адресе и предупреждение о несохранённом.
 *
 * Пустое «Сколько человек нужно» уходило на сервер как 0 с безымянным «Минимум 1», а черновик
 * тихо переставал сохраняться. Шаг жил только в состоянии: «Назад» браузера выводил из мастера
 * целиком, а закрытие вкладки теряло правки последних секунд без предупреждения.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveDraftAction, submitVacancyAction, search } = vi.hoisted(() => ({
  saveDraftAction: vi.fn(),
  submitVacancyAction: vi.fn(),
  search: { current: "" },
}));
vi.mock("@/app/actions/vacancies", () => ({ saveDraftAction, submitVacancyAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.current),
  // useStaleGuard: «устаревшей вкладки» в этих сценариях нет
  unstable_isUnrecognizedActionError: () => false,
}));

import { headcountProblem, VacancyWizard } from "@/components/vacancies/vacancy-wizard";

beforeEach(() => {
  saveDraftAction.mockReset();
  saveDraftAction.mockResolvedValue({ vacancyId: "vac_1", savedAt: new Date().toISOString() });
  search.current = "";
  window.history.replaceState(null, "", "/vacancies/new");
});

const wizard = (props: Partial<React.ComponentProps<typeof VacancyWizard>> = {}) =>
  render(<VacancyWizard hiringManagers={[]} initialValues={{ title: "Логист" }} {...props} />);

describe("число человек", () => {
  it("правило: целое от 1 до 500", () => {
    for (const ok of ["1", "20", "500"]) expect(headcountProblem(ok)).toBeUndefined();
    for (const bad of ["", " ", "0", "501", "-3", "2.5", "abc"]) expect(headcountProblem(bad)).toBeTruthy();
  });

  it("очищенное поле останавливает «Далее» и называется по имени", () => {
    wizard();
    fireEvent.change(screen.getByLabelText(/Сколько человек нужно/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByText(/Сколько человек нужно: укажите число от 1 до 500/)).toBeTruthy();
    // шаг не сменился: «Назад» не появилась
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
    const input = screen.getByLabelText(/Сколько человек нужно/) as HTMLInputElement;
    expect(input.min).toBe("1");
    expect(input.max).toBe("500");
  });

  it("явно неверное число подписано у поля сразу", () => {
    wizard();
    fireEvent.change(screen.getByLabelText(/Сколько человек нужно/), { target: { value: "501" } });
    expect(screen.getAllByText("Укажите число от 1 до 500").length).toBeGreaterThan(0);
  });
});

describe("шаг в адресе", () => {
  it("переход вперёд записывает ?step= в адрес, не удаляя остальное", () => {
    window.history.replaceState(null, "", "/vacancies/new?clientId=c1");
    wizard();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(window.location.search).toContain("step=2");
    expect(window.location.search).toContain("clientId=c1");
  });

  it("«Назад» браузера возвращает на прошлый шаг мастера", () => {
    wizard();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("button", { name: "Назад" })).toBeTruthy();
    window.history.replaceState(null, "", "/vacancies/new?step=1");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });

  it("у сохранённого черновика шаг из адреса восстанавливается; у новой заявки — нет", () => {
    search.current = "step=3";
    const draft = wizard({ initialVacancyId: "vac_1" });
    expect(screen.getByRole("button", { name: "Назад" })).toBeTruthy();
    draft.unmount();

    const fresh = wizard();
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
    fresh.unmount();

    search.current = "step=99";
    wizard({ initialVacancyId: "vac_1" });
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });
});

describe("уход со страницы", () => {
  it("несохранённые правки: браузер предупреждает; правок нет — не мешает", () => {
    wizard();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText(/Название позиции/), { target: { value: "Логист-диспетчер" } });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
