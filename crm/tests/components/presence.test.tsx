// @vitest-environment jsdom
/**
 * «В сети»: что рисуется и как стучится пульс.
 *
 * Пульс — раз в минуту, пока вкладка видна, и сразу при возврате на неё;
 * в фоне не стучится. Строка статуса не рисуется вовсе, когда сервер
 * статус не отдал (скрыт или не положен), — «давно» вместо него не
 * придумывается.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// Ссылка Next следит за видимостью через IntersectionObserver, которого в jsdom нет
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DirectConversationList } from "@/components/messages/direct-conversation-list";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { PresenceLabel } from "@/components/presence/presence-label";
import { PresenceRefresh } from "@/components/presence/presence-refresh";
import type { DirectConversation } from "@/lib/services/messages";

const NOW = new Date("2026-10-04T19:00:00Z"); // 22:00 по Москве

function visibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  visibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  router.refresh.mockReset();
});

describe("PresenceLabel", () => {
  it("«В сети» — с зелёной точкой, точка скрыта от экранного диктора", () => {
    const { container } = render(<PresenceLabel lastSeenAt={new Date(NOW.getTime() - 30_000)} />);

    expect(screen.getByText("В сети")).toBeInTheDocument();
    const dot = container.querySelector("[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("bg-emerald-500");
  });

  it("не в сети — без точки, текст на русском с «был(а)»", () => {
    const { container } = render(<PresenceLabel lastSeenAt={new Date("2026-10-03T18:40:00Z")} />);

    expect(screen.getByText("был(а) вчера в 21:40")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });

  it("не замерзает на моменте загрузки: через минуту «В сети» превращается в «был(а)…»", () => {
    render(<PresenceLabel lastSeenAt={new Date(NOW.getTime() - 60_000)} />);
    expect(screen.getByText("В сети")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(90_000);
    });

    expect(screen.getByText("был(а) 2 мин назад")).toBeInTheDocument();
  });

  it("принимает строку — Date после передачи в браузер может прийти ею", () => {
    render(<PresenceLabel lastSeenAt="2026-10-04T18:55:00.000Z" />);
    expect(screen.getByText("был(а) 5 мин назад")).toBeInTheDocument();
  });

  it("никогда не заходил — «был(а) давно»", () => {
    render(<PresenceLabel lastSeenAt={null} />);
    expect(screen.getByText("был(а) давно")).toBeInTheDocument();
  });
});

function conversation(presence: DirectConversation["user"]["presence"]): DirectConversation {
  return {
    user: {
      id: "usr_a",
      fullName: "Александр Очень-Длинная-Фамилия-Через-Дефис",
      role: "RECRUITER",
      position: null,
      clientName: null,
      avatarUrl: null,
      clientLogoUrl: null,
      presence,
    },
    lastMessage: { body: "Привет", createdAt: NOW, fromMe: false },
    unreadCount: 0,
  };
}

describe("список диалогов", () => {
  it("статус собеседника в строке диалога", () => {
    render(
      <DirectConversationList
        conversations={[conversation({ lastSeenAt: new Date(NOW.getTime() - 10_000) })]}
        hrefBase="/a"
        emptyText="пусто"
      />,
    );
    expect(screen.getByText("В сети")).toBeInTheDocument();
  });

  it("скрыл статус — строки статуса нет вовсе, даже «давно»", () => {
    render(
      <DirectConversationList conversations={[conversation(null)]} hrefBase="/a" emptyText="пусто" />,
    );
    expect(screen.queryByText(/был\(а\)/)).toBeNull();
    expect(screen.queryByText("В сети")).toBeNull();
  });
});

describe("PresenceHeartbeat", () => {
  function stubFetch(response: Partial<Response> = { status: 204, type: "basic" }) {
    const fetchMock = vi.fn(async () => response as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("стучится сразу при открытии и затем раз в минуту", async () => {
    const fetchMock = stubFetch();
    render(<PresenceHeartbeat />);

    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/presence",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("скрытая вкладка не стучится", async () => {
    visibility("hidden");
    const fetchMock = stubFetch();
    render(<PresenceHeartbeat />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("возврат на вкладку — пульс сразу, а не через минуту", async () => {
    visibility("hidden");
    const fetchMock = stubFetch();
    render(<PresenceHeartbeat />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    visibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("частые переключения вкладки не плодят запросы", async () => {
    const fetchMock = stubFetch();
    render(<PresenceHeartbeat />);
    await act(async () => {});

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("сессия кончилась (редирект на вход или 401) — больше не стучится", async () => {
    const fetchMock = stubFetch({ status: 0, type: "opaqueredirect" });
    render(<PresenceHeartbeat />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("нет сети — тихо, без исключений; следующий пульс всё равно будет", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PresenceHeartbeat />);
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("при закрытии вкладки таймер снят", async () => {
    const fetchMock = stubFetch();
    const { unmount } = render(<PresenceHeartbeat />);
    await act(async () => {});
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("PresenceRefresh", () => {
  it("обновляет экран раз в минуту, пока вкладка видна", () => {
    render(<PresenceRefresh />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("в фоне не обновляет", () => {
    visibility("hidden");
    render(<PresenceRefresh />);

    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(router.refresh).not.toHaveBeenCalled();
  });
});
