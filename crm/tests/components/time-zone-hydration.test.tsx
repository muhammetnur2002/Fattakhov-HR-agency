// @vitest-environment jsdom
/**
 * Время на сервере и в браузере совпадает, даже если зоны процессов разные.
 *
 * Контейнер стоит в UTC, браузер человека — в своей зоне, а в профиле
 * записана третья. Раньше компоненты форматировали время без зоны: серверная
 * разметка и первый кадр гидратации показывали разные часы, React
 * сообщал «Text content does not match» и пересобирал дерево. Здесь та же
 * разметка рисуется на «сервере» (renderToString при одной зоне процесса)
 * и гидратируется в «браузере» (другая зона) — расхождений быть не должно.
 *
 * Контрольный компонент в начале файла считает по-старому, без зоны.
 * Он обязан расходиться: иначе стенд ничего не ловит и зелёное ниже
 * ничего не доказывает.
 */
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { markReadAction } = vi.hoisted(() => ({ markReadAction: vi.fn() }));
vi.mock("@/app/actions/notifications", () => ({ markReadAction, markAllReadAction: vi.fn() }));
vi.mock("@/app/(public)/schedule/[token]/actions", () => ({
  confirmSlotAction: vi.fn(),
  requestOtherSlotsAction: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DirectConversationList } from "@/components/messages/direct-conversation-list";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { TimeZoneProvider } from "@/components/shell/time-zone-provider";
import { NotificationHistory } from "@/components/shell/notification-history";
import { formatInZone } from "@/lib/format-date";
import type { DirectConversation } from "@/lib/services/messages";

// 12 октября 2026, 21:30 UTC. Москва +3: 00:30 уже 13-го. Нью-Йорк −4: 17:30 12-го.
const MOMENT = new Date("2026-10-12T21:30:00Z");
const SERVER_ZONE = "UTC";
const BROWSER_ZONE = "America/New_York";
const PROFILE_ZONE = "Europe/Moscow";

const originalTz = process.env.TZ;
let errors: string[] = [];
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = [];
  consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  document.body.innerHTML = "";
});

/**
 * Разметка «сервера» в одной зоне процесса, гидратация «браузера» в другой.
 * Возвращает текст до и после, а также всё, что React счёл расхождением.
 */
function serverThenBrowser(ui: React.ReactElement) {
  process.env.TZ = SERVER_ZONE;
  const html = renderToString(ui);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const serverText = container.textContent ?? "";

  process.env.TZ = BROWSER_ZONE;
  const recoverable: string[] = [];
  act(() => {
    hydrateRoot(container, ui, { onRecoverableError: (e) => recoverable.push(String(e)) });
  });
  return { serverText, browserText: container.textContent ?? "", recoverable };
}

const mismatches = () => errors.filter((m) => /hydrat|did not match|Text content/i.test(m));

describe("стенд ловит старую ошибку", () => {
  it("зона процесса сдвигает часы между сервером и браузером", () => {
    // Если зона процесса не подменяется — тесты ниже ничего не проверяют
    process.env.TZ = SERVER_ZONE;
    const serverHour = new Date(MOMENT).getHours();
    process.env.TZ = BROWSER_ZONE;
    expect(new Date(MOMENT).getHours()).not.toBe(serverHour);
  });

  it("форматирование без зоны расходится при гидратации", () => {
    function Legacy() {
      return <span>{new Date(MOMENT).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>;
    }
    const { serverText, browserText, recoverable } = serverThenBrowser(<Legacy />);
    expect(serverText).toBe("21:30");
    expect(recoverable.length + mismatches().length).toBeGreaterThan(0);
    expect(browserText).not.toBe(serverText);
  });
});

describe("время с зоной одинаково на сервере и в браузере", () => {
  it("общая функция: строка не зависит от зоны процесса", () => {
    function Stamp() {
      return <span>{formatInZone(MOMENT, "dayMonthTime", PROFILE_ZONE)}</span>;
    }
    const { serverText, browserText, recoverable } = serverThenBrowser(<Stamp />);
    expect(serverText).toBe("13 октября в 00:30");
    expect(browserText).toBe(serverText);
    expect(recoverable).toEqual([]);
    expect(mismatches()).toEqual([]);
  });

  it("история уведомлений берёт зону профиля из провайдера", () => {
    const ui = (
      <TimeZoneProvider timeZone={PROFILE_ZONE}>
        <NotificationHistory
          items={[
            { id: "n1", title: "Событие", body: null, linkUrl: null, isRead: true, createdAt: MOMENT },
          ]}
          hasMore={false}
          loadMoreHref="/notifications"
        />
      </TimeZoneProvider>
    );
    const { serverText, browserText, recoverable } = serverThenBrowser(ui);
    expect(serverText).toContain("13 октября в 00:30");
    expect(browserText).toBe(serverText);
    expect(recoverable).toEqual([]);
    expect(mismatches()).toEqual([]);
  });

  it("другая зона профиля — другие часы, и снова без расхождения", () => {
    const ui = (
      <TimeZoneProvider timeZone="Asia/Vladivostok">
        <NotificationHistory
          items={[
            { id: "n1", title: "Событие", body: null, linkUrl: null, isRead: true, createdAt: MOMENT },
          ]}
          hasMore={false}
          loadMoreHref="/notifications"
        />
      </TimeZoneProvider>
    );
    const { serverText, browserText, recoverable } = serverThenBrowser(ui);
    expect(serverText).toContain("13 октября в 07:30");
    expect(browserText).toBe(serverText);
    expect(recoverable).toEqual([]);
  });

  it("список бесед: подпись «сегодня» считается в зоне профиля", () => {
    const conversation: DirectConversation = {
      user: {
        id: "u1",
        fullName: "Мария Петрова",
        role: "RECRUITER",
        clientName: null,
        avatarUrl: null,
        lastSeenAt: null,
      },
      lastMessage: { body: "Привет", createdAt: new Date("2026-10-01T09:00:00Z"), fromMe: false },
      unreadCount: 0,
    } as unknown as DirectConversation;
    const ui = (
      <DirectConversationList
        conversations={[conversation]}
        hrefBase="/a"
        emptyText="пусто"
        timeZone={PROFILE_ZONE}
      />
    );
    const { serverText, browserText, recoverable } = serverThenBrowser(ui);
    expect(serverText).toContain("1 окт.");
    expect(browserText).toBe(serverText);
    expect(recoverable).toEqual([]);
    expect(mismatches()).toEqual([]);
  });
});

describe("страница выбора времени у кандидата", () => {
  const slot = {
    id: "s1",
    startsAt: "2026-10-14T07:00:00.000Z",
    endsAt: "2026-10-14T08:00:00.000Z",
  };
  const NOW = new Date("2026-10-12T12:00:00Z").getTime();

  it("первый кадр в зоне встречи, затем зона браузера — без ошибки гидратации", () => {
    const ui = (
      <SlotPicker token="t" slots={[slot]} durationMinutes={60} now={NOW} initialTimeZone="Asia/Vladivostok" />
    );
    const { serverText, browserText, recoverable } = serverThenBrowser(ui);

    // Сервер не знает зону кандидата и рисует зону встречи: 07:00 UTC = 17:00 во Владивостоке
    expect(serverText).toContain("17:00");
    // Браузер в Нью-Йорке: те же 07:00 UTC = 03:00
    expect(browserText).toContain("03:00");
    expect(browserText).not.toContain("17:00");
    expect(recoverable).toEqual([]);
    expect(mismatches()).toEqual([]);
  });
});
