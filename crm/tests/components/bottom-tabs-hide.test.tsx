// @vitest-environment jsdom
/**
 * Нижняя панель разделов прячется при прокрутке вниз и возвращается
 * (просьба владельца 17.10.2026): подключение правил из lib/tabbar-visibility.ts
 * к настоящей панели и к настоящим событиям scroll, focus и pointerdown.
 *
 * Сами правила (пороги, края, закрепление) проверяет tests/tabbar-visibility.test.ts
 * таблицей событий; как это выглядит и ощущается в браузере — e2e
 * tests/e2e/bottom-tabs-hide.spec.ts. Здесь — то, что видно только на панели:
 * метка data-hidden после серии событий, таймер остановки, смена раздела,
 * учёт вложенных контейнеров по отдельности, фокус, шторка «Ещё» и то, что
 * старой механики (тускнение) больше нет. Отдельно — страховки от зависания перехода
 * в Safari на iPhone (принудительная перерисовка, доводка перехода, сверка после сна).
 *
 * jsdom не считает вёрстку: положение прокрутки подставляется руками через
 * scrollTop / scrollHeight / clientHeight, как это сделал бы браузер.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { BottomTabs } from "@/components/shell/bottom-tabs";
import { CLIENT_NAV } from "@/lib/nav";
import {
  TABBAR_DEBUG_KEY,
  TABBAR_NOHIDE_KEY,
  getTabbarDebug,
  resetTabbarDebug,
  writeTabbarNoHideFlag,
} from "@/lib/tabbar-debug";
import {
  FINISH_GUARD_MS,
  HEAL_FAIL_PAUSE_MS,
  HEAL_MIN_INTERVAL_MS,
  PIN_AFTER_ROUTE_MS,
  SETTLE_MS,
  TABBAR_SLIDE_MS,
} from "@/lib/tabbar-visibility";

/** Срок, через который хук доводит незаконченный переход до конца. */
const FINISH_AFTER_MS = TABBAR_SLIDE_MS + FINISH_GUARD_MS;

const PAGE_HEIGHT = 5000;
const WINDOW_HEIGHT = 600;
/** Дальше этого страница не прокручивается. */
const PAGE_MAX = PAGE_HEIGHT - WINDOW_HEIGHT;

let pageY = 0;

/** Подставляет геометрию прокрутки элементу: jsdom её не считает. */
function giveGeometry(el: Element, get: () => number, height: number, visible: number) {
  Object.defineProperty(el, "scrollTop", { configurable: true, get });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => visible });
}

/** Страница прокручена до `y`: событие scroll приходит на document, как в браузере. */
function scrollPage(y: number) {
  pageY = y;
  fireEvent.scroll(document);
}

/** Вложенный список со своей прокруткой: scroll приходит на сам элемент и не всплывает. */
function makeList(height = 3000, visible = 300) {
  const list = document.createElement("div");
  let top = 0;
  giveGeometry(list, () => top, height, visible);
  document.body.append(list);
  return {
    el: list,
    scrollTo(y: number) {
      top = y;
      fireEvent.scroll(list);
    },
    /** Первое событие элемента лишь запоминает, откуда он начал. */
    prime(y: number) {
      top = y;
      fireEvent.scroll(list);
    },
  };
}

let focusVisible = true;
const realMatches = Element.prototype.matches;

beforeEach(() => {
  pageY = 0;
  nav.pathname = "/dashboard";
  giveGeometry(document.documentElement, () => pageY, PAGE_HEIGHT, WINDOW_HEIGHT);
  focusVisible = true;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" ? focusVisible : realMatches.call(this, selector);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  document.body.replaceChildren();
  window.localStorage.clear();
});

function renderTabs() {
  const view = render(
    <BottomTabs items={CLIENT_NAV} title="Старфиш" roleLabel="Администратор" siteHref="https://example.test" />,
  );
  const bar = screen.getByRole("navigation", { name: "Разделы" });
  return {
    bar,
    rerenderTabs: () =>
      view.rerender(
        <BottomTabs items={CLIENT_NAV} title="Старфиш" roleLabel="Администратор" siteHref="https://example.test" />,
      ),
    unmount: view.unmount,
  };
}

const isHidden = (bar: HTMLElement) => bar.hasAttribute("data-hidden");

describe("метка data-hidden при прокрутке вниз", () => {
  it("серия событий вниз по 10 px прячет панель на глубине больше 80 px, раньше — нет", () => {
    const { bar } = renderTabs();
    expect(isHidden(bar)).toBe(false);
    // 10, 20, 30, … : до 80 px глубина мала, прячется, когда глубже 80 и накоплено 24+
    for (const y of [10, 20, 30, 40, 50, 60, 70, 80]) {
      scrollPage(y);
      expect(isHidden(bar), `на ${y} px`).toBe(false);
    }
    scrollPage(90);
    expect(isHidden(bar)).toBe(true);
    // и продолжает быть спрятанной, пока листают дальше
    scrollPage(200);
    scrollPage(260);
    expect(isHidden(bar)).toBe(true);
  });

  it("дрожание ниже порога не прячет", () => {
    const { bar } = renderTabs();
    scrollPage(300);
    expect(isHidden(bar)).toBe(true);
    scrollPage(290); // назад на 10 — панель вернулась
    expect(isHidden(bar)).toBe(false);
    // Палец ходит вперёд-назад: каждый шаг вниз 10 px, назад 6 px — до порога в 24 px подряд не доходит
    let y = 290;
    for (let i = 0; i < 20; i++) {
      scrollPage((y += 10));
      scrollPage((y -= 6));
    }
    expect(isHidden(bar)).toBe(false);
  });

  it("при прокрутке вверх на 8 px возвращается сразу, на 7 — нет", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    scrollPage(493);
    expect(isHidden(bar)).toBe(true);
    scrollPage(485); // всего вверх 15 подряд
    expect(isHidden(bar)).toBe(false);
  });

  it("в самом верху и в самом низу страницы видна всегда", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    scrollPage(8);
    expect(isHidden(bar)).toBe(false);

    scrollPage(600);
    expect(isHidden(bar)).toBe(true);
    scrollPage(PAGE_MAX - 8);
    expect(isHidden(bar)).toBe(false);
    // и не прячется, пока остаётся у конца
    scrollPage(PAGE_MAX);
    expect(isHidden(bar)).toBe(false);
  });

  it("«резинка» iOS за краями не считается листанием вниз", () => {
    const { bar } = renderTabs();
    scrollPage(-30);
    scrollPage(-12);
    scrollPage(0);
    expect(isHidden(bar)).toBe(false);
    scrollPage(PAGE_MAX + 25);
    scrollPage(PAGE_MAX);
    expect(isHidden(bar)).toBe(false);
  });

  it("горизонтальная прокрутка (вертикаль не сдвинулась) ничего не меняет, ни метку, ни таймер", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    act(() => vi.advanceTimersByTime(SETTLE_MS - 100));
    // Лента чипов едет вбок: вертикальное положение страницы то же
    scrollPage(500);
    act(() => vi.advanceTimersByTime(99));
    expect(isHidden(bar)).toBe(true);
    // и таймер остановки отсчитывался от вертикальной прокрутки, а не от бокового события
    act(() => vi.advanceTimersByTime(1));
    expect(isHidden(bar)).toBe(false);
  });
});

