// @vitest-environment jsdom
/**
 * Колокольчик уведомлений работает с клавиатуры.
 *
 * Раньше список был меню Radix: Tab в нём перехватывается, а пункты были ссылками, а не
 * menuitem, — добраться до уведомлений без мыши было нельзя. Теперь это панель с обычным
 * порядком Tab: Enter открывает, Tab ходит по уведомлениям, Enter переходит по ссылке,
 * Esc закрывает и возвращает фокус на колокольчик.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { markReadAction, markAllReadAction } = vi.hoisted(() => ({
  markReadAction: vi.fn(),
  markAllReadAction: vi.fn(),
}));
vi.mock("@/app/actions/notifications", () => ({ markReadAction, markAllReadAction }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a
      href={href}
      onClick={(e) => {
        // Переход по ссылке в jsdom не нужен, нужен лишь обработчик
        e.preventDefault();
        onClick?.();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { NotificationBell, type BellNotification } from "@/components/shell/notification-bell";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  markReadAction.mockReset().mockResolvedValue(undefined);
  markAllReadAction.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

const note = (id: string, extra: Partial<BellNotification> = {}): BellNotification => ({
  id,
  title: `Событие ${id}`,
  body: null,
  linkUrl: `/vacancies/${id}`,
  isRead: false,
  createdAt: new Date(),
  ...extra,
});

function renderBell() {
  return render(
    <NotificationBell
      notifications={[note("one"), note("two"), note("plain", { linkUrl: null })]}
      unreadCount={3}
      historyHref="/notifications"
    />,
  );
}

describe("колокольчик с клавиатуры", () => {
  it("Enter на колокольчике открывает панель, фокус уходит внутрь, уведомление открывается по Enter", async () => {
    const user = userEvent.setup();
    renderBell();

    await user.tab();
    const bell = screen.getByRole("button", { name: "Уведомления, непрочитанных: 3" });
    expect(bell).toHaveFocus();

    await user.keyboard("{Enter}");
    const panel = await screen.findByRole("dialog", { name: "Уведомления" });
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    // Открыли — всё прочитано, как и раньше
    expect(markReadAction).toHaveBeenCalledWith(["one", "two", "plain"]);

    // Фокус на самой панели (Radix не переносит его на ссылки): читалка объявит её имя,
    // а первый Tab приводит к первому уведомлению
    await user.tab();
    expect(screen.getByRole("link", { name: /Событие one/ })).toHaveFocus();
  });

  it("Tab идёт по уведомлениям и доходит до «Все уведомления»", async () => {
    const user = userEvent.setup();
    renderBell();
    await user.tab();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "Уведомления" });

    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      await user.tab();
      order.push((document.activeElement as HTMLElement).textContent ?? "");
    }
    expect(order[0]).toContain("Событие one");
    expect(order[1]).toContain("Событие two");
    expect(order[2]).toContain("Все уведомления");
  });

  it("Enter на уведомлении переходит по нему и закрывает панель", async () => {
    const user = userEvent.setup();
    renderBell();
    await user.tab();
    await user.keyboard("{Enter}");
    const link = await screen.findByRole("link", { name: /Событие two/ });
    link.focus();
    await user.keyboard("{Enter}");

    expect(link).toHaveAttribute("href", "/vacancies/two");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Esc закрывает панель и возвращает фокус на колокольчик", async () => {
    const user = userEvent.setup();
    renderBell();
    await user.tab();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "Уведомления" });

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /^Уведомления/ })).toHaveFocus();
  });
});
