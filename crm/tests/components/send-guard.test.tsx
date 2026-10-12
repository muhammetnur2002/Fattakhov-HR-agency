// @vitest-environment jsdom
/**
 * Повторная отправка сообщения: пока идёт предыдущая, новая не стартует.
 *
 * Выключенная кнопка «Отправить» не защищает от Enter: поле вызывает requestSubmit()
 * в обход кнопки, и при медленной сети сообщение уходило дважды (проверка 11.10.2026).
 * Блокировка стоит в самой отправке, а не на кнопке. Сервер добавляет вторую линию
 * защиты (tests/duplicate-send.test.ts).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  sendMessageAction: vi.fn(),
  markConversationReadAction: vi.fn(),
  createCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
  markReadAction: vi.fn(),
  sendStudentMessageAction: vi.fn(),
  saveStudentDraftAction: vi.fn(),
  loadThreadAction: vi.fn(),
  loadThreadsAction: vi.fn(),
  markStudentThreadReadAction: vi.fn(),
}));

vi.mock("@/app/actions/messages", () => ({
  sendMessageAction: actions.sendMessageAction,
  markConversationReadAction: actions.markConversationReadAction,
}));
vi.mock("@/app/actions/comments", () => ({
  createCommentAction: actions.createCommentAction,
  deleteCommentAction: actions.deleteCommentAction,
  editCommentAction: actions.editCommentAction,
  markReadAction: actions.markReadAction,
}));
vi.mock("@/app/(client)/students/actions", () => ({
  sendStudentMessageAction: actions.sendStudentMessageAction,
  saveStudentDraftAction: actions.saveStudentDraftAction,
  loadThreadAction: actions.loadThreadAction,
  loadThreadsAction: actions.loadThreadsAction,
  markStudentThreadReadAction: actions.markStudentThreadReadAction,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/students/messages",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  // useStaleGuard: «устаревшей вкладки» в этих сценариях нет
  unstable_isUnrecognizedActionError: () => false,
}));

import { StudentMessages } from "@/app/(client)/students/messages/student-messages";
import { CommentThread } from "@/components/comments/comment-thread";
import { MessageThread } from "@/components/messages/message-thread";
import type { StudentThreadView } from "@/lib/students-threads";

/** Ответ, который отдаётся вручную: пока не вызвали resolve, отправка «в пути». */
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Компьютер, а не телефон: Enter отправляет (lib/chat-keys.ts)
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", vi.fn());
  actions.markConversationReadAction.mockResolvedValue(undefined);
  actions.markReadAction.mockResolvedValue(undefined);
  actions.saveStudentDraftAction.mockResolvedValue({});
  actions.markStudentThreadReadAction.mockResolvedValue(undefined);
  actions.loadThreadsAction.mockResolvedValue(null);
  actions.loadThreadAction.mockResolvedValue(null);
});

afterEach(cleanup);

describe("личное сообщение", () => {
  const thread = () => render(<MessageThread messages={[]} recipientId="usr_2" hasUnread={false} />);

  it("второй Enter, пока первое сообщение в пути, ничего не отправляет", async () => {
    const first = pending<{ ok: boolean }>();
    actions.sendMessageAction.mockReturnValueOnce(first.promise);
    const user = userEvent.setup();
    thread();

    await user.type(screen.getByLabelText("Текст сообщения"), "Добрый день{Enter}");
    await user.keyboard("{Enter}{Enter}");
    expect(actions.sendMessageAction).toHaveBeenCalledTimes(1);

    first.resolve({ ok: true });
    await waitFor(() => expect(screen.getByLabelText("Текст сообщения")).toHaveValue(""));

    // Отправка закончилась — следующее сообщение уходит как обычно
    actions.sendMessageAction.mockResolvedValueOnce({ ok: true });
    await user.type(screen.getByLabelText("Текст сообщения"), "Ещё одно{Enter}");
    await waitFor(() => expect(actions.sendMessageAction).toHaveBeenCalledTimes(2));
  });

  it("нет связи: сообщение об этом, текст остаётся в поле, повторить можно", async () => {
    actions.sendMessageAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    const user = userEvent.setup();
    thread();

    await user.type(screen.getByLabelText("Текст сообщения"), "Добрый день{Enter}");
    expect(await screen.findByText(/нет связи с сервером/)).toBeTruthy();
    expect(screen.getByLabelText("Текст сообщения")).toHaveValue("Добрый день");

    // Блокировка снята: тот же текст уходит повторно
    actions.sendMessageAction.mockResolvedValueOnce({ ok: true });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(actions.sendMessageAction).toHaveBeenCalledTimes(2));
  });
});