describe("возврат по остановке прокрутки", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));

  it("через 600 мс без событий панель на месте: за 599 — ещё нет", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    act(() => vi.advanceTimersByTime(SETTLE_MS - 1));
    expect(isHidden(bar)).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(isHidden(bar)).toBe(false);
  });

  it("каждое новое событие откладывает возврат: считается от последнего", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    act(() => vi.advanceTimersByTime(400));
    scrollPage(560);
    act(() => vi.advanceTimersByTime(400)); // 800 от первого, 400 от второго
    expect(isHidden(bar)).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(isHidden(bar)).toBe(false);
  });

  it("после возврата панель прячется снова, как только листание вниз продолжилось", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(isHidden(bar)).toBe(false);
    scrollPage(530);
    expect(isHidden(bar)).toBe(true);
  });

  it("при размонтировании таймер и слушатели сняты: метку после этого никто не трогает", () => {
    const { bar, unmount } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    unmount();
    // Не снятый таймер остановки убрал бы метку с уже ушедшего элемента через 600 мс
    act(() => vi.advanceTimersByTime(SETTLE_MS * 2));
    expect(isHidden(bar)).toBe(true);
    // Не снятый слушатель на прокрутку вверх убрал бы метку с ушедшего элемента
    expect(() => scrollPage(100)).not.toThrow();
    expect(isHidden(bar)).toBe(true);
  });
});

describe("смена раздела", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));

  it("панель на месте и 2500 мс не прячется; потом прячется", () => {
    const { bar, rerenderTabs } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);

    nav.pathname = "/vacancies";
    rerenderTabs();
    expect(isHidden(bar)).toBe(false);

    act(() => vi.advanceTimersByTime(300));
    scrollPage(900); // новая страница, первые движения пальца
    scrollPage(1300);
    expect(isHidden(bar)).toBe(false);

    act(() => vi.advanceTimersByTime(PIN_AFTER_ROUTE_MS - 300 - 1));
    scrollPage(1700);
    expect(isHidden(bar), "за 1 мс до конца закрепления").toBe(false);

    act(() => vi.advanceTimersByTime(1));
    scrollPage(2100);
    expect(isHidden(bar)).toBe(true);
  });

  it("первое открытие страницы закреплением не считается: листание сразу после загрузки прячет", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
  });

  it("перерисовка с тем же адресом закрепления не даёт", () => {
    const { bar, rerenderTabs } = renderTabs();
    rerenderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
  });
});

describe("вложенные контейнеры", () => {
  it("прокрутка вложенного списка прячет панель, прокрутка списка вверх — возвращает", () => {
    const { bar } = renderTabs();
    const list = makeList();
    list.prime(0);
    list.scrollTo(300);
    expect(isHidden(bar)).toBe(true);
    list.scrollTo(280);
    expect(isHidden(bar)).toBe(false);
  });

  it("направление считается по каждому элементу отдельно: сдвиг списка не принимается за сдвиг страницы", () => {
    const { bar } = renderTabs();
    const list = makeList();
    list.prime(400);
    scrollPage(1000); // страница глубоко, панель спрятана
    expect(isHidden(bar)).toBe(true);
    // Список чуть подвинули вверх: у него это 5 px, а не «1000 → 395 = вверх на 605»
    list.scrollTo(395);
    expect(isHidden(bar)).toBe(true);
    // Страница ещё немного вниз: не «395 → 1010 = вниз на 615» от списка
    scrollPage(1010);
    expect(isHidden(bar)).toBe(true);
    // а настоящий возврат по списку — когда он сам прокрутился вверх на 8 и больше
    list.scrollTo(380);
    expect(isHidden(bar)).toBe(false);
  });

  it("первое событие элемента лишь запоминает положение: прятать нечем", () => {
    const { bar } = renderTabs();
    const list = makeList();
    list.prime(800);
    expect(isHidden(bar)).toBe(false);
  });

  it("у конца списка панель на месте, как у конца страницы", () => {
    const { bar } = renderTabs();
    const list = makeList(3000, 300); // прокручивается до 2700
    list.prime(0);
    list.scrollTo(900);
    expect(isHidden(bar)).toBe(true);
    list.scrollTo(2700);
    expect(isHidden(bar)).toBe(false);
  });

  it("список, который едет только вбок, не мешает: его вертикаль на месте", () => {
    const { bar } = renderTabs();
    const strip = makeList(0, 0);
    strip.prime(0);
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    strip.scrollTo(0); // боковая прокрутка ленты: вертикаль не изменилась
    expect(isHidden(bar)).toBe(true);
  });
});

describe("фокус и касание", () => {
  it("клавиатурный фокус в панели показывает её и держит видимой, пока он внутри", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);

    act(() => within(bar).getByRole("link", { name: /Вакансии/ }).focus());
    expect(isHidden(bar)).toBe(false);
    scrollPage(900);
    scrollPage(1300);
    expect(isHidden(bar)).toBe(false);

    // Перешёл на соседнюю вкладку: фокус из панели не уходил
    act(() => within(bar).getByRole("link", { name: /Кандидаты/ }).focus());
    scrollPage(1700);
    expect(isHidden(bar)).toBe(false);

    // Фокус ушёл со вкладок — панель снова может спрятаться, но не от накопленного под фокусом
    act(() => within(bar).getByRole("link", { name: /Кандидаты/ }).blur());
    scrollPage(1710);
    expect(isHidden(bar)).toBe(false);
    scrollPage(1740);
    expect(isHidden(bar)).toBe(true);
  });

  it("фокус от нажатия пальцем (не клавиатурный) показывает панель, но прятать ей не мешает", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    focusVisible = false;
    act(() => within(bar).getByRole("link", { name: /Вакансии/ }).focus());
    expect(isHidden(bar)).toBe(false);
    scrollPage(900);
    expect(isHidden(bar)).toBe(true);
  });

  it("касание панели возвращает её", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    fireEvent.pointerDown(bar);
    expect(isHidden(bar)).toBe(false);
  });
});

