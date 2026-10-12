// @vitest-environment jsdom
/**
 * Ожидание списка: фильтр, поиск и «Показать ещё» меняют только адрес, а новую выборку отдаёт
 * сервер. Пока она идёт, у поля или кнопки — индикатор, список помечен `aria-busy`, а когда
 * обновился — читалке экрана сказано один раз, из одного места.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Suspense, use, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/a/vacancies",
  search: "",
}));
const link = vi.hoisted(() => ({ pending: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next/link", () => ({
  // scroll — свойство Link, не <a>: до обычной ссылки оно не доходит
  default: ({ href, children, ...rest }: React.ComponentProps<"a"> & { scroll?: boolean }) => (
    <a href={href} {...(Object.fromEntries(Object.entries(rest).filter(([key]) => key !== "scroll")) as React.ComponentProps<"a">)}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: link.pending }),
}));

import { LoadMore } from "@/components/shell/load-more";
import {
  LIST_UPDATED_MESSAGE,
  PAGE_UPDATED_MESSAGE,
  ListPendingProvider,
  ListRegion,
  useListBusy,
  useListNavigation,
} from "@/components/shell/list-pending";
import { SearchField } from "@/components/shell/search-field";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Медленный сервер: `router.replace` внутри перехода запускает обновление, которое «повисает»
 * на ещё не выполненном обещании. Пока оно не выполнено, `isPending` перехода — true.
 */
let setTarget: ((url: string) => void) | null = null;
let slow: { promise: Promise<void>; resolve: () => void } | null = null;

function newSlow() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  slow = { promise, resolve };
}

function SlowServer({ children }: { children: React.ReactNode }) {
  const [target, set] = useState<string | null>(null);
  // Подставляем переключатель после показа: replace из мока вызовется позже, из перехода
  useEffect(() => {
    setTarget = set;
  }, [set]);
  if (target && slow) use(slow.promise);
  return <>{children}</>;
}

function renderInShell(ui: React.ReactNode) {
  return render(
    <ListPendingProvider>
      <Suspense fallback={null}>
        <SlowServer>{ui}</SlowServer>
      </Suspense>
      <ListRegion>
        <ul>
          <li>строка</li>
        </ul>
      </ListRegion>
    </ListPendingProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockImplementation((url: string) => setTarget?.(url));
  nav.pathname = "/a/vacancies";
  nav.search = "";
  slow = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  nav.replace.mockReset();
  link.pending = false;
});

const region = () => document.querySelector('[data-slot="list-region"]')!;
const live = () => document.querySelector('[data-slot="list-live"]')!;

describe("useListNavigation и поиск", () => {
  it("после паузы ввода адрес меняется без прокрутки, а пока сервер думает — индикатор у поля и aria-busy на списке", async () => {
    vi.useFakeTimers();
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Тов" } });
    expect(document.querySelector('[data-slot="list-search-pending"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/a/vacancies?q=%D0%A2%D0%BE%D0%B2", { scroll: false });
    expect(document.querySelector('[data-slot="list-search-pending"]')).not.toBeNull();
    expect(region().getAttribute("aria-busy")).toBe("true");
  });

  it("ответ пришёл — индикатор уходит, aria-busy снимается, читалке сказано «Список обновлён» один раз", async () => {
    vi.useFakeTimers();
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Тов" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(region().getAttribute("aria-busy")).toBe("true");
    expect(live().textContent).toBe("");

    slow!.resolve();
    await act(async () => {});
    expect(document.querySelector('[data-slot="list-search-pending"]')).toBeNull();
    expect(region().hasAttribute("aria-busy")).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(live().textContent).toBe(LIST_UPDATED_MESSAGE);
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(document.querySelectorAll('[data-slot="list-live"]')).toHaveLength(1);

    // и тишина через несколько секунд — повторного объявления нет
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(live().textContent).toBe("");
  });

  it("объявления нет, пока ожидания не было: страница не говорит «обновлён» сама по себе", async () => {
    vi.useFakeTimers();
    render(
      <ListPendingProvider>
        <ListRegion>
          <p>список</p>
        </ListRegion>
      </ListPendingProvider>,
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(live().textContent).toBe("");
    expect(region().hasAttribute("aria-busy")).toBe(false);
  });
});

/**
 * Замечание независимой проверки к PR #119: таймер поиска срабатывал и при показе страницы и
 * уходил на тот же адрес. С ожиданием в `startTransition` это стало видно: на каждом заходе в
 * список через 300 мс лупа сменялась спиннером, список тускнел, а читалке говорили «Список
 * обновлён» без единого действия человека.
 */
describe("поиск при показе страницы", () => {
  const box = () => screen.getByRole("textbox", { name: "Название" });

  async function settle(ms = 5000) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  function expectQuiet() {
    expect(nav.replace).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="list-search-pending"]')).toBeNull();
    expect(region().hasAttribute("aria-busy")).toBe(false);
    expect(live().textContent).toBe("");
  }

  it("пустой адрес и пустое поле: переход не уходит, ожидания и объявления нет", async () => {
    vi.useFakeTimers();
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);
    await settle();
    expectQuiet();
  });

  it("поле равно адресу (?q=Тов): переход не уходит", async () => {
    vi.useFakeTimers();
    nav.search = "q=%D0%A2%D0%BE%D0%B2";
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);
    expect((box() as HTMLInputElement).value).toBe("Тов");
    await settle();
    expectQuiet();
  });

  it("страница ?page=3 при показе остаётся на месте: сбрасывать её нужно только новым поиском", async () => {
    vi.useFakeTimers();
    nav.search = "q=%D0%A2%D0%BE%D0%B2&page=3";
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);
    await settle();
    expectQuiet();
  });

  it("набрали и вернули прежнее значение до паузы: переходить не за чем", async () => {
    vi.useFakeTimers();
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);
    fireEvent.change(box(), { target: { value: "Т" } });
    await settle(200);
    fireEvent.change(box(), { target: { value: "" } });
    await settle();
    expectQuiet();
  });

  it("новое значение уходит один раз и с первой страницы; возврат к исходному после этого — тоже уходит", async () => {
    vi.useFakeTimers();
    nav.search = "q=%D0%A2%D0%BE%D0%B2&page=3";
    newSlow();
    renderInShell(<SearchField placeholder="Название…" />);

    fireEvent.change(box(), { target: { value: "Склад" } });
    await settle(300);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenLastCalledWith("/a/vacancies?q=%D0%A1%D0%BA%D0%BB%D0%B0%D0%B4", { scroll: false });

    // Адрес ещё не успел обновиться (ответ не пришёл), а человек уже вернул прежнее слово
    fireEvent.change(box(), { target: { value: "Тов" } });
    await settle(300);
    expect(nav.replace).toHaveBeenCalledTimes(2);
    expect(nav.replace).toHaveBeenLastCalledWith("/a/vacancies?q=%D0%A2%D0%BE%D0%B2", { scroll: false });
  });
});