describe("отказ сервера", () => {
  it("личное сообщение: текст остаётся в поле, а не пропадает вместе с отказом", async () => {
    actions.sendMessageAction.mockResolvedValueOnce({ error: "Слишком много сообщений" });
    const user = userEvent.setup();
    render(<MessageThread messages={[]} recipientId="usr_2" hasUnread={false} />);

    await user.type(screen.getByLabelText("Текст сообщения"), "Добрый день{Enter}");
    expect(await screen.findByText("Слишком много сообщений")).toBeTruthy();
    expect(screen.getByLabelText("Текст сообщения")).toHaveValue("Добрый день");
  });
});

describe("комментарий", () => {
  const comments = () =>
    render(
      <CommentThread
        comments={[]}
        applicationId="app_1"
        canWriteInternal={false}
        canWrite
        canDeleteAny={false}
        currentUserId="usr_1"
        emptyText="Пока пусто"
      />,
    );

  it("вторая отправка формы, пока первая в пути, не уходит", async () => {
    const first = pending<{ ok: boolean }>();
    actions.createCommentAction.mockReturnValueOnce(first.promise);
    comments();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Хороший кандидат" } });
    const form = screen.getByRole("textbox").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(actions.createCommentAction).toHaveBeenCalledTimes(1));
    first.resolve({ ok: true });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  });

  it("нет связи: сообщение об этом, а не экран ошибки; отправить можно снова", async () => {
    actions.createCommentAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    comments();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Хороший кандидат" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByText(/нет связи с сервером/)).toBeTruthy();
    // React 19 очищает форму после отправки через action; текст возвращает управляемое поле
    expect(screen.getByRole("textbox")).toHaveValue("Хороший кандидат");

    actions.createCommentAction.mockResolvedValueOnce({ ok: true });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(actions.createCommentAction).toHaveBeenCalledTimes(2));
  });
});

describe("сообщение студенту", () => {
  const view: StudentThreadView = {
    applicationId: "a",
    vacancyId: "vac_a",
    vacancyTitle: "Бариста",
    counterpartName: "Студент a",
    counterpartSubtitle: "МГУ, 2 курс",
    status: "VIEWED",
    lastMessageBody: null,
    lastMessageAuthor: null,
    lastMessageAt: null,
    unread: 0,
    canWrite: true,
    lockedReason: null,
    messages: [],
    draft: "",
  };

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  it("нет связи: кнопка «Отправить» не залипает, текст остаётся, отправить можно снова", async () => {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    actions.sendStudentMessageAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    const user = userEvent.setup();
    render(<StudentMessages initialThreads={[]} initialThread={view} />);

    await user.type(screen.getByLabelText("Текст сообщения"), "Приглашаем");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText(/нет связи с сервером/)).toBeTruthy();
    expect(screen.getByLabelText("Текст сообщения")).toHaveValue("Приглашаем");
    // Раньше после сбоя кнопка оставалась выключенной навсегда
    await waitFor(() => expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled());

    actions.sendStudentMessageAction.mockResolvedValueOnce({});
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(actions.sendStudentMessageAction).toHaveBeenCalledTimes(2));
  });

  it("второй Enter, пока сообщение в пути, ничего не отправляет", async () => {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    const first = pending<{ error?: string }>();
    actions.sendStudentMessageAction.mockReturnValueOnce(first.promise);
    const user = userEvent.setup();
    render(<StudentMessages initialThreads={[]} initialThread={view} />);

    await user.type(screen.getByLabelText("Текст сообщения"), "Приглашаем{Enter}");
    await user.keyboard("{Enter}{Enter}");
    expect(actions.sendStudentMessageAction).toHaveBeenCalledTimes(1);

    first.resolve({});
    await waitFor(() => expect(screen.getByLabelText("Текст сообщения")).toHaveValue(""));
  });
});