describe("шторка «Ещё»", () => {
  it("пока шторка открыта, панель не прячется; закрыли пальцем — прячется как обычно", async () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);

    fireEvent.click(within(bar).getByRole("button", { name: "Ещё" }));
    const sheet = await screen.findByRole("dialog");
    expect(isHidden(bar)).toBe(false);
    scrollPage(900);
    scrollPage(1300);
    expect(isHidden(bar)).toBe(false);

    // Закрыли нажатием: фокус вернулся на «Ещё» программно и клавиатурным не считается
    focusVisible = false;
    fireEvent.click(within(sheet).getByRole("button", { name: "Закрыть" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    scrollPage(1700);
    expect(isHidden(bar)).toBe(true);
  });

  it("закрыли с клавиатуры: фокус вернулся на «Ещё» внутри панели и держит её видимой, пока он там", async () => {
    const { bar } = renderTabs();
    fireEvent.click(within(bar).getByRole("button", { name: "Ещё" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(bar).getByRole("button", { name: "Ещё" })));
    scrollPage(500);
    expect(isHidden(bar)).toBe(false);
    // Фокус ушёл со вкладок — прятаться можно
    act(() => (document.activeElement as HTMLElement).blur());
    scrollPage(900);
    expect(isHidden(bar)).toBe(true);
  });
});

describe("доступность спрятанной панели", () => {
  it("остаётся в дереве страницы: не скрыта от читалки и клавиатуры, вкладки и порядок на месте", () => {
    const { bar } = renderTabs();
    nav.pathname = "/dashboard";
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);

    for (const attr of ["aria-hidden", "inert", "hidden"]) expect(bar.hasAttribute(attr), attr).toBe(false);
    const links = within(bar).getAllByRole("link");
    expect(links.map((a) => a.textContent?.trim())).toEqual(["Дашборд", "Вакансии", "Кандидаты", "Сообщения"]);
    for (const link of links) {
      expect(link.hasAttribute("aria-hidden")).toBe(false);
      expect(link.tabIndex).not.toBe(-1);
    }
    // Текущий раздел не потерян
    expect(within(bar).getByRole("link", { name: /Дашборд/ })).toHaveAttribute("aria-current", "page");
    expect(within(bar).getByRole("button", { name: "Ещё" })).toBeVisible();
  });
});

describe("старого тускнения больше нет", () => {
  it("ни прокрутка, ни пауза в несколько секунд не ставят прежнюю метку и стили", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const { bar } = renderTabs();
    const dim = ["data", "dim"].join("-");
    scrollPage(500);
    expect(bar.hasAttribute(dim)).toBe(false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(bar.hasAttribute(dim)).toBe(false);
    for (const el of [bar, ...Array.from(bar.querySelectorAll<HTMLElement>("*"))]) {
      expect(el.style.filter, "размытие вкладок").toBe("");
    }
  });
});

describe("«уменьшить движение»", () => {
  it("переход панели выключается классом motion-reduce, а не остаётся включённым", () => {
    // Вычисленный переход в jsdom не посчитать (e2e делает это в браузере с emulateMedia);
    // здесь — что панель не выставляет переход чем-то, что перебило бы класс
    const { bar } = renderTabs();
    const classes = bar.className.split(/\s+/);
    // Только transform: прозрачность в переходе в Safari на iPhone зависала на середине
    expect(classes).toContain("transition-[transform]");
    expect(classes).not.toContain("transition-[transform,opacity]");
    expect(classes).toContain("motion-reduce:transition-none");
    expect(bar.style.transition).toBe("");
    expect(bar.style.transform).toBe("");
    expect(bar.style.opacity).toBe("");
  });
});

/*
  Страховки от зависания перехода в Safari на iPhone (жалоба владельца после PR #144: панель
  при прокрутке оставалась полупрозрачной или наполовину и не возвращалась ни вверх, ни у верха,
  ни на другом разделе, пока не коснёшься). Настоящий Safari здесь недоступен: проверяется,
  что хук делает всё, что от него требуется, — перерисовывает после записи метки, доводит
  застывший переход и сверяет панель после сна, — а не что WebKit от этого оживает.
*/
describe("страховки от зависания перехода", () => {
  const proto = HTMLElement.prototype as unknown as { getAnimations?: unknown };
  let finish: ReturnType<typeof vi.fn>;
  let visibility: "visible" | "hidden";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    finish = vi.fn();
    Object.defineProperty(proto, "getAnimations", { configurable: true, writable: true, value: () => [{ finish }] });
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  });

  afterEach(() => {
    delete proto.getAnimations;
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    delete (window as unknown as { visualViewport?: unknown }).visualViewport;
  });

  /** Страница вернулась к человеку без единого события scroll (кэш «назад», сон вкладки). */
  const pageShow = () => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  const wake = () => {
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  };

  describe("доводка перехода", () => {
    it("через 260 мс после смены метки: за 259 переход не трогают, на 260-й доводят до конца", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      expect(isHidden(bar)).toBe(true);
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS - 1));
      expect(finish).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(finish).toHaveBeenCalledTimes(1);
    });

    it("считается от последней смены: новая смена откладывает доводку, а не режет честный переход", () => {
      const { bar } = renderTabs();
      scrollPage(500); // спрятана, t = 0
      act(() => vi.advanceTimersByTime(200));
      scrollPage(485); // вверх на 15: вернулась, t = 200
      expect(isHidden(bar)).toBe(false);
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS - 1));
      expect(finish, "от первой смены прошло 459 мс, от последней — 259").not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(finish).toHaveBeenCalledTimes(1);
    });

    it("и при возврате по остановке прокрутки: метка снята — доводка заведена заново", () => {
      renderTabs();
      scrollPage(500);
      act(() => vi.advanceTimersByTime(SETTLE_MS)); // settle показал панель
      finish.mockClear();
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS));
      expect(finish).toHaveBeenCalledTimes(1);
    });

    it("пока метка не менялась, доводка не заводится: листание посреди страницы переход не трогает", () => {
      renderTabs();
      scrollPage(500);
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS)); // спрятана, доведена
      finish.mockClear();
      act(() => scrollPage(560)); // всё ещё спрятана, метка та же
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS - 1));
      expect(finish).not.toHaveBeenCalled();
    });

    it("доводит все переходы панели и не падает, если один из них закончить нельзя", () => {
      const bad = vi.fn(() => {
        throw new DOMException("уже снят", "InvalidStateError");
      });
      const good = vi.fn();
      Object.defineProperty(proto, "getAnimations", { configurable: true, writable: true, value: () => [{ finish: bad }, { finish: good }] });
      renderTabs();
      scrollPage(500);
      expect(() => act(() => vi.advanceTimersByTime(FINISH_AFTER_MS))).not.toThrow();
      expect(bad).toHaveBeenCalledTimes(1);
      expect(good).toHaveBeenCalledTimes(1);
    });

    it("без Web Animations API (старый браузер, jsdom) ничего не падает и метка по-прежнему ставится", () => {
      delete proto.getAnimations;
      const { bar } = renderTabs();
      expect(() => {
        scrollPage(500);
        act(() => vi.advanceTimersByTime(FINISH_AFTER_MS));
      }).not.toThrow();
      expect(isHidden(bar)).toBe(true);
    });

    it("getAnimations сам бросает — тоже не падает", () => {
      Object.defineProperty(proto, "getAnimations", {
        configurable: true,
        writable: true,
        value: () => {
          throw new Error("не поддерживается");
        },
      });
      const { bar } = renderTabs();
      scrollPage(500);
      expect(() => act(() => vi.advanceTimersByTime(FINISH_AFTER_MS))).not.toThrow();
      expect(isHidden(bar)).toBe(true);
    });

    it("после размонтирования доводка не вызывается: таймер снят", () => {
      const { unmount } = renderTabs();
      scrollPage(500);
      unmount();
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS * 3));
      expect(finish).not.toHaveBeenCalled();
    });
  });

  describe("принудительная перерисовка", () => {
    /** Чтения геометрии панели: что показывала метка в момент чтения. */
    function watchReads(bar: HTMLElement) {
      const reads: boolean[] = [];
      const real = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this === bar) reads.push(bar.hasAttribute("data-hidden"));
        return real.call(this);
      });
      return reads;
    }

    it("геометрия читается сразу после записи метки, а не до неё: в обе стороны", () => {
      const { bar } = renderTabs();
      const reads = watchReads(bar);
      scrollPage(500);
      expect(reads, "чтение после того, как метка встала").toEqual([true]);
      fireEvent.pointerDown(bar);
      expect(reads, "и после того, как метка снята").toEqual([true, false]);
    });

    it("листание без смены метки перерисовку не просит: десятки событий в секунду не дёргают раскладку", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      const reads = watchReads(bar);
      for (const y of [520, 540, 560, 580]) scrollPage(y);
      expect(reads).toEqual([]);
    });

    it("смена раздела перерисовывает панель всегда и снимает залипшую метку", () => {
      const { bar, rerenderTabs } = renderTabs();
      // Метка осталась на панели, хотя по состоянию она видна: так выглядит пропущенное событие
      bar.setAttribute("data-hidden", "");
      const reads = watchReads(bar);
      nav.pathname = "/vacancies";
      rerenderTabs();
      expect(isHidden(bar), "метка снята по состоянию").toBe(false);
      expect(reads.length, "перерисовка запрошена").toBeGreaterThanOrEqual(1);
      expect(reads.at(-1), "чтение — после снятия метки").toBe(false);
    });

    it("смена раздела при спрятанной панели: панель на месте и перерисована", () => {
      const { bar, rerenderTabs } = renderTabs();
      scrollPage(500);
      expect(isHidden(bar)).toBe(true);
      const reads = watchReads(bar);
      nav.pathname = "/candidates";
      rerenderTabs();
      expect(isHidden(bar)).toBe(false);
      expect(reads.at(-1)).toBe(false);
      // и переход, если застыл, доведут до конца
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS));
      expect(finish).toHaveBeenCalled();
    });
  });

  describe("показ страницы (pageshow), в том числе из кэша «назад»", () => {
    it("спрятанная панель, страница вернулась у верха: панель на месте, переход доведён сразу", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      expect(isHidden(bar)).toBe(true);
      finish.mockClear();
      pageY = 0; // страница восстановлена наверху без события scroll
      act(() => pageShow());
      expect(isHidden(bar)).toBe(false);
      expect(finish, "не ждём 260 мс: переход устарел").toHaveBeenCalledTimes(1);
    });

    it("то же у низа страницы", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      pageY = PAGE_MAX - 3;
      act(() => pageShow());
      expect(isHidden(bar)).toBe(false);
    });

    it("посреди страницы спрятанная остаётся спрятанной, видимая — видимой", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      act(() => pageShow());
      expect(isHidden(bar)).toBe(true);
      scrollPage(0);
      pageY = 2000;
      act(() => pageShow());
      expect(isHidden(bar)).toBe(false);
    });

    it("залипшая метка при состоянии «видна» снимается", () => {
      const { bar } = renderTabs();
      bar.setAttribute("data-hidden", "");
      act(() => pageShow());
      expect(isHidden(bar)).toBe(false);
    });

    it("отсчёт следующей прокрутки идёт от места, где страница оказалась, а не от того, что было до сна", () => {
      const { bar } = renderTabs();
      // Страница восстановлена на 2000 px без события scroll, затем человек сдвинул её на 5 px.
      // От старого положения (0) это были бы 2005 px вниз и панель спряталась бы
      pageY = 2000;
      act(() => pageShow());
      scrollPage(2005);
      expect(isHidden(bar)).toBe(false);
    });
  });

  describe("вкладка снова видна (visibilitychange)", () => {
    it("вернулась и страница наверху — панель на месте; пока вкладка скрыта, ничего не трогаем", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      pageY = 0;
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      expect(isHidden(bar), "вкладка ушла в фон").toBe(true);
      finish.mockClear();
      act(() => wake());
      expect(isHidden(bar)).toBe(false);
      expect(finish).toHaveBeenCalledTimes(1);
    });

    it("посреди страницы состояние не меняется", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      act(() => wake());
      expect(isHidden(bar)).toBe(true);
    });
  });

  describe("смена размера окна и видимой области", () => {
    it("resize окна: страница наверху — панель на месте, посреди — как была; доводка идёт по сроку, не сразу", () => {
      const { bar } = renderTabs();
      scrollPage(500);
      finish.mockClear();
      act(() => void window.dispatchEvent(new Event("resize")));
      expect(isHidden(bar), "адресная строка свернулась посреди листания").toBe(true);
      expect(finish, "идущий переход не рвём").not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(FINISH_AFTER_MS));
      expect(finish).toHaveBeenCalledTimes(1);

      pageY = 3;
      act(() => void window.dispatchEvent(new Event("resize")));
      expect(isHidden(bar)).toBe(false);
    });

    it("visualViewport.resize делает то же", () => {
      const viewport = new EventTarget();
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      const { bar } = renderTabs();
      scrollPage(500);
      expect(isHidden(bar)).toBe(true);
      pageY = PAGE_MAX;
      act(() => void viewport.dispatchEvent(new Event("resize")));
      expect(isHidden(bar)).toBe(false);
    });

    it("слушатели окна и видимой области снимаются при размонтировании", () => {
      const viewport = new EventTarget();
      const add = vi.spyOn(viewport, "addEventListener");
      const remove = vi.spyOn(viewport, "removeEventListener");
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      const winAdd = vi.spyOn(window, "addEventListener");
      const winRemove = vi.spyOn(window, "removeEventListener");
      const { bar, unmount } = renderTabs();
      for (const event of ["pageshow", "resize"]) {
        expect(winAdd.mock.calls.some(([type]) => type === event), `window: ${event}`).toBe(true);
      }
      expect(add.mock.calls.map(([type]) => type)).toEqual(["resize"]);
      unmount();
      for (const event of ["pageshow", "resize"]) {
        // Среди слушателей окна могут быть и чужие (библиотеки): нужен хотя бы один наш, снятый тем же вызовом
        const added = winAdd.mock.calls.filter(([type]) => type === event).map(([, fn]) => fn);
        expect(
          added.some((fn) => winRemove.mock.calls.some(([type, removed]) => type === event && removed === fn)),
          `window: ${event}`,
        ).toBe(true);
      }
      expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0][1]);
      // После снятия слушателей событие не трогает ушедший элемент
      scrollPage(500);
      pageY = 0;
      expect(() => {
        pageShow();
        viewport.dispatchEvent(new Event("resize"));
      }).not.toThrow();
      expect(isHidden(bar)).toBe(false);
    });

    it("в окружении без visualViewport (jsdom, старый Safari) хук работает", () => {
      expect((window as unknown as { visualViewport?: unknown }).visualViewport).toBeUndefined();
      const { bar } = renderTabs();
      expect(() => scrollPage(500)).not.toThrow();
      expect(isHidden(bar)).toBe(true);
    });
  });
});

