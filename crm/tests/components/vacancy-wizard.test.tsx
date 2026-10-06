// @vitest-environment jsdom
/**
 * Мастер заявки: почему заявка не уходит, должно быть понятно там, где
 * стоит поле.
 *
 * Отправка требует не меньше BRIEF_MIN_CHARS символов в обязанностях
 * и требованиях. Пока это требование не было написано нигде, коротко
 * заполненное поле давало на пятом шаге сообщение «опишите обязанности» —
 * и выглядело как поломка продукта: человек их описал. Тест держит три
 * вещи: счётчик виден во время ввода, попытка отправки возвращает к полю
 * и ничего не шлёт на сервер, а полный бриф уходит.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Серверные действия в jsdom не загрузить (Prisma, "use server"), поэтому
// мокаются до импорта мастера — vi.hoisted поднимает объявление выше
const { saveDraftAction, submitVacancyAction } = vi.hoisted(() => ({
  saveDraftAction: vi.fn(),
  submitVacancyAction: vi.fn(),
}));

vi.mock("@/app/actions/vacancies", () => ({
  saveDraftAction,
  submitVacancyAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { VacancyWizard } from "@/components/vacancies/vacancy-wizard";

const LONG_REQUIREMENTS =
  "Опыт работы в продажах от трёх лет, сегмент B2B, холодные звонки";
const LONG_RESPONSIBILITIES =
  "Планирование маршрутов, работа с водителями, контроль сроков доставки";

function toStep(n: number) {
  for (let i = 1; i < n; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
  }
}

beforeEach(() => {
  saveDraftAction.mockReset();
  submitVacancyAction.mockReset();
  saveDraftAction.mockResolvedValue({
    vacancyId: "vac_1",
    savedAt: new Date().toISOString(),
  });
  submitVacancyAction.mockResolvedValue({});
});

describe("мастер заявки: требования к отправке видны заранее", () => {
  it("во время ввода показывает, сколько символов уже набрано", () => {
    render(
      <VacancyWizard
        hiringManagers={[]}
        initialValues={{ title: "Логист-диспетчер" }}
      />,
    );
    toStep(2);

    fireEvent.change(screen.getByLabelText(/Обязанности/), {
      target: { value: "Продажи" },
    });

    expect(screen.getByText("Пока 7 символов из 30")).toBeInTheDocument();
  });

  it("пустое поле сразу говорит о пороге, а не молчит", () => {
    render(
      <VacancyWizard
        hiringManagers={[]}
        initialValues={{ title: "Логист-диспетчер" }}
      />,
    );
    toStep(2);

    expect(
      screen.getAllByText(/[Нн]ужно не меньше 30 символов/).length,
    ).toBeGreaterThan(0);
  });
});

describe("мастер заявки: отправка", () => {
  it("короткие обязанности не уходят на сервер, а возвращают ко второму шагу", () => {
    render(
      <VacancyWizard
        hiringManagers={[]}
        initialVacancyId="vac_1"
        initialValues={{
          title: "Руководитель отдела продаж",
          responsibilities: "Продажи",
          requirements: LONG_REQUIREMENTS,
        }}
      />,
    );
    toStep(5);

    // На шаге проверки нехватка перечислена до нажатия
    expect(screen.getByText(/Чтобы отправить заявку, не хватает/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отправить в работу" }));

    expect(submitVacancyAction).not.toHaveBeenCalled();
    // Вернулись на второй шаг, к самому полю
    expect(screen.getByLabelText(/Обязанности/)).toBeInTheDocument();
    expect(
      screen.getByText(/Обязанности: пока 7 символов из 30/),
    ).toBeInTheDocument();
  });

  it("полный бриф уходит на сервер", async () => {
    render(
      <VacancyWizard
        hiringManagers={[]}
        initialVacancyId="vac_1"
        initialValues={{
          title: "Руководитель отдела продаж",
          responsibilities: LONG_RESPONSIBILITIES,
          requirements: LONG_REQUIREMENTS,
        }}
      />,
    );
    toStep(5);

    expect(
      screen.queryByText(/Чтобы отправить заявку, не хватает/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отправить в работу" }));

    await waitFor(() => expect(submitVacancyAction).toHaveBeenCalledTimes(1));
  });

  it("если поле назвал сервер, мастер тоже уводит к нему", async () => {
    submitVacancyAction.mockResolvedValue({
      error: "Опишите требования подробнее — нужно не меньше 30 символов",
      field: "requirements",
    });

    render(
      <VacancyWizard
        hiringManagers={[]}
        initialVacancyId="vac_1"
        initialValues={{
          title: "Руководитель отдела продаж",
          responsibilities: LONG_RESPONSIBILITIES,
          requirements: LONG_REQUIREMENTS,
        }}
      />,
    );
    toStep(5);

    fireEvent.click(screen.getByRole("button", { name: "Отправить в работу" }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Требования/)).toBeInTheDocument(),
    );
  });
});
