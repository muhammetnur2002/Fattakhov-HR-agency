// @vitest-environment jsdom
/**
 * Блок на месте кнопки (замечания независимой проверки к PR #119, 12.10.2026).
 *
 * Дефект a11y-4: кнопка («Удалить», «Изменить», «Отменить заявку») открывает вопрос, поле причины или форму
 * и сама пропадает — фокус терялся на <body>. Первая правка закрыла четырнадцать блоков с вопросом «Да / Отмена»,
 * но не `comment-thread` (состояние `mode` со строками) и не `client-vacancy-actions` (`cancelling`); и у всех
 * блоков фокус вставал на «Отмену» молча: вопрос лежал в соседнем абзаце, и читалка говорила только «Отмена, кнопка».
 *
 * Здесь для каждого блока: (1) при открытии фокус там, где задумано; (2) блок назван своим вопросом
 * (`role="group"` или форма с `aria-labelledby`); (3) после «Отмены» фокус вернулся на ту же кнопку.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_isUnrecognizedActionError: () => false,
}));
vi.mock("@/app/actions/comments", () => ({
  createCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
  markReadAction: vi.fn(),
}));
vi.mock("@/app/actions/vacancies", () => ({
  clientTransitionAction: vi.fn(async () => ({})),
  deleteVacanciesAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/(agency)/a/settings/pdn/actions", () => ({ erasePersonalDataAction: vi.fn(async () => ({})) }));
vi.mock("@/app/(agency)/a/finance/actions", () => ({
  attachInvoiceFileAction: vi.fn(),
  createInvoiceAction: vi.fn(async () => ({})),
  transitionInvoiceAction: vi.fn(),
}));
vi.mock("@/app/(agency)/a/clients/link-requests/actions", () => ({
  createClientFromLinkRequestAction: vi.fn(async () => ({})),
  linkExistingClientAction: vi.fn(async () => ({})),
  rejectLinkRequestAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/actions/interviews", () => ({
  proposeSlotsAction: vi.fn(),
  submitFeedbackAction: vi.fn().mockResolvedValue({ ok: "Спасибо, записали" }),
  transitionInterviewAction: vi.fn(),
}));
vi.mock("@/app/(client)/settings/actions", () => ({
  cancelDeletionRequestAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CompanyActions } from "@/app/(agency)/a/clients/company-actions";
import { LinkRequestActions } from "@/app/(agency)/a/clients/link-requests/link-request-actions";
import { CommentThread, type ThreadComment } from "@/components/comments/comment-thread";
import { BillableHireRow } from "@/components/finance/invoice-actions";
import { InterviewSection, type InterviewView } from "@/components/interviews/interview-section";
import { EraseButton } from "@/components/pdn/erase-button";
import { DeleteAccount } from "@/components/settings/delete-account";
import { StaffAddPanel } from "@/components/team/staff-forms";
import { ClientVacancyActions } from "@/components/vacancies/client-vacancy-actions";
import { DeleteVacancies } from "@/components/vacancies/delete-vacancies";

afterEach(cleanup);

const focused = () => document.activeElement;
const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** Нажать кнопку так, как нажимает клавиатура: фокус уже на ней (Safari кнопке фокус при клике не даёт). */
function press(el: HTMLElement) {
  el.focus();
  fireEvent.click(el);
}