/*
  Самолечение положения панели и освежение слоя на iOS (просьба владельца: на скриншоте с iPhone
  панель висела полупрозрачной на ~260 pt выше нижнего края, как приклеенная к странице). jsdom
  вёрстки не считает, поэтому положение панели и окно подставляются руками: панель «нарисована»
  там, где скажет тест. Что лечение действительно оживляет WebKit, здесь не проверить — только
  что хук замечает неверное положение, пробует пересоздать слой ровно так, как задумано, не чаще
  положенного и не зацикливается.
*/
describe("самолечение положения панели", () => {
  const proto = HTMLElement.prototype as unknown as { getAnimations?: unknown };
  /** Окно 600 px (как у документа в этих тестах), зазор от низа 10, панель высотой 56. */
  const REST = { top: 534, bottom: 590 };
  const OFFSCREEN = { top: 624, bottom: 680 };

  let broken: null | { top: number; bottom: number };
  /** Чтения offsetHeight: какой display был у панели в момент чтения. */
  let heightReads: string[];
  /** Лечение «срабатывает»: пересоздание слоя (чтение высоты при display: none) чинит положение. */
  let healFixes: boolean;

  /** Как нарисована панель сейчас: по метке, если не сломана. */
  function rectOf(bar: HTMLElement) {
    const place = broken ?? (bar.hasAttribute("data-hidden") ? OFFSCREEN : REST);
    return { ...place, left: 16, right: 359, width: 343, height: 56, x: 16, y: place.top, toJSON: () => ({}) } as DOMRect;
  }

  function setup() {
    const view = renderTabs();
    const { bar } = view;
    bar.style.bottom = "10px";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === bar ? rectOf(bar) : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    });
    Object.defineProperty(bar, "offsetHeight", {
      configurable: true,
      get() {
        heightReads.push(bar.style.display);
        // Слой пересоздан (display: none и чтение): положение вернулось на место
        if (healFixes && bar.style.display === "none") broken = null;
        return 56;
      },
    });
    return view;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    resetTabbarDebug();
    broken = null;
    heightReads = [];
    healFixes = true;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
  });

  afterEach(() => {
    delete proto.getAnimations;
    delete (window as unknown as { visualViewport?: unknown }).visualViewport;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  });

  const healed = () => getTabbarDebug().healed;
  const log = () => getTabbarDebug().entries.map((e) => e.text);
  const resize = () => act(() => void window.dispatchEvent(new Event("resize")));
  const settleVerify = () => act(() => vi.advanceTimersByTime(TABBAR_SLIDE_MS + FINISH_GUARD_MS));

  it("панель на месте — и видимая, и спрятанная: сверка ничего не трогает", () => {
    const { bar } = setup();
    resize();
    settleVerify();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    settleVerify();
    fireEvent.pointerDown(bar);
    settleVerify();
    expect(healed()).toBe(0);
    expect(heightReads, "слой не пересоздавался").toEqual([]);
    expect(bar.style.display).toBe("");
  });

  it("спрятана по состоянию, а нарисована в окне (переход застыл, доводка не помогла): слой пересоздан", () => {
    const { bar } = setup();
    broken = REST; // метка встанет, а панель так и стоит на месте
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    settleVerify();
    expect(healed(), "сверка заметила и вылечила").toBe(1);
    // Пересоздание слоя: display: none, чтение высоты при нём, display возвращён
    expect(heightReads[0], "первое чтение высоты — при display: none").toBe("none");
    expect(heightReads.at(-1), "последнее — уже после возврата").toBe("");
    expect(bar.style.display).toBe("");
    expect(isHidden(bar), "метка осталась по состоянию").toBe(true);
    expect(log().some((t) => t.includes("не там (после перехода), вылечено"))).toBe(true);
  });

  it("видна по состоянию, а висит посреди страницы на 260 px выше места: слой пересоздан, метка не тронута", () => {
    const { bar } = setup();
    broken = { top: REST.top - 260, bottom: REST.bottom - 260 };
    resize();
    settleVerify();
    expect(healed()).toBe(1);
    expect(heightReads[0]).toBe("none");
    expect(isHidden(bar)).toBe(false);
    expect(log().some((t) => t.includes("не там (после перехода)"))).toBe(true);
  });

  it("залипшая метка приводится к состоянию во время лечения", () => {
    const { bar } = setup();
    // Состояние «видна», метка осталась от прошлого: панель по метке за краем, по состоянию должна стоять
    bar.setAttribute("data-hidden", "");
    broken = OFFSCREEN;
    resize();
    settleVerify();
    expect(healed()).toBe(1);
    expect(isHidden(bar), "метка снята по состоянию").toBe(false);
  });

  it("правило стилей спрятало панель (ввод в поле): ждётся за краем, и за краем — это верно; а в окне — лечится", () => {
    const { bar } = setup();
    bar.style.transform = "matrix(1, 0, 0, 1, 0, 90)"; // как вычислит браузер для --tabbar-away
    broken = OFFSCREEN;
    resize();
    settleVerify();
    expect(healed(), "по состоянию видна, но правило её убрало: за краем — так и задумано").toBe(0);
    broken = REST;
    resize();
    settleVerify();
    expect(healed(), "правило убрало, а панель в окне — не там").toBe(1);
  });

  it("лечение не чаще раза в 250 мс", () => {
    setup();
    broken = { top: 100, bottom: 156 };
    act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    expect(healed()).toBe(1);
    // Через миг панель снова сломалась: сверка видит, но лечить рано
    broken = { top: 100, bottom: 156 };
    vi.advanceTimersByTime(HEAL_MIN_INTERVAL_MS - 50);
    act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    expect(healed(), "прошло меньше 250 мс").toBe(1);
    broken = { top: 100, bottom: 156 };
    vi.advanceTimersByTime(60);
    act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    expect(healed(), "прошло больше 250 мс").toBe(2);
  });

  it("лечение не помогло: молчит 10 с, не крутится, потом пробует снова", () => {
    setup();
    healFixes = false;
    broken = { top: 100, bottom: 156 }; // пересоздание слоя положения не чинит (приближение, чужие стили)
    act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    expect(healed()).toBe(1);
    expect(log().some((t) => t.includes("лечение не помогло"))).toBe(true);

    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(400);
      resize();
      act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    }
    // 20 × 400 мс = 8 с < 10 с паузы
    expect(healed(), "восемь секунд тишины").toBe(1);
    vi.advanceTimersByTime(HEAL_FAIL_PAUSE_MS - 8000 + 100);
    act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    expect(healed(), "пауза кончилась").toBe(2);
  });

  it("идущий переход не проверяют: посреди него панель законно не на месте; проверяют по его концу", () => {
    const { bar, rerenderTabs } = setup();
    const finish = vi.fn(() => {
      running = false;
    });
    let running = true;
    Object.defineProperty(proto, "getAnimations", {
      configurable: true,
      writable: true,
      value: () => [{ playState: running ? "running" : "finished", finish }],
    });
    broken = { top: 560, bottom: 616 }; // посередине выезда
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    // Смена раздела во время перехода: сверка сразу откладывается, переход ещё идёт
    nav.pathname = "/vacancies";
    rerenderTabs();
    expect(healed(), "переход идёт — не проверяем").toBe(0);
    act(() => vi.advanceTimersByTime(TABBAR_SLIDE_MS + FINISH_GUARD_MS - 1));
    expect(healed()).toBe(0);
    expect(finish).not.toHaveBeenCalled();
    // Таймер конца: переход доведён, а панель всё ещё посередине — значит, зависла
    act(() => vi.advanceTimersByTime(1));
    expect(finish).toHaveBeenCalled();
    expect(healed()).toBe(1);
  });

  it("зависший переход попадает в журнал: переход не закончился сам", () => {
    setup();
    Object.defineProperty(proto, "getAnimations", {
      configurable: true,
      writable: true,
      value: () => [{ playState: "running", finish: vi.fn() }],
    });
    scrollPage(500);
    settleVerify();
    expect(log().some((t) => t.includes("переход не закончился сам: 1"))).toBe(true);
  });

  it("не нарисована (планшет и компьютер, jsdom) или страница приближена щипком — сверка молчит", () => {
    const { bar } = setup();
    broken = { top: 0, bottom: 0 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    );
    resize();
    settleVerify();
    expect(healed(), "панели нет в раскладке").toBe(0);

    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === bar ? rectOf(bar) : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: Object.assign(new EventTarget(), { scale: 2, height: 300, offsetTop: 0 }) });
    broken = { top: 100, bottom: 156 };
    resize();
    settleVerify();
    expect(healed(), "страница приближена: координаты раскладки и окна расходятся").toBe(0);
  });

  it("верной считается любая из двух высот окна: innerHeight и clientHeight", () => {
    setup();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
    // clientHeight документа 600: панель на месте относительно него, хотя innerHeight говорит иначе
    resize();
    settleVerify();
    expect(healed()).toBe(0);
  });

  it("размонтирование снимает таймеры сверки: после него никто не лечит", () => {
    const { unmount } = setup();
    broken = { top: 100, bottom: 156 };
    resize();
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(healed()).toBe(0);
  });

  it("остановка прокрутки: сверка находит панель не на месте и лечит сразу, не дожидаясь конца перехода", () => {
    const { bar } = setup();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    // Переход после смены метки кончился, панель была на месте: сверка тихо прошла
    act(() => vi.advanceTimersByTime(300));
    expect(healed()).toBe(0);
    // Дальше панель отвалилась (висит на 260 px выше места), пока человек листал
    broken = { top: REST.top - 260, bottom: REST.bottom - 260 };
    act(() => vi.advanceTimersByTime(SETTLE_MS - 300));
    expect(isHidden(bar), "остановка вернула панель по состоянию").toBe(false);
    // Сверка идёт от самой остановки (after), а не от таймера конца перехода, который сработал бы на 260 мс позже
    expect(healed(), "вылечено в момент остановки").toBe(1);
    expect(log()).toContain("не там (остановка прокрутки), вылечено");
    expect(heightReads.filter((d) => d === "none")).toHaveLength(1);
  });

  it("смена раздела: сверка находит панель не на месте и лечит сразу, без таймеров", () => {
    const { rerenderTabs } = setup();
    broken = { top: REST.top - 260, bottom: REST.bottom - 260 };
    nav.pathname = "/vacancies";
    rerenderTabs();
    expect(healed(), "вылечено в момент смены раздела").toBe(1);
    expect(log()).toContain("не там (смена раздела), вылечено");
  });

  it("на месте — остановка прокрутки и смена раздела ничего не лечат", () => {
    const { bar, rerenderTabs } = setup();
    scrollPage(500);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(isHidden(bar)).toBe(false);
    nav.pathname = "/vacancies";
    rerenderTabs();
    act(() => vi.advanceTimersByTime(1000));
    expect(healed()).toBe(0);
    expect(heightReads).toEqual([]);
  });
});

