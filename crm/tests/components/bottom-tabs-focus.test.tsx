// @vitest-environment jsdom
/**
 * Шторка «Ещё» в нижней панели и фокус (замечание независимой проверки к PR #119).
 *
 * Шторка открывается кнопкой «Ещё» без SheetTrigger, поэтому фокус после закрытия возвращается руками
 * (`useReturnFocus`). Но плитки шторки — ссылки: нажатие закрывает шторку и уводит на другой раздел.
 * Возврат фокуса на «Ещё» после этого оставлял клавиатуру и читалку в нижней панели, а Next в это же время
 * ставил фокус на новой странице. Возвращать фокус нужно только когда человек остался на месте:
 * Escape, «Закрыть», плитка текущего раздела.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  // Ссылка Next без роутера не ходит; здесь нужен только щелчок, который доходит до onClick
  default: ({ href, children, ...rest }: React.ComponentProps<"a"> & { prefetch?: boolean; scroll?: boolean }) => (
    <a
      href={href}
      {...(Object.fromEntries(Object.entries(rest).filter(([key]) => key !== "prefetch" && key !== "scroll")) as React.ComponentProps<"a">)}
      onClick={(event) => {
        // Переход не нужен и не поддержан в jsdom: оставляем обработчик компонента, браузерный переход гасим
        rest.onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

import { BottomTabs } from "@/components/shell/bottom-tabs";
import { CLIENT_NAV } from "@/lib/nav";

afterEach(cleanup);

function setup() {
  render(<BottomTabs items={CLIENT_NAV} title="Старфиш" roleLabel="Администратор" siteHref="https://example.test" />);
  const more = screen.getByRole("button", { name: "Ещё" });
  more.focus();
  fireEvent.click(more);
  return { more };
}

describe("шторка «Ещё»: куда уходит фокус после закрытия", () => {
  it("Escape — фокус возвращается на «Ещё»", async () => {
    const { more } = setup();
    const sheet = await screen.findByRole("dialog");
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it("«Закрыть» — тоже", async () => {
    const { more } = setup();
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Закрыть" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it("плитка другого раздела уводит со страницы: фокус на «Ещё» не возвращается", async () => {
    const { more } = setup();
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("link", { name: /Календарь/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Даём закрытию отработать целиком: onCloseAutoFocus вызывается уже после того, как шторка ушла
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(document.activeElement).not.toBe(more);
  });

  it("плитка раздела, на котором человек уже стоит, никуда не ведёт: фокус возвращается, как при «Закрыть»", async () => {
    nav.pathname = "/calendar";
    const { more } = setup();
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("link", { name: /Календарь/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
    nav.pathname = "/dashboard";
  });
});