describe("комментарий: «Изменить» и «Удалить» заменяются блоком", () => {
  const ME = "usr_me";
  const comment: ThreadComment = {
    id: "c1",
    body: "Текст комментария",
    visibility: "SHARED",
    parentId: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    editedAt: null,
    isRead: true,
    authorId: ME,
    author: { id: ME, fullName: "Я", role: "RECRUITER", position: null },
  };
  const view = () =>
    render(
      <CommentThread
        applicationId="app_1"
        comments={[comment]}
        currentUserId={ME}
        canWriteInternal={false}
        canWrite
        canDeleteAny={false}
        emptyText="Пока пусто"
      />,
    );

  it("«Удалить»: фокус на «Отмена», вопрос называет группу, после «Отмены» фокус на «Удалить»", () => {
    view();
    press(button("Удалить"));

    const block = screen.getByRole("group", { name: "Удалить комментарий?" });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Отмена" }));
    // и сама кнопка описана вопросом: где название группы при переводе фокуса читают не всегда (например, VoiceOver на iPhone), он слышен
    expect(focused()).toHaveAccessibleDescription("Удалить комментарий?");
    expect(within(block).getByRole("button", { name: "Да, удалить" })).toBeTruthy();

    fireEvent.click(within(block).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Удалить"));
  });

  it("«Изменить»: фокус в поле правки, блок назван, после «Отмены» фокус на «Изменить»", () => {
    view();
    press(button("Изменить"));

    const block = screen.getByRole("group", { name: "Изменить комментарий" });
    expect(focused()).toBe(within(block).getByRole("textbox"));

    fireEvent.click(within(block).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Изменить"));
  });

  it("до открытия фокус не трогают", () => {
    view();
    expect(focused()).toBe(document.body);
  });
});

describe("отмена заявки клиентом", () => {
  it("«Отменить заявку» → форма причины названа вопросом, фокус в поле, «Не отменять» возвращает на кнопку", () => {
    render(<ClientVacancyActions vacancyId="v1" status="ACTIVE" canHold canClose />);
    press(button("Отменить заявку"));

    const form = screen.getByRole("form", { name: "Почему отменяете?" });
    expect(focused()).toBe(within(form).getByRole("textbox"));

    fireEvent.click(within(form).getByRole("button", { name: "Не отменять" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(focused()).toBe(button("Отменить заявку"));
  });
});

describe("удаление данных кандидата", () => {
  it("«Удалить данные» → форма названа, фокус в поле слова-подтверждения, «Отмена» возвращает на кнопку", () => {
    render(<EraseButton candidateId="c1" candidateName="Анна Веретенникова" activeApplications={0} />);
    press(button("Удалить данные"));

    const form = screen.getByRole("form", { name: "Удалить данные кандидата Анна Веретенникова" });
    expect(focused()).toBe(within(form).getByLabelText(/Впишите «удалить»/));

    fireEvent.click(within(form).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Удалить данные"));
  });
});

describe("счёт за закрытую позицию", () => {
  it("«Выставить счёт» → форма названа, фокус в поле суммы, «Отмена» возвращает на кнопку", () => {
    render(
      <BillableHireRow
        hire={{
          applicationId: "a1",
          vacancyId: "v1",
          vacancyNumber: 7,
          vacancyTitle: "Товаровед",
          clientId: "cl1",
          clientName: "Старфиш",
          candidateName: "Анна Веретенникова",
          hiredAt: new Date("2026-09-20T00:00:00Z"),
          offerSalary: 120000,
          fee: 60000,
          pricingDescription: "50% от оффера",
          invoiced: false,
        }}
      />,
    );
    press(button("Выставить счёт"));

    const form = screen.getByRole("form", { name: "Счёт за Анна Веретенникова, вакансия №7" });
    expect(focused()).toBe(within(form).getByLabelText("Сумма, ₽"));

    fireEvent.click(within(form).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Выставить счёт"));
  });
});

describe("сотрудники агентства: бланк на месте кнопок", () => {
  const props = {
    createAction: vi.fn(async () => ({})),
    inviteAction: vi.fn(async () => ({})),
    roles: [{ value: "RECRUITER", label: "Рекрутер" }],
    grants: [],
  };

  it("«Пригласить по почте» → бланк назван заголовком, фокус в поле почты, «Отмена» возвращает на ту же кнопку", () => {
    render(<StaffAddPanel {...props} />);
    press(button("Пригласить по почте"));

    const block = screen.getByRole("group", { name: "Приглашение в команду" });
    expect(focused()).toBe(within(block).getByLabelText("Почта"));

    fireEvent.click(within(block).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Пригласить по почте"));
  });

  it("«Создать аккаунт сотрудника» — своя кнопка, свой бланк, свой возврат", () => {
    render(<StaffAddPanel {...props} />);
    press(button("Создать аккаунт сотрудника"));

    const block = screen.getByRole("group", { name: "Новый сотрудник" });
    expect(focused()).toBe(within(block).getByLabelText("Почта"));

    fireEvent.click(within(block).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Создать аккаунт сотрудника"));
  });
});

describe("компания со студенческой платформы и заявка на привязку", () => {
  const props = {
    employerId: "e1",
    existingClients: [{ id: "c1", name: "Старфиш" }],
    managers: [],
    prefill: { name: "Компания" },
  };

  it("«Привязать к существующему»: форма названа, фокус на выборе клиента, «Отмена» возвращает на кнопку", () => {
    render(<CompanyActions {...props} />);
    press(button("Привязать к существующему"));

    const form = screen.getByRole("form", { name: "Привязать компанию к существующему клиенту" });
    expect(focused()).toBe(within(form).getByRole("combobox"));

    fireEvent.click(within(form).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Привязать к существующему"));
  });

  it("«Создать клиента»: блок назван, «Отмена» возвращает на кнопку", () => {
    render(<CompanyActions {...props} />);
    press(button("Создать клиента"));

    const block = screen.getByRole("group", { name: "Новый клиент из заявки компании" });
    fireEvent.click(within(block).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Создать клиента"));
  });

  it("заявка на привязку, «Отклонить»: форма названа, фокус в поле пояснения, «Отмена» возвращает на «Отклонить»", () => {
    render(<LinkRequestActions {...props} />);
    press(button("Отклонить"));

    const form = screen.getByRole("form", { name: "Отклонить заявку с пояснением" });
    expect(focused()).toBe(within(form).getByRole("textbox"));

    fireEvent.click(within(form).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Отклонить"));
  });

  it("заявка на привязку: у каждой из трёх кнопок свой возврат", () => {
    render(<LinkRequestActions {...props} />);
    press(button("Привязать к существующему"));
    fireEvent.click(button("Отмена"));
    expect(focused()).toBe(button("Привязать к существующему"));

    press(button("Создать клиента"));
    fireEvent.click(button("Отмена"));
    expect(focused()).toBe(button("Создать клиента"));
  });
});

describe("оценка встречи: «Изменить оценку» заменяется формой", () => {
  const NOW = Date.parse("2026-10-09T12:00:00Z");
  const rated = {
    id: "i1",
    type: "FIRST",
    status: "COMPLETED",
    format: "ONLINE",
    scheduledAt: "2026-10-08T10:00:00Z",
    durationMinutes: 60,
    timezone: "Europe/Moscow",
    meetingUrl: null,
    address: null,
    feedbackRating: 3,
    feedbackNote: "Нормально",
    slots: [],
  } as unknown as InterviewView;

  it("форма названа вопросом «Как прошло?», фокус на выборе оценки, «Отмена» возвращает на «Изменить оценку»", () => {
    render(<InterviewSection applicationId="a1" interviews={[rated]} participants={[]} canManage now={NOW} />);
    press(button("Изменить оценку"));

    const form = screen.getByRole("form", { name: "Как прошло?" });
    expect(focused()).toBe(within(form).getByRole("combobox"));

    fireEvent.click(within(form).getByRole("button", { name: "Отмена" }));
    expect(focused()).toBe(button("Изменить оценку"));
  });

  it("встреча без оценки: форма на месте с самого начала и сама ни на что не названа и фокус не берёт", () => {
    render(
      <InterviewSection
        applicationId="a1"
        interviews={[{ ...rated, feedbackRating: null, feedbackNote: null } as InterviewView]}
        participants={[]}
        canManage
        now={NOW}
      />,
    );
    expect(screen.queryByRole("form")).toBeNull();
    expect(focused()).toBe(document.body);
  });
});

describe("уже подключённые блоки «Да / Отмена»: вопрос теперь называет группу", () => {
  it("удаление вакансий: группа названа вопросом из пропса", () => {
    render(<DeleteVacancies ids={["v1"]} label="Удалить закрытые (1)" question="Удалить закрытые вакансии?" />);
    press(button(/Удалить закрытые \(1\)/));
    const block = screen.getByRole("group", { name: "Удалить закрытые вакансии?" });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Отмена" }));
    expect(focused()).toHaveAccessibleDescription("Удалить закрытые вакансии?");
  });

  it("удаление аккаунта: «Удалить аккаунт? Это нельзя отменить.» — название группы с кнопками", () => {
    render(<DeleteAccount contracted={false} requested={false} />);
    press(button("Удалить аккаунт"));
    const block = screen.getByRole("group", { name: "Удалить аккаунт? Это нельзя отменить." });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Отмена" }));
    expect(focused()).toHaveAccessibleDescription("Удалить аккаунт? Это нельзя отменить.");
    expect(within(block).getByRole("button", { name: "Да, удалить аккаунт" })).toBeTruthy();
  });
});