describe("iOS: слой панели освежается, когда она меняла состояние (профилактика зависания на уровне композитора)", () => {
  let heightReads: string[];

  function setup() {
    const view = renderTabs();
    Object.defineProperty(view.bar, "offsetHeight", {
      configurable: true,
      get() {
        heightReads.push(view.bar.style.display);
        return 56;
      },
    });
    return view;
  }
  const refreshed = () => getTabbarDebug().refreshed;
  const log = () => getTabbarDebug().entries.map((e) => e.text);
  const recreations = () => heightReads.filter((d) => d === "none").length;
  const pageShow = () => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    resetTabbarDebug();
    heightReads = [];
  });
  // CSS есть не во всех окружениях jsdom: подставляем свой объект и убираем его же, чужие подмены окружения не трогаем
  afterEach(() => {
    delete (globalThis as unknown as { CSS?: unknown }).CSS;
  });

  const asIos = () =>
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      writable: true,
      value: { supports: (property: string) => property === "-webkit-touch-callout" },
    });

  it("спрятана листанием, листание остановилось: панель вернулась и слой освежён один раз", () => {
    asIos();
    const { bar } = setup();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    expect(refreshed(), "посреди листания слой не трогают").toBe(0);
    expect(recreations()).toBe(0);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(isHidden(bar)).toBe(false);
    expect(refreshed()).toBe(1);
    expect(recreations()).toBe(1);
    expect(heightReads.at(-1), "display возвращён до последнего чтения").toBe("");
    expect(bar.style.display).toBe("");
    expect(log()).toContain("слой освежён (остановка прокрутки)");
    // Дальше без новых смен состояния слой не трогают
    act(() => vi.advanceTimersByTime(SETTLE_MS * 4));
    expect(refreshed()).toBe(1);
  });

  it("листание без смены состояния слой не освежает", () => {
    asIos();
    setup();
    scrollPage(40);
    scrollPage(60);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(refreshed()).toBe(0);
    expect(recreations()).toBe(0);
  });

  it("не iOS: ни освежения, ни пересоздания слоя", () => {
    const { bar } = setup();
    scrollPage(500);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(isHidden(bar)).toBe(false);
    expect(refreshed()).toBe(0);
    expect(recreations()).toBe(0);
  });

  it("смена раздела при спрятанной панели: слой освежён после того, как панель вернулась", () => {
    asIos();
    const { bar, rerenderTabs } = setup();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    nav.pathname = "/vacancies";
    rerenderTabs();
    expect(isHidden(bar)).toBe(false);
    expect(refreshed()).toBe(1);
    expect(log()).toContain("слой освежён (смена раздела)");
  });

  it("смена раздела без смены состояния слой не трогает", () => {
    asIos();
    const { rerenderTabs } = setup();
    nav.pathname = "/vacancies";
    rerenderTabs();
    expect(refreshed()).toBe(0);
  });

  it("показ страницы и возврат вкладки освежают слой в любом случае: после сна ему не доверяют", () => {
    asIos();
    setup();
    act(() => pageShow());
    expect(refreshed()).toBe(1);
    expect(log().some((t) => t.startsWith("слой освежён (pageshow"))).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    expect(refreshed()).toBe(2);
    expect(log()).toContain("слой освежён (вкладка снова видна)");
  });

  it("смена размера окна слой не освежает: адресная строка сворачивается прямо во время листания", () => {
    asIos();
    setup();
    act(() => void window.dispatchEvent(new Event("resize")));
    expect(refreshed()).toBe(0);
  });

  it("фокус на вкладке панели переживает пересоздание слоя: браузер снимает его с элемента в display: none", () => {
    asIos();
    const { bar } = setup();
    const link = within(bar).getAllByRole("link")[0];
    link.focus();
    expect(document.activeElement).toBe(link);
    // Как браузер: пока слой пересоздаётся (display: none, чтение высоты), фокус слетает на body
    Object.defineProperty(bar, "offsetHeight", {
      configurable: true,
      get() {
        heightReads.push(bar.style.display);
        if (bar.style.display === "none" && document.activeElement === link) link.blur();
        return 56;
      },
    });
    act(() => pageShow());
    expect(refreshed()).toBe(1);
    expect(document.activeElement, "фокус вернулся на ту же вкладку").toBe(link);
  });

  it("освежение не считается лечением: панель была на месте", () => {
    asIos();
    setup();
    scrollPage(500);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(refreshed()).toBe(1);
    expect(getTabbarDebug().healed).toBe(0);
  });

  it("журнал: смена состояния, раздел, события страницы — с причиной, не больше десяти", () => {
    setup();
    scrollPage(500);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(log()).toContain("скрыта (scroll) y 500 +0мс");
    expect(log()).toContain("видна (settle) y 500 +600мс");
    nav.pathname = "/vacancies";
    for (let i = 0; i < 10; i++) act(() => void window.dispatchEvent(new Event("resize")));
    expect(getTabbarDebug().entries.length).toBe(10);
    expect(getTabbarDebug().entries.every((e) => e.text === "resize окна")).toBe(true);
  });
});

