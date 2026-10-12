// @vitest-environment jsdom
/**
 * Фокус после отказа доходит до плашки, даже когда она стоит ВНЕ формы (замечание проверки PR #120, 12.10.2026).
 *
 * Хук искал плашку только внутри формы (`form.querySelector('[data-form-message="error"]')`). У отказа клиента
 * (`DecisionPanel`), причины закрытия и отмены вакансии (`VacancyStatusActions`, `ClientVacancyActions`), вопроса и
 * сроков по заявке (`VacancyIntake`) `FormMessage` стоит после формы, рядом. При общем отказе без полей
 * («Недостаточно прав», «Слишком частые попытки») цель была `null`: фокус не двигался, а кнопка на время запроса
 * была отключена — фокус слетал на <body>. Теперь плашка получает `ref={messageRef}` из хука.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideAction: vi.fn(),
  clientTransitionAction: vi.fn(),
  agencyTransitionAction: vi.fn(),
  clarifyVacancyAction: vi.fn(),
  estimateVacancyAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_isUnrecognizedActionError: () => false,
}));
vi.mock("@/app/actions/decisions", () => ({ decideAction: mocks.decideAction }));
vi.mock("@/app/actions/vacancies", () => ({
  clientTransitionAction: mocks.clientTransitionAction,
  deleteVacanciesAction: vi.fn(),
}));
vi.mock("@/app/(agency)/a/vacancies/actions", () => ({
  activateVacancyAction: vi.fn(async () => ({})),
  agencyTransitionAction: mocks.agencyTransitionAction,
  assignRecruitersAction: vi.fn(async () => ({})),
  clarifyVacancyAction: mocks.clarifyVacancyAction,
  estimateVacancyAction: mocks.estimateVacancyAction,
  saveAgencyNotesAction: vi.fn(async () => ({})),
}));

import { DecisionPanel } from "@/components/applications/decision-panel";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { VacancyIntake, VacancyStatusActions } from "@/components/vacancies/agency-vacancy-actions";
import { ClientVacancyActions } from "@/components/vacancies/client-vacancy-actions";
import type { FormState } from "@/lib/form-state";
import { useFormAction } from "@/lib/hooks/use-form-action";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.removeAttribute("tabindex");
});

/**
 * Браузер убирает фокус с кнопки, ставшей отключённой (focus fixup): активным становится <body>. jsdom этого
 * не делает, и `blur()` отключённой кнопке не помогает — переносим фокус на <body> вручную.
 */
function dropFocusToBody() {
  document.body.tabIndex = -1;
  document.body.focus();
  expect(document.activeElement).toBe(document.body);
}

const DENIED = { error: "Недостаточно прав" };

