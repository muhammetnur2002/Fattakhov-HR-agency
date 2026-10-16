// @vitest-environment jsdom
/**
 * Восемнадцать мест, где блок «Да / Отмена» был написан руками, переведены на ConfirmBlock (13.10.2026); отзыв
 * приглашения из них с 16.10.2026 снова без вопроса, по решению владельца (revoke-invite-button.test.tsx), так что здесь
 * семнадцать.
 * Общие свойства блока проверены в confirm-block.test.tsx; здесь — что каждое место подключило его так же, как
 * было до перевода: та же кнопка, тот же вопрос, те же подписи, фокус на «Отмене» или в поле, возврат на кнопку,
 * а ошибка действия теперь стоит в самом блоке, и блок не закрывается, пока действие не удалось.
 *
 * Модерация вакансий и справки об учёбе (студплатформа) — тоже здесь, внизу файла: их решения идут через `onConfirm` с
 * проверкой причины на месте, и до проверки 15.10.2026 тестов на них не было вовсе.
 *
 * Что в старых блоках прямо сейчас отличалось, а теперь одинаково: «Отмена» не блокировалась на время запроса,
 * ошибка уходила в соседний угол страницы, а в трёх блоках после неудачи блок закрывался и вопроса уже не было.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  deleteCandidateFileAction: vi.fn(),
  uploadCandidateFileAction: vi.fn(),
  deleteContractTemplateAction: vi.fn(),
  uploadContractTemplateAction: vi.fn(),
  decideAccountDeletionAction: vi.fn(),
  decideAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  toggleTaskDoneAction: vi.fn(),
  saveTaskAction: vi.fn(),
  searchTaskCandidatesAction: vi.fn(),
  vacancyActionAction: vi.fn(),
  regenerateCalendarLinkAction: vi.fn(),
  deleteVacanciesAction: vi.fn(),
  clientTransitionAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  cancelDeletionRequestAction: vi.fn(),
  decideStudyReviewAction: vi.fn(),
  decideModerationAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: actions.push, refresh: actions.refresh, replace: vi.fn() }),
  unstable_isUnrecognizedActionError: () => false,
}));
vi.mock("@/app/(agency)/a/candidates/extras-actions", () => ({
  deleteCandidateFileAction: actions.deleteCandidateFileAction,
  uploadCandidateFileAction: actions.uploadCandidateFileAction,
}));
vi.mock("@/app/(agency)/a/clients/actions", () => ({
  deleteContractTemplateAction: actions.deleteContractTemplateAction,
  uploadContractTemplateAction: actions.uploadContractTemplateAction,
  decideAccountDeletionAction: actions.decideAccountDeletionAction,
}));
vi.mock("@/app/actions/decisions", () => ({ decideAction: actions.decideAction }));
vi.mock("@/app/(agency)/a/calendar/task-actions", () => ({
  deleteTaskAction: actions.deleteTaskAction,
  toggleTaskDoneAction: actions.toggleTaskDoneAction,
  saveTaskAction: actions.saveTaskAction,
  searchTaskCandidatesAction: actions.searchTaskCandidatesAction,
}));
vi.mock("@/app/(client)/students/actions", () => ({ vacancyActionAction: actions.vacancyActionAction }));
vi.mock("@/app/actions/calendar", () => ({ regenerateCalendarLinkAction: actions.regenerateCalendarLinkAction }));
vi.mock("@/app/actions/vacancies", () => ({
  deleteVacanciesAction: actions.deleteVacanciesAction,
  clientTransitionAction: actions.clientTransitionAction,
}));
vi.mock("@/app/(client)/settings/actions", () => ({
  deleteAccountAction: actions.deleteAccountAction,
  cancelDeletionRequestAction: actions.cancelDeletionRequestAction,
}));
vi.mock("@/app/(agency)/a/reviews/study/actions", () => ({ decideStudyReviewAction: actions.decideStudyReviewAction }));
vi.mock("@/app/(agency)/a/reviews/moderation/actions", () => ({ decideModerationAction: actions.decideModerationAction }));
vi.mock("sonner", () => ({ toast: { error: actions.toastError, success: actions.toastSuccess } }));

import { ClearClosed } from "@/app/(client)/students/clear-closed";
import { VacancyActions } from "@/app/(client)/students/vacancy-actions";
import { DecisionPanel } from "@/components/applications/decision-panel";
import { CandidateFilesCard, type CandidateFileRow } from "@/components/candidates/candidate-files";
import { TaskDetailDialog } from "@/components/calendar/task-dialogs";
import type { CalendarTaskDTO } from "@/components/calendar/calendar-model";
import { ContractTemplateManager } from "@/components/clients/contract-template-manager";
import { DeletionRequest } from "@/components/clients/deletion-request";
import { CalendarSubscription } from "@/components/interviews/calendar-subscription";
import { DeleteAccount } from "@/components/settings/delete-account";
import { DeleteVacancies } from "@/components/vacancies/delete-vacancies";
import { StudyBoard } from "@/app/(agency)/a/reviews/study/study-board";
import { ModerationBoard } from "@/app/(agency)/a/reviews/moderation/moderation-board";
import type { ModerationCompany, ModerationVacancy, PendingStudyStudent } from "@/lib/students-service";

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.deleteCandidateFileAction.mockResolvedValue({});
  actions.deleteContractTemplateAction.mockResolvedValue({ ok: "Шаблон удалён" });
  actions.decideAccountDeletionAction.mockResolvedValue({ ok: "Аккаунт удалён" });
  actions.deleteTaskAction.mockResolvedValue({});
  actions.vacancyActionAction.mockResolvedValue({});
  actions.regenerateCalendarLinkAction.mockResolvedValue({ ok: "Ссылка обновлена" });
  actions.deleteVacanciesAction.mockResolvedValue({});
  actions.deleteAccountAction.mockResolvedValue({ ok: "Готово" });
  actions.decideAction.mockResolvedValue({});
  actions.decideStudyReviewAction.mockResolvedValue({ ok: true });
  actions.decideModerationAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

const focused = () => document.activeElement;
const button = (name: string | RegExp) => screen.getByRole("button", { name });
function press(el: HTMLElement) {
  el.focus();
  fireEvent.click(el);
}
async function confirm(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(button(name));
  });
}

describe("файл кандидата: «Удалить» в строке", () => {
  const file: CandidateFileRow = {
    id: "f1",
    kind: "TEST_TASK",
    fileName: "тестовое.pdf",
    fileSize: 2048,
    visibility: "INTERNAL",
    createdAt: "2026-10-01T10:00:00Z",
    url: "https://example.invalid/f1",
  };
  const view = () => render(<CandidateFilesCard candidateId="c1" files={[file]} />);

  it("вопрос называет файл для читалки; фокус на «Нет»; «Нет» возвращает на «Удалить»", () => {
    view();
    press(button("Удалить"));
    // Имя файла для читалки стоит в скрытом span: пробел перед кавычкой при расчёте имени схлопывается
    const block = screen.getByRole("group", { name: /^Удалить файл\s*«тестовое\.pdf»\?$/ });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Нет" }));
    expect(within(block).getByRole("button", { name: "Да, удалить" })).toBeTruthy();
    fireEvent.click(within(block).getByRole("button", { name: "Нет" }));
    expect(focused()).toBe(button("Удалить"));
  });

  it("отказ сервера: ошибка в блоке, блок открыт (раньше закрывался)", async () => {
    actions.deleteCandidateFileAction.mockResolvedValue({ error: "Файл уже удалён" });
    view();
    press(button("Удалить"));
    await confirm("Да, удалить");
    // В строке списка ошибка стоит следующей строкой под блоком (basis-full), а не внутри узкого правого края
    expect(screen.getByRole("alert").textContent).toContain("Файл уже удалён");
    expect(screen.getByRole("group")).toBeTruthy();
    expect(actions.deleteCandidateFileAction).toHaveBeenCalledWith("f1");
  });
});

describe("шаблон договора: «Удалить»", () => {
  const view = () =>
    render(<ContractTemplateManager current={{ fileName: "договор.docx", uploadedAt: "01.10.2026", url: "https://example.invalid/t" }} />);

  it("«Оставить» вместо «Отмена»; фокус на «Оставить»; возврат на «Удалить»", () => {
    view();
    press(button("Удалить"));
    const block = screen.getByRole("group", { name: "Удалить шаблон?" });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Оставить" }));
    fireEvent.click(within(block).getByRole("button", { name: "Оставить" }));
    expect(focused()).toBe(button("Удалить"));
  });

  it("успех: вызвано удаление, блок закрыт", async () => {
    view();
    press(button("Удалить"));
    await confirm("Да, удалить");
    expect(actions.deleteContractTemplateAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("отказ сервера: блок открыт, текст ошибки в нём", async () => {
    actions.deleteContractTemplateAction.mockResolvedValue({ error: "Шаблон используется" });
    view();
    press(button("Удалить"));
    await confirm("Да, удалить");
    expect(screen.getByRole("alert").textContent).toContain("Шаблон используется");
    expect(screen.getByRole("group")).toBeTruthy();
  });
});

describe("удаление аккаунта клиента: владелец подтверждает", () => {
  const view = () => render(<DeletionRequest userId="u1" clientId="c1" canDecide />);

  it("«Подтвердить удаление» → вопрос, фокус на «Назад», «Назад» возвращает фокус", () => {
    view();
    press(button("Подтвердить удаление"));
    const block = screen.getByRole("group", { name: /Удалить аккаунт\? Имя, почта и пароль будут стёрты/ });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Назад" }));
    expect(screen.queryByRole("button", { name: "Отклонить" })).toBeNull();
    fireEvent.click(within(block).getByRole("button", { name: "Назад" }));
    expect(focused()).toBe(button("Подтвердить удаление"));
    expect(button("Отклонить")).toBeTruthy();
  });

  it("«Да, удалить» вызывает решение «confirm»", async () => {
    view();
    press(button("Подтвердить удаление"));
    await confirm("Да, удалить");
    expect(actions.decideAccountDeletionAction).toHaveBeenCalledWith("u1", "c1", "confirm");
    expect(screen.getByText("Аккаунт удалён")).toBeTruthy();
  });

  it("не владелец: блока нет вовсе", () => {
    render(<DeletionRequest userId="u1" clientId="c1" canDecide={false} />);
    expect(screen.queryByRole("button", { name: "Подтвердить удаление" })).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("подписка на календарь: «Обновить ссылку»", () => {
  it("вопрос про последствия назван группой, фокус на «Отмене», «Да, обновить» идёт в действие", async () => {
    render(<CalendarSubscription url="https://example.invalid/cal.ics" />);
    fireEvent.click(screen.getByRole("button", { name: /Подписаться|календар/i }));
    press(button("Обновить ссылку"));

    const block = screen.getByRole("group", { name: /Прежняя ссылка перестанет работать/ });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Отмена" }));
    await confirm("Да, обновить");
    expect(actions.regenerateCalendarLinkAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ссылка обновлена")).toBeTruthy();
    expect(focused()).toBe(button("Обновить ссылку"));
  });
});

describe("решение клиента: «Отказать» кандидату", () => {
  it("форма названа вопросом; фокус на выбор причины; «Отмена» возвращает на «Отказать»", () => {
    render(<DecisionPanel applicationId="a1" onBehalf={false} currentDecision={null} />);
    press(button("Отказать"));

    const form = screen.getByRole("form", { name: "Отказ кандидату: укажите причину" });
    expect(focused()).toBe(within(form).getByRole("combobox"));
    expect(button("Отказать").getAttribute("type")).toBe("submit");

    fireEvent.click(within(form).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(focused()).toBe(button("Отказать"));
  });
});

describe("задача в календаре: «Удалить» в карточке задачи", () => {
  const task: CalendarTaskDTO = {
    id: "t1",
    occurrence: "2026-10-14T09:00:00.000Z",
    title: "Позвонить клиенту",
    description: null,
    startsAt: "2026-10-14T09:00:00.000Z",
    durationMinutes: 30,
    hasDeadline: false,
    remindBeforeMinutes: null,
    recurrenceRule: null,
    recurrenceUntil: null,
    personal: true,
    completedAt: null,
    overdue: false,
    assignee: { id: "u1", fullName: "Я" },
    createdBy: { id: "u1", fullName: "Я" },
    vacancy: null,
    candidate: null,
    canEdit: true,
    canComplete: true,
  };
  const view = (onClose = vi.fn()) => {
    render(
      <TaskDetailDialog
        task={task}
        now={new Date("2026-10-13T09:00:00Z")}
        currentUserId="u1"
        onClose={onClose}
        onEdit={vi.fn()}
        onCloseAutoFocus={vi.fn()}
      />,
    );
    return onClose;
  };

  it("вопрос называет задачу; «Выполнено» и «Изменить» на время вопроса пропадают; фокус на «Не удалять»", () => {
    view();
    press(button("Удалить задачу"));
    const block = screen.getByRole("group", { name: /^Удалить\s*задачу\s*«Позвонить клиенту»\?$/ });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Не удалять" }));
    expect(screen.queryByRole("button", { name: "Выполнено" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
  });

  it("«Не удалять» возвращает кнопки и фокус на «Удалить»", () => {
    view();
    press(button("Удалить задачу"));
    fireEvent.click(button("Не удалять"));
    expect(button("Выполнено")).toBeTruthy();
    expect(focused()).toBe(button("Удалить задачу"));
  });

  it("«Удалить» зовёт действие и закрывает карточку; при отказе сервера карточка и вопрос остаются", async () => {
    const onClose = view();
    press(button("Удалить задачу"));
    actions.deleteTaskAction.mockResolvedValueOnce({ error: "Задача уже удалена" });
    await confirm("Удалить");
    expect(screen.getByRole("alert").textContent).toContain("Задача уже удалена");
    expect(screen.getByRole("group")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await confirm("Удалить");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("студплатформа: управление вакансией и «Удалить снятые»", () => {
  it("снять с публикации: три исхода в одном вопросе, «Не сохранять» красная, «Сохранить и закрыть» обычная", () => {
    render(<VacancyActions id="v1" status="PUBLISHED" />);
    press(button("Снять с публикации"));
    const block = screen.getByRole("group", { name: /Закрыть вакансию\? Студенты её не увидят/ });
    expect(focused()).toBe(within(block).getByRole("button", { name: "Отмена" }));
    expect(within(block).getByRole("button", { name: "Не сохранять" }).getAttribute("data-variant")).toBe("destructive");
    expect(within(block).getByRole("button", { name: "Сохранить и закрыть" }).getAttribute("data-variant")).toBe("default");
  });

  it("«Сохранить и закрыть» шлёт keep=true, «Не сохранять» — keep=false", async () => {
    render(<VacancyActions id="v1" status="PUBLISHED" />);
    press(button("Снять с публикации"));
    await confirm("Сохранить и закрыть");
    expect(actions.vacancyActionAction).toHaveBeenCalledWith("v1", "close", true);

    press(button("Снять с публикации"));
    await confirm("Не сохранять");
    expect(actions.vacancyActionAction).toHaveBeenLastCalledWith("v1", "close", false);
  });

  it("удаление снятой вакансии: после успеха уходим на список", async () => {
    render(<VacancyActions id="v1" status="CLOSED" />);
    press(button("Удалить"));
    await confirm("Да, удалить");
    expect(actions.vacancyActionAction).toHaveBeenCalledWith("v1", "delete", undefined);
    expect(actions.push).toHaveBeenCalledWith("/students");
  });

  it("«Удалить снятые и отклонённые (2)»: часть не удалилась — число в блоке, блок открыт", async () => {
    actions.vacancyActionAction.mockResolvedValueOnce({}).mockResolvedValueOnce({ error: "занято" });
    render(<ClearClosed ids={["a", "b"]} />);
    press(button(/Удалить снятые и отклонённые \(2\)/));
    await confirm("Да, удалить");
    expect(within(screen.getByRole("group")).getByRole("alert").textContent).toContain("Не удалось удалить: 1");
    expect(actions.refresh).toHaveBeenCalled();
  });
});

describe("общие блоки с сервером: ошибка не закрывает вопрос", () => {
  it("удаление закрытых вакансий: отказ сервера виден в блоке, редиректа нет", async () => {
    actions.deleteVacanciesAction.mockResolvedValue({ error: "Есть открытые кандидаты" });
    render(<DeleteVacancies ids={["v1"]} label="Удалить" question="Удалить вакансию?" redirectTo="/a/vacancies" />);
    press(button("Удалить"));
    await confirm("Да, удалить");
    expect(within(screen.getByRole("group")).getByRole("alert").textContent).toContain("Есть открытые кандидаты");
    expect(actions.push).not.toHaveBeenCalled();
  });

  it("удаление аккаунта: отказ сервера виден в блоке", async () => {
    actions.deleteAccountAction.mockResolvedValue({ error: "Сначала передайте владение" });
    render(<DeleteAccount contracted={false} requested={false} />);
    press(button("Удалить аккаунт"));
    await confirm("Да, удалить аккаунт");
    expect(within(screen.getByRole("group")).getByRole("alert").textContent).toContain("Сначала передайте владение");
  });
});

describe("справка об учёбе (студплатформа): «Вернуть с причиной»", () => {
  const student: PendingStudyStudent = {
    id: "s1",
    fullName: "Студент Первый",
    photoUrl: null,
    university: "КФУ",
    speciality: "Информатика",
    studyYear: 3,
    city: "Казань",
    studyDocUrl: null,
    studyDocName: null,
    studyDocAt: null,
  };
  const view = () => render(<StudyBoard students={[student]} />);
  const field = () => screen.getByPlaceholderText("Причина — студент увидит её в профиле") as HTMLTextAreaElement;
  const block = () => screen.getByRole("group", { name: "Вернуть справку с причиной" });
  const open = () => press(button("Вернуть с причиной"));

  it("кнопка открывает блок: фокус в поле причины, кнопки «Подтвердить» и «Вернуть» на время блока убраны", () => {
    view();
    open();
    expect(focused()).toBe(field());
    expect(within(block()).getByRole("button", { name: "Вернуть справку" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Подтвердить учёбу" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Вернуть с причиной" })).toBeNull();
  });

  it("«Отмена» и Escape закрывают блок и возвращают фокус на «Вернуть с причиной»", () => {
    view();
    open();
    fireEvent.click(within(block()).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Вернуть с причиной"));

    open();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Вернуть с причиной"));
  });

  it("причина короче пяти знаков: ошибка в блоке, действие не вызвано, блок открыт, написанное сохранено", async () => {
    view();
    open();
    fireEvent.change(field(), { target: { value: "ну" } });
    await confirm("Вернуть справку");
    expect(actions.decideStudyReviewAction).not.toHaveBeenCalled();
    expect(within(block()).getByRole("alert").textContent).toContain("Напишите причину — студент увидит её в профиле");
    expect(field().value).toBe("ну");
    // Правка поля убирает ошибку
    fireEvent.change(field(), { target: { value: "ну вот" } });
    expect(within(block()).queryByRole("alert")).toBeNull();
  });

  it("нормальная причина: действие вызвано с REJECT и обрезанным текстом, карточка уходит из списка", async () => {
    view();
    open();
    fireEvent.change(field(), { target: { value: "  Справка не читается  " } });
    await confirm("Вернуть справку");
    expect(actions.decideStudyReviewAction).toHaveBeenCalledTimes(1);
    expect(actions.decideStudyReviewAction).toHaveBeenCalledWith({ studentId: "s1", decision: "REJECT", note: "Справка не читается" });
    expect(actions.toastSuccess).toHaveBeenCalledWith("Справка возвращена студенту");
    expect(actions.refresh).toHaveBeenCalled();
    expect(screen.getByText("Справок на проверке нет.")).toBeTruthy();
  });

  it("отказ сервера: плашка-тост, блок открыт, текст на месте, повторное нажатие работает", async () => {
    actions.decideStudyReviewAction.mockResolvedValueOnce({ error: "Недостаточно прав" });
    view();
    open();
    fireEvent.change(field(), { target: { value: "Нет печати вуза" } });
    await confirm("Вернуть справку");
    expect(actions.toastError).toHaveBeenCalledWith("Недостаточно прав");
    expect(screen.queryByText("Справок на проверке нет.")).toBeNull();
    expect(block()).toBeTruthy();
    expect(field().value).toBe("Нет печати вуза");

    // Замок снят, кнопка снова нажимается
    await confirm("Вернуть справку");
    expect(actions.decideStudyReviewAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Справок на проверке нет.")).toBeTruthy();
  });

  it("сбой сети: тост «проверьте соединение», блок открыт", async () => {
    actions.decideStudyReviewAction.mockRejectedValueOnce(new Error("fetch failed"));
    view();
    open();
    fireEvent.change(field(), { target: { value: "Нет печати вуза" } });
    await confirm("Вернуть справку");
    expect(actions.toastError).toHaveBeenCalledWith("Не удалось сохранить решение — проверьте соединение");
    expect(block()).toBeTruthy();
    expect(field().value).toBe("Нет печати вуза");
  });

  it("«Подтвердить учёбу» по-прежнему решает сразу, без вопроса", async () => {
    view();
    await confirm("Подтвердить учёбу");
    expect(actions.decideStudyReviewAction).toHaveBeenCalledWith({ studentId: "s1", decision: "APPROVE", note: undefined });
  });
});

describe("модерация студплатформы: «Отклонить» компанию и вакансию", () => {
  const company: ModerationCompany = {
    id: "co1",
    companyName: "ООО Ромашка",
    contactName: "Иван",
    email: "hr@romashka.example.invalid",
    inn: "7700000000",
    phone: null,
    freeEmail: false,
    logoUrl: null,
    city: "Казань",
    about: null,
    website: null,
    createdAt: "2026-10-01T10:00:00Z",
    pendingVacancies: 0,
  };
  const vacancy: ModerationVacancy = {
    companyId: "co2",
    companyStatus: "PENDING",
    submittedAt: "2026-10-01T10:00:00Z",
    version: "v-7",
    vacancy: {
      id: "vac1",
      title: "Курьер",
      company: "ООО Лютик",
      companyLogoUrl: null,
      summary: "Развозить заказы",
      requirements: [],
      perks: [],
      learnings: [],
      city: "Казань",
      district: null,
      address: null,
      addressDetails: null,
      workFormat: "ONSITE",
      employmentType: "PART_TIME",
      tags: [],
      isHot: false,
      salaryFrom: null,
      salaryTo: null,
      salaryPeriod: "MONTH",
      photos: [],
    },
  };
  const field = () => screen.getByPlaceholderText("Причина отказа — компания увидит её в кабинете") as HTMLTextAreaElement;
  const block = () => screen.getByRole("group", { name: "Отклонить с причиной" });
  const open = () => press(button("Отклонить"));
  const viewCompany = () => render(<ModerationBoard companies={[company]} vacancies={[]} />);

  it("кнопка открывает блок: фокус в поле причины, «Одобрить» и «Отклонить» на время блока убраны", () => {
    viewCompany();
    open();
    expect(focused()).toBe(field());
    expect(screen.queryByRole("button", { name: "Одобрить" })).toBeNull();
    expect(within(block()).getByRole("button", { name: "Отклонить" })).toBeTruthy();
  });

  it("«Отмена» и Escape возвращают фокус на «Отклонить»", () => {
    viewCompany();
    open();
    fireEvent.click(within(block()).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Отклонить"));

    open();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(focused()).toBe(button("Отклонить"));
  });

  it("причина короче пяти знаков: ошибка в блоке, действие не вызвано, блок открыт", async () => {
    viewCompany();
    open();
    fireEvent.change(field(), { target: { value: "нет" } });
    await confirm("Отклонить");
    expect(actions.decideModerationAction).not.toHaveBeenCalled();
    expect(within(block()).getByRole("alert").textContent).toContain("Напишите причину — хотя бы пару слов");
    expect(field().value).toBe("нет");
  });

  it("компания: нормальная причина — вызов с entity=company и REJECT, карточка уходит, очередь пуста", async () => {
    viewCompany();
    open();
    fireEvent.change(field(), { target: { value: "  ИНН не найден  " } });
    await confirm("Отклонить");
    expect(actions.decideModerationAction).toHaveBeenCalledTimes(1);
    expect(actions.decideModerationAction).toHaveBeenCalledWith({
      entity: "company",
      id: "co1",
      decision: "REJECT",
      note: "ИНН не найден",
      version: undefined,
    });
    expect(actions.toastSuccess).toHaveBeenCalledWith("Отклонено — причина ушла в кабинет компании");
    expect(screen.getByText(/Очередь пуста/)).toBeTruthy();
  });

  it("отказ сервера: тост, блок открыт, текст сохранён, замок снят — можно повторить", async () => {
    actions.decideModerationAction.mockResolvedValueOnce({ error: "Недостаточно прав" });
    viewCompany();
    open();
    fireEvent.change(field(), { target: { value: "ИНН не найден" } });
    await confirm("Отклонить");
    expect(actions.toastError).toHaveBeenCalledWith("Недостаточно прав");
    expect(block()).toBeTruthy();
    expect(field().value).toBe("ИНН не найден");
    expect(screen.queryByText(/Очередь пуста/)).toBeNull();

    await confirm("Отклонить");
    expect(actions.decideModerationAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Очередь пуста/)).toBeTruthy();
  });

  it("сбой сети: тост, блок открыт", async () => {
    actions.decideModerationAction.mockRejectedValueOnce(new Error("fetch failed"));
    viewCompany();
    open();
    fireEvent.change(field(), { target: { value: "ИНН не найден" } });
    await confirm("Отклонить");
    expect(actions.toastError).toHaveBeenCalledWith("Не удалось сохранить решение — проверьте соединение");
    expect(block()).toBeTruthy();
  });

  it("вакансия: в вызов уходит версия карточки; пока компания не одобрена, «Одобрить» выключена и подсказка видна только закрытой", async () => {
    render(<ModerationBoard companies={[]} vacancies={[vacancy]} />);
    expect(button("Одобрить").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Сначала одобрите компанию/)).toBeTruthy();

    open();
    expect(screen.queryByText(/Сначала одобрите компанию/)).toBeNull();
    fireEvent.change(field(), { target: { value: "Нет условий" } });
    await confirm("Отклонить");
    expect(actions.decideModerationAction).toHaveBeenCalledWith({
      entity: "vacancy",
      id: "vac1",
      decision: "REJECT",
      note: "Нет условий",
      version: "v-7",
    });
  });
});