describe("журнал для диагностики на телефоне: положение, время от прокрутки, касания", () => {
  const log = () => getTabbarDebug().entries.map((e) => e.text);
  const touch = (type: "touchstart" | "touchend", touches: number) => {
    // В jsdom настоящих касаний нет: событие обычное, список касаний — как у браузера
    const event = Object.assign(new Event(type, { bubbles: true }), { touches: Array.from({ length: touches }, () => ({})) });
    act(() => void document.dispatchEvent(event));
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    resetTabbarDebug();
  });

  it("смена состояния пишется с положением страницы и временем от последнего scroll", () => {
    renderTabs();
    scrollPage(300);
    act(() => vi.advanceTimersByTime(40));
    scrollPage(340);
    expect(log().filter((t) => t.startsWith("скрыта"))).toEqual(["скрыта (scroll) y 300 +0мс"]);
    // Остановка: 600 мс от последнего scroll, положение — то, где страница встала
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(log()).toContain("видна (settle) y 340 +600мс");
  });

  it("до первой прокрутки времени нет — прочерк, а не число", () => {
    const { bar } = renderTabs();
    // Страница пришла спрятанной не от прокрутки: смена по возврату вкладки, scroll на этой странице ещё не было
    bar.setAttribute("data-hidden", "");
    act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false })));
    expect(log().some((t) => /^видна \(resync\) y 0 \+-мс$/.test(t))).toBe(true);
  });

  it("касания документа идут в журнал с числом пальцев, положением и временем; панель не меняют", () => {
    const { bar } = renderTabs();
    touch("touchstart", 1);
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    touch("touchstart", 2);
    touch("touchend", 1);
    touch("touchend", 0);
    expect(isHidden(bar), "касания состояния не меняют: прячет и возвращает только прокрутка").toBe(true);
    const texts = log();
    expect(texts[0]).toBe("touchstart (1) y 0 +-мс");
    expect(texts).toContain("touchstart (2) y 500 +0мс");
    expect(texts).toContain("touchend (1) y 500 +0мс");
    expect(texts.at(-1)).toBe("touchend (0) y 500 +0мс");
  });

  it("запись о касании раскладку не читает: ни scrollTop, ни getBoundingClientRect", () => {
    let scrollTopReads = 0;
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => {
        scrollTopReads++;
        return pageY;
      },
    });
    const rectReads = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    renderTabs();
    scrollTopReads = 0;
    rectReads.mockClear();
    touch("touchstart", 1);
    touch("touchend", 0);
    expect(log().filter((t) => t.startsWith("touch")).length).toBe(2);
    expect(scrollTopReads, "scrollTop не читали").toBe(0);
    expect(rectReads, "getBoundingClientRect не вызывали").not.toHaveBeenCalled();
  });

  it("слушатели касаний снимаются при размонтировании", () => {
    const { unmount } = renderTabs();
    unmount();
    resetTabbarDebug();
    touch("touchstart", 1);
    touch("touchend", 0);
    expect(log()).toEqual([]);
  });

  it("слушатели касаний пассивные: прокрутке пальцем не мешают", () => {
    const add = vi.spyOn(document, "addEventListener");
    renderTabs();
    const touchCalls = add.mock.calls.filter(([type]) => type === "touchstart" || type === "touchend");
    expect(touchCalls.map(([type]) => type).sort()).toEqual(["touchend", "touchstart"]);
    for (const call of touchCalls) expect(call[2], String(call[0])).toMatchObject({ passive: true });
  });
});

