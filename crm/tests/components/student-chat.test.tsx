// @vitest-environment jsdom
/**
 * Кабинет клиента → «Студенческая платформа» на телефоне (замечания владельца 06.10.2026):
 * - беседа со студентом: нижняя панель разделов прячется, экран закреплён, поле ввода на месте;
 * - полоса под вкладками раздела: скрыта, активная вкладка видна;
 * - «Написать студенту» в анкете отклика, черновик, список «Сообщения».
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/students/messages", push: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  applicationAction: vi.fn(),
  loadThreadAction: vi.fn(),
  loadThreadsAction: vi.fn(),
  markStudentThreadReadAction: vi.fn(),
  saveStudentDraftAction: vi.fn(),
  sendStudentMessageAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
}));
vi.mock("@/app/(client)/students/actions", () => actions);

import { ApplicationsList } from "@/app/(client)/students/applications/applications-list";
import { StudentMessages } from "@/app/(client)/students/messages/student-messages";
import { StudentsTabs } from "@/app/(client)/students/students-tabs";
import { DRAFT_SAVE_DELAY_MS } from "@/lib/hooks/use-draft-autosave";
import type { StudentThreadItem, StudentThreadView } from "@/lib/students-threads";
import { withDraft } from "@/lib/students-threads";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function item(id: string, extra: Partial<StudentThreadItem> = {}): StudentThreadItem {
  return {
    applicationId: id,
    vacancyId: `vac_${id}`,
    vacancyTitle: "Бариста",
    counterpartName: `Студент ${id}`,
    counterpartSubtitle: "МГУ, 2 курс",
    status: "VIEWED",
    lastMessageBody: null,
    lastMessageAuthor: null,
    lastMessageAt: null,
    unread: 0,
    canWrite: true,
    lockedReason: null,
    draft: null,
    draftAt: null,
    ...extra,
  };
}

function view(id: string, extra: Partial<StudentThreadView> = {}): StudentThreadView {
  const summary: Partial<StudentThreadItem> = item(id);
  delete summary.draft;
  delete summary.draftAt;
  return { ...(summary as Omit<StudentThreadItem, "draft" | "draftAt">), messages: [], draft: "", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  // jsdom прокрутку окна не умеет и ругается в консоль
  vi.stubGlobal("scrollTo", vi.fn());
  nav.pathname = "/students/messages";
  actions.saveStudentDraftAction.mockResolvedValue({});
  actions.sendStudentMessageAction.mockResolvedValue({});
  actions.loadThreadsAction.mockResolvedValue(null);
  actions.loadThreadAction.mockResolvedValue(null);
  actions.markStudentThreadReadAction.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  document.documentElement.removeAttribute("data-chat-open");
});

describe("список «Сообщения»", () => {
  it("беседа с черновиком — с пометкой «Черновик: …», без счётчика непрочитанных", () => {
    render(
      <StudentMessages
        initialThreads={[item("a", { draft: "Добрый день!\nПриглашаем вас на собеседование", draftAt: "2026-10-05T10:00:00.000Z" })]}
        initialThread={null}
      />,
    );
    const card = screen.getByRole("button", { name: /Студент a/ });
    expect(card).toHaveTextContent("Черновик: Добрый день! Приглашаем вас на собеседование");
    expect(card.querySelector("[data-draft]")).toHaveClass("italic");
    // Кружок со счётчиком есть только у непрочитанных сообщений
    expect(card.querySelector(".rounded-full.bg-primary")).toBeNull();
  });

  it("у беседы с сообщением и непрочитанным — счётчик по сообщениям, черновика нет", () => {
    render(
      <StudentMessages
        initialThreads={[
          item("a", { lastMessageBody: "Здравствуйте", lastMessageAuthor: "STUDENT", lastMessageAt: "2026-10-05T09:00:00.000Z", unread: 2 }),
        ]}
        initialThread={null}
      />,
    );
    const card = screen.getByRole("button", { name: /Студент a/ });
    expect(card).toHaveTextContent("Здравствуйте");
    expect(card).not.toHaveTextContent("Черновик");
    expect(card).toHaveTextContent("2");
  });

  it("беседы нет ни одной — подсказка и ссылка к откликам", () => {
    render(<StudentMessages initialThreads={[]} initialThread={null} />);
    expect(screen.getByRole("heading", { name: "Переписки пока нет" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К откликам" })).toHaveAttribute("href", "/students/applications");
  });

  it("беседа без сообщений, открытая по ссылке «Написать студенту», открыта, а не пустая подсказка", () => {
    render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    expect(screen.queryByRole("heading", { name: "Переписки пока нет" })).toBeNull();
    expect(screen.getByLabelText("Текст сообщения")).toBeInTheDocument();
    expect(screen.getByText("Сообщений пока нет. Напишите первым.")).toBeInTheDocument();
  });
});

describe("беседа на телефоне", () => {
  it("открытая беседа прячет нижнюю панель (метка) и закрепляется под шапкой", () => {
    // Телефон: ширина окна как у Android-экрана; на компьютере страницу не блокируем
    vi.stubGlobal("innerWidth", 390);
    const { container } = render(<StudentMessages initialThreads={[item("a", { draft: "x" })]} initialThread={view("a")} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-hides-bottom-tabs");
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("top-14");
    expect(root.className).toContain("bottom-0");
    // Страница вокруг не прокручивается (globals.css: html[data-chat-open])
    expect(document.documentElement).toHaveAttribute("data-chat-open");
  });

  it("список без открытой беседы панель оставляет и ничего не закрепляет", () => {
    const { container } = render(<StudentMessages initialThreads={[item("a", { draft: "x" })]} initialThread={null} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute("data-hides-bottom-tabs");
    expect(root.className).not.toContain("fixed");
    expect(document.documentElement).not.toHaveAttribute("data-chat-open");
  });

  it("лента прокручивается сама, шапка и форма не сжимаются, поле ввода не растёт без предела", () => {
    render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    const input = screen.getByLabelText("Текст сообщения");
    expect(input.className).toContain("max-h-32");
    const form = input.closest("form")!;
    expect(form.className).toContain("shrink-0");
    const scroller = form.previousElementSibling as HTMLElement;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("overscroll-contain");
    expect(scroller.className).toContain("min-h-0");
  });

  it("метка снимается, когда вернулись к списку", async () => {
    const { container } = render(<StudentMessages initialThreads={[item("a", { draft: "x" })]} initialThread={view("a", { draft: "x" })} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-hides-bottom-tabs");
    fireEvent.click(screen.getByRole("button", { name: "К списку диалогов" }));
    await waitFor(() => expect(root).not.toHaveAttribute("data-hides-bottom-tabs"));
    expect(document.documentElement).not.toHaveAttribute("data-chat-open");
  });

  it("беседа не открылась — возвращаемся к списку, а не остаёмся на пустом экране", async () => {
    actions.loadThreadAction.mockResolvedValue(null);
    const { container } = render(<StudentMessages initialThreads={[item("a", { draft: "x", draftAt: "2026-10-05T10:00:00.000Z" })]} initialThread={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Студент a/ }));
    const root = container.firstElementChild as HTMLElement;
    await waitFor(() => expect(actions.loadThreadAction).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(root).not.toHaveAttribute("data-hides-bottom-tabs"));
  });
});

describe("черновик в поле ввода", () => {
  it("текст автосохраняется после паузы в 800 мс и подставляется при возврате", async () => {
    vi.useFakeTimers();
    const first = render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    const input = screen.getByLabelText("Текст сообщения");
    fireEvent.change(input, { target: { value: "Добрый" } });
    fireEvent.change(input, { target: { value: "Добрый день" } });
    expect(actions.saveStudentDraftAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS - 50);
    });
    expect(actions.saveStudentDraftAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(actions.saveStudentDraftAction).toHaveBeenCalledTimes(1);
    expect(actions.saveStudentDraftAction).toHaveBeenCalledWith("a", "Добрый день");
    first.unmount();

    // Вернулись в беседу: сервер отдал черновик — он в поле
    render(<StudentMessages initialThreads={[item("a", { draft: "Добрый день" })]} initialThread={view("a", { draft: "Добрый день" })} />);
    expect(screen.getByLabelText("Текст сообщения")).toHaveValue("Добрый день");
  });

  it("не дожидаясь паузы: уход с экрана беседы тоже сохраняет", async () => {
    render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    fireEvent.change(screen.getByLabelText("Текст сообщения"), { target: { value: "Недописанное" } });
    fireEvent.click(screen.getByRole("button", { name: "К списку диалогов" }));
    await waitFor(() => expect(actions.saveStudentDraftAction).toHaveBeenCalledWith("a", "Недописанное"));
  });

  it("сворачивание вкладки сохраняет недописанное", async () => {
    render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    fireEvent.change(screen.getByLabelText("Текст сообщения"), { target: { value: "Пока не отправил" } });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await waitFor(() => expect(actions.saveStudentDraftAction).toHaveBeenCalledWith("a", "Пока не отправил"));
  });

  it("очистка поля отправляет пустой текст — сервер удалит черновик", async () => {
    vi.useFakeTimers();
    render(<StudentMessages initialThreads={[]} initialThread={view("a", { draft: "было" })} />);
    fireEvent.change(screen.getByLabelText("Текст сообщения"), { target: { value: "" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS + 50);
    });
    expect(actions.saveStudentDraftAction).toHaveBeenCalledWith("a", "");
  });

  it("отправка: текст уходит сообщением, ожидающее автосохранение не срабатывает после", async () => {
    vi.useFakeTimers();
    actions.loadThreadAction.mockResolvedValue(view("a"));
    actions.loadThreadsAction.mockResolvedValue([]);
    render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    const input = screen.getByLabelText("Текст сообщения");
    fireEvent.change(input, { target: { value: "Приглашаем" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS * 3);
    });
    expect(actions.sendStudentMessageAction).toHaveBeenCalledWith("a", "Приглашаем");
    expect(actions.saveStudentDraftAction).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("после отправки уход из беседы черновик не возвращает", async () => {
    actions.loadThreadAction.mockResolvedValue(view("a"));
    actions.loadThreadsAction.mockResolvedValue([]);
    const { unmount } = render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    fireEvent.change(screen.getByLabelText("Текст сообщения"), { target: { value: "Ушло" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(actions.sendStudentMessageAction).toHaveBeenCalledTimes(1));
    unmount();
    expect(actions.saveStudentDraftAction).not.toHaveBeenCalled();
  });

  it("отправка не удалась — текст остаётся в поле и сохраняется как черновик", async () => {
    actions.sendStudentMessageAction.mockResolvedValue({ error: "Платформа недоступна" });
    render(<StudentMessages initialThreads={[]} initialThread={view("a")} />);
    const input = screen.getByLabelText("Текст сообщения");
    fireEvent.change(input, { target: { value: "Не ушло" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Платформа недоступна")).toBeInTheDocument();
    expect(input).toHaveValue("Не ушло");
    await waitFor(() => expect(actions.saveStudentDraftAction).toHaveBeenCalledWith("a", "Не ушло"));
  });
});

describe("withDraft: список после правки черновика на странице", () => {
  const summary = view("a");
  it("черновик добавляет беседу без сообщений в список", () => {
    const list = withDraft([], summary, "Привет", "2026-10-05T10:00:00.000Z");
    expect(list.map((t) => t.applicationId)).toEqual(["a"]);
    expect(list[0].draft).toBe("Привет");
    expect("messages" in list[0]).toBe(false);
  });
  it("очистка убирает беседу без сообщений, но не трогает беседу с сообщением", () => {
    const withText = withDraft([], summary, "Привет", "2026-10-05T10:00:00.000Z");
    expect(withDraft(withText, summary, "  ", "2026-10-05T10:01:00.000Z")).toEqual([]);

    const talked = view("b", { lastMessageBody: "Здравствуйте", lastMessageAuthor: "STUDENT", lastMessageAt: "2026-10-05T09:00:00.000Z" });
    const listed = withDraft([], talked, "Ответ", "2026-10-05T10:00:00.000Z");
    const cleared = withDraft(listed, talked, "", "2026-10-05T10:01:00.000Z");
    expect(cleared.map((t) => t.applicationId)).toEqual(["b"]);
    expect(cleared[0].draft).toBeNull();
  });
});

describe("анкета отклика: «Написать студенту»", () => {
  const application = {
    id: "app_77",
    vacancyId: "vac_1",
    vacancyTitle: "Бариста",
    status: "NEW" as const,
    createdAt: "2026-10-05T08:00:00.000Z",
    student: {
      fullName: "Иван Петров",
      university: "МГУ",
      studyLevel: "BACHELOR",
      studyYear: 2,
      speciality: "Экономика",
      age: 20,
      city: "Москва",
      workDays: [],
      hoursPerWeek: null,
      email: "ivan@example.com",
      phone: null,
      skills: [],
      about: null,
      hasPhoto: false,
      hasResume: false,
      resumeName: null,
      studyVerified: true,
    },
  };

  it("кнопка в раскрытой анкете ведёт в беседу с этим откликом", () => {
    nav.pathname = "/students/applications";
    render(<ApplicationsList applications={[application] as never} />);
    // В свёрнутой карточке кнопки нет
    expect(screen.queryByRole("link", { name: /Написать студенту/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Иван Петров/ }));
    const link = screen.getByRole("link", { name: /Написать студенту/ });
    expect(link).toHaveAttribute("href", "/students/messages?thread=app_77");
  });
});

describe("вкладки раздела", () => {
  const rect = (left: number, width: number) =>
    ({ left, right: left + width, width, top: 0, bottom: 30, height: 30, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

  it("ряд без серой полосы прокрутки и с запасом снизу", () => {
    render(<StudentsTabs newApplications={0} unreadMessages={0} />);
    const row = screen.getByRole("navigation");
    expect(row.className).toContain("pill-scroller");
  });

  it("активная вкладка при загрузке прокручивается в видимую область, «Сообщения» тоже достижима", () => {
    nav.pathname = "/students/messages";
    // Ряд 300 px шире экрана: вкладки 0–90, 98–188, 196–286, 294–420 (активная «Сообщения»)
    const proto = HTMLElement.prototype;
    const originalRect = proto.getBoundingClientRect;
    const originalWidth = Object.getOwnPropertyDescriptor(proto, "clientWidth");
    proto.getBoundingClientRect = function (this: HTMLElement) {
      if (this.tagName === "NAV") return rect(0, 300);
      const label = this.textContent ?? "";
      if (label.startsWith("Вакансии")) return rect(0, 90);
      if (label.startsWith("Отклики")) return rect(98, 90);
      if (label.startsWith("Кандидаты")) return rect(196, 90);
      if (label.startsWith("Сообщения")) return rect(294, 126);
      return rect(0, 0);
    };
    Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 300 });
    try {
      render(<StudentsTabs newApplications={0} unreadMessages={0} />);
      const row = screen.getByRole("navigation");
      // Правая граница активной (420) + запас 8 − ширина ряда 300
      expect(row.scrollLeft).toBe(128);
      expect(within(row).getByRole("link", { name: "Сообщения" })).toHaveAttribute("aria-current", "page");
    } finally {
      proto.getBoundingClientRect = originalRect;
      if (originalWidth) Object.defineProperty(proto, "clientWidth", originalWidth);
      else delete (proto as unknown as Record<string, unknown>).clientWidth;
    }
  });

  it("активная первая вкладка — ряд остаётся в начале", () => {
    nav.pathname = "/students";
    render(<StudentsTabs newApplications={0} unreadMessages={0} />);
    expect(screen.getByRole("navigation").scrollLeft).toBe(0);
  });
});