describe("плашка вне формы получает фокус после общего отказа", () => {
  it("отказ клиента по кандидату (DecisionPanel)", async () => {
    mocks.decideAction.mockResolvedValue(DENIED);
    const user = userEvent.setup();
    render(<DecisionPanel applicationId="a1" onBehalf={false} currentDecision={null} />);
    await user.click(screen.getByRole("button", { name: "Отказать" }));
    await user.type(screen.getByRole("textbox"), "Не подошёл по опыту");
    await user.click(screen.getByRole("button", { name: "Отказать" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Недостаточно прав");
    await waitFor(() => expect(alert).toHaveFocus());
    // Плашка не внутри формы: именно этот случай хук раньше не находил
    expect(alert.closest("form")).toBeNull();
  });

  it("отмена заявки клиентом (ClientVacancyActions)", async () => {
    mocks.clientTransitionAction.mockResolvedValue(DENIED);
    const user = userEvent.setup();
    render(<ClientVacancyActions vacancyId="v1" status="ACTIVE" canHold canClose />);
    await user.click(screen.getByRole("button", { name: "Отменить заявку" }));
    await user.type(screen.getByRole("textbox"), "Закрыли переводом");
    await user.click(screen.getByRole("button", { name: "Отменить заявку" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert.closest("form")).toBeNull();
  });

  it("закрытие вакансии агентством (VacancyStatusActions)", async () => {
    mocks.agencyTransitionAction.mockResolvedValue(DENIED);
    const user = userEvent.setup();
    render(<VacancyStatusActions vacancyId="v1" status="ACTIVE" />);
    await user.click(screen.getByRole("button", { name: "Закрыть без найма" }));
    await user.type(screen.getByRole("textbox"), "Клиент заморозил найм");
    await user.click(screen.getByRole("button", { name: "Закрыть" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert.closest("form")).toBeNull();
  });

  it("вопрос по заявке и сроки (VacancyIntake): у каждой формы своя плашка", async () => {
    mocks.clarifyVacancyAction.mockResolvedValue({ error: "Вопрос не отправлен" });
    mocks.estimateVacancyAction.mockResolvedValue({ error: "Сроки не сохранены" });
    const user = userEvent.setup();
    render(<VacancyIntake vacancyId="v1" status="SUBMITTED" />);

    await user.click(screen.getByRole("button", { name: "Задать вопросы" }));
    await user.type(screen.getByRole("textbox"), "Какой бюджет?");
    await user.click(screen.getByRole("button", { name: "Отправить вопрос" }));
    const clarify = await screen.findByText("Вопрос не отправлен");
    await waitFor(() => expect(clarify.closest("[data-form-message]")).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Назвать сроки" }));
    fireEvent.change(screen.getByLabelText("Первые кандидаты к"), { target: { value: "2026-11-01" } });
    await user.click(screen.getByRole("button", { name: "Отправить клиенту" }));
    const estimate = await screen.findByText("Сроки не сохранены");
    await waitFor(() => expect(estimate.closest("[data-form-message]")).toHaveFocus());
  });
});

describe("useFormAction: фокус, когда деваться ему некуда", () => {
  type Action = (prev: FormState, data: FormData) => Promise<FormState>;

  function Beside({ action }: { action: Action }) {
    const { state, pending, formProps, messageRef } = useFormAction(action, {});
    return (
      <div>
        <form {...formProps} aria-label="Форма">
          <input name="name" aria-label="Имя" />
          <SubmitButton loading={pending}>Сохранить</SubmitButton>
        </form>
        <FormMessage ref={messageRef} error={state.error} ok={state.ok} />
      </div>
    );
  }

  it("без ссылки плашка вне формы не получает фокус (контроль: что было)", async () => {
    function NoRef({ action }: { action: Action }) {
      const { state, pending, formProps } = useFormAction(action, {});
      return (
        <div>
          <form {...formProps}>
            <input name="name" aria-label="Имя" />
            <SubmitButton loading={pending}>Сохранить</SubmitButton>
          </form>
          <FormMessage error={state.error} />
        </div>
      );
    }
    const user = userEvent.setup();
    render(<NoRef action={async () => DENIED} />);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    const alert = await screen.findByRole("alert");
    // Фокус остался там, где был (на кнопке, что отправила форму), а плашка его не получила
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled());
    expect(alert).not.toHaveFocus();
  });

  it("успех без перехода: фокус слетел на <body> — возвращается на нажатую кнопку", async () => {
    let release!: (s: FormState) => void;
    const action: Action = () => new Promise<FormState>((resolve) => (release = resolve));
    const user = userEvent.setup();
    render(<Beside action={action} />);
    const submit = screen.getByRole("button", { name: "Сохранить" });
    await user.click(submit);
    await screen.findByRole("button", { name: "Сохранить", busy: true });
    // Отключённая на время запроса кнопка теряет фокус
    dropFocusToBody();
    await act(async () => release({ ok: "Сохранено" }));
    await waitFor(() => expect(submit).toHaveFocus());
  });

  it("успех: фокус, что человек успел перенести в другое место, не отбирается", async () => {
    let release!: (s: FormState) => void;
    const action: Action = () => new Promise<FormState>((resolve) => (release = resolve));
    const user = userEvent.setup();
    render(<Beside action={action} />);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByRole("button", { name: "Сохранить", busy: true });
    const name = screen.getByLabelText("Имя");
    name.focus();
    await act(async () => release({ ok: "Сохранено" }));
    await screen.findByText("Сохранено");
    expect(name).toHaveFocus();
  });

  it("отказ без поля и без плашки: фокус на кнопке, а не на <body>", async () => {
    let release!: (s: FormState) => void;
    const action: Action = () => new Promise<FormState>((resolve) => (release = resolve));
    function Silent() {
      const { pending, formProps } = useFormAction(action, {});
      return (
        <form {...formProps}>
          <SubmitButton loading={pending}>Сохранить</SubmitButton>
        </form>
      );
    }
    const user = userEvent.setup();
    render(<Silent />);
    const submit = screen.getByRole("button", { name: "Сохранить" });
    await user.click(submit);
    await screen.findByRole("button", { name: "Сохранить", busy: true });
    dropFocusToBody();
    await act(async () => release({ error: "Отказ" }));
    await waitFor(() => expect(submit).toHaveFocus());
  });
});