describe("стоп-кран «Не прятать панель при прокрутке»", () => {
  const log = () => getTabbarDebug().entries.map((e) => e.text);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    resetTabbarDebug();
  });

  it("флаг включён: сколько ни листай, панель на месте и метки нет", () => {
    window.localStorage.setItem(TABBAR_NOHIDE_KEY, "1");
    const { bar } = renderTabs();
    for (const y of [100, 300, 500, 900, 1500, 2500]) {
      scrollPage(y);
      expect(isHidden(bar), `на ${y} px`).toBe(false);
    }
    act(() => vi.advanceTimersByTime(SETTLE_MS * 3));
    expect(isHidden(bar)).toBe(false);
    expect(log().some((t) => t.startsWith("скрыта"))).toBe(false);
  });

  it("флаг выключен (по умолчанию): панель прячется как раньше", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
  });

  it("флаг включили в настройках, пока панель спрятана: она возвращается сразу; выключили — прячется снова", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    act(() => void writeTabbarNoHideFlag(true));
    expect(isHidden(bar), "включили — панель на месте сразу, не дожидаясь остановки").toBe(false);
    expect(log()).toContain("не прятать: включено");
    scrollPage(800);
    scrollPage(900);
    expect(isHidden(bar), "пока включено, листание не прячет").toBe(false);
    act(() => void writeTabbarNoHideFlag(false));
    expect(log()).toContain("не прятать: выключено");
    scrollPage(1000);
    scrollPage(1040);
    expect(isHidden(bar), "выключили — правила прежние").toBe(true);
  });

  it("флаг сменили в другой вкладке (событие storage): панель делает то же", () => {
    const { bar } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar)).toBe(true);
    window.localStorage.setItem(TABBAR_NOHIDE_KEY, "1");
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: TABBAR_NOHIDE_KEY })));
    expect(isHidden(bar)).toBe(false);
  });

  it("не мешает остальному: смена раздела работает как обычно, а отладочный флаг стоп-кран не включает", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const { bar, rerenderTabs } = renderTabs();
    scrollPage(500);
    expect(isHidden(bar), "отладочная строка стоп-кран не включает").toBe(true);
    nav.pathname = "/vacancies";
    rerenderTabs();
    expect(isHidden(bar)).toBe(false);
  });

  it("слушатели флага снимаются при размонтировании: после него флаг ничего не пишет в журнал", () => {
    const { unmount } = renderTabs();
    unmount();
    resetTabbarDebug();
    act(() => void writeTabbarNoHideFlag(true));
    expect(log()).toEqual([]);
  });
});

describe("отладочная строка подключена к панели", () => {
  it("с флагом диагностики панель рисует строку и контрольный квадрат; без флага — ничего", () => {
    renderTabs();
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
    expect(screen.queryByTestId("tabbar-debug-control")).toBeNull();
    cleanup();

    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    renderTabs();
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("панель:");
    expect(screen.getByTestId("tabbar-debug-control")).toBeTruthy();
  });

  it("строка не внутри панели: нажатия и порядок вкладок не затронуты", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const { bar } = renderTabs();
    expect(bar.contains(screen.getByTestId("tabbar-debug"))).toBe(false);
    expect(bar.contains(screen.getByTestId("tabbar-debug-control"))).toBe(false);
  });
});