describe("что объявляет читалке экрана", () => {
  function Reporter({ busy }: { busy: boolean }) {
    useListBusy(busy);
    return null;
  }

  it("есть список на странице — «Список обновлён»", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ListPendingProvider>
        <Reporter busy />
        <ListRegion>
          <p>список</p>
        </ListRegion>
      </ListPendingProvider>,
    );
    rerender(
      <ListPendingProvider>
        <Reporter busy={false} />
        <ListRegion>
          <p>список</p>
        </ListRegion>
      </ListPendingProvider>,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(live().textContent).toBe(LIST_UPDATED_MESSAGE);
  });

  it("списка нет (чип «Период» на аналитике): «Страница обновлена», а не про список", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ListPendingProvider>
        <Reporter busy />
        <p>график</p>
      </ListPendingProvider>,
    );
    rerender(
      <ListPendingProvider>
        <Reporter busy={false} />
        <p>график</p>
      </ListPendingProvider>,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(live().textContent).toBe(PAGE_UPDATED_MESSAGE);
    expect(live().textContent).not.toBe(LIST_UPDATED_MESSAGE);
  });
});

describe("useListNavigation без провайдера", () => {
  function Bare() {
    const { navigate, pending } = useListNavigation();
    return (
      <button type="button" onClick={() => navigate("/x?q=1")}>
        {pending ? "ждём" : "идти"}
      </button>
    );
  }

  it("не падает вне каркаса: адрес меняется, общего состояния просто нет", () => {
    render(<Bare />);
    fireEvent.click(screen.getByRole("button"));
    expect(nav.replace).toHaveBeenCalledWith("/x?q=1", { scroll: false });
  });
});

describe("useListBusy", () => {
  function Reporter({ busy }: { busy: boolean }) {
    useListBusy(busy);
    return null;
  }

  it("сообщает о занятости и снимает её, когда компонент исчез посреди ожидания", () => {
    const { rerender } = render(
      <ListPendingProvider>
        <Reporter busy />
        <ListRegion>
          <p>список</p>
        </ListRegion>
      </ListPendingProvider>,
    );
    expect(region().getAttribute("aria-busy")).toBe("true");
    rerender(
      <ListPendingProvider>
        <ListRegion>
          <p>список</p>
        </ListRegion>
      </ListPendingProvider>,
    );
    expect(region().hasAttribute("aria-busy")).toBe(false);
  });
});

describe("«Показать ещё»", () => {
  it("обычная ссылка на следующую порцию; без ожидания индикатора нет", () => {
    render(<LoadMore href="/a/candidates?page=2" />);
    const a = screen.getByRole("link", { name: "Показать ещё" });
    expect(a.getAttribute("href")).toBe("/a/candidates?page=2");
    expect(document.querySelector('[data-slot="load-more-pending"]')).toBeNull();
  });

  it("пока порция грузится, в кнопке индикатор, а список выше — aria-busy", () => {
    link.pending = true;
    render(
      <ListPendingProvider>
        <ListRegion>
          <p>список</p>
        </ListRegion>
        <LoadMore href="/a/candidates?page=2" />
      </ListPendingProvider>,
    );
    expect(document.querySelector('[data-slot="load-more-pending"]')).not.toBeNull();
    expect(region().getAttribute("aria-busy")).toBe("true");
    // название ссылки не меняется: индикатор скрыт от читалки
    expect(screen.getByRole("link", { name: "Показать ещё" })).toBeTruthy();
  });
});

describe("выпадающий фильтр", () => {
  it("с pending вместо стрелки крутится индикатор", () => {
    render(
      <Select value="a">
        <SelectTrigger pending aria-label="Фильтр по статусу">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(document.querySelector('[data-slot="select-pending"]')).not.toBeNull();
  });

  it("без pending индикатора нет", () => {
    render(
      <Select value="a">
        <SelectTrigger aria-label="Фильтр по статусу">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(document.querySelector('[data-slot="select-pending"]')).toBeNull();
  });
});
