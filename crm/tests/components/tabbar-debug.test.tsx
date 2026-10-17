// @vitest-environment jsdom
/**
 * Временная диагностика нижней панели: переключатель в «Настройках» и отладочная строка поверх
 * страницы (components/settings/tabbar-debug-toggle.tsx, components/shell/tabbar-debug.tsx).
 *
 * Строка по умолчанию выключена и ничего не рисует; включённая — не интерактивна, закреплена
 * вверху слева и не влияет на раскладку. Недоступное хранилище ничего не ломает.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TabbarDebugToggle } from "@/components/settings/tabbar-debug-toggle";
import { TabbarDebug, formatTabbarDebug } from "@/components/shell/tabbar-debug";
import {
  TABBAR_DEBUG_KEY,
  TABBAR_NOHIDE_KEY,
  getTabbarDebug,
  resetTabbarDebug,
  tabbarDebugCountHeal,
  tabbarDebugCountRefresh,
  tabbarDebugLog,
  tabbarDebugNoteScroll,
  tabbarDebugSetHidden,
} from "@/lib/tabbar-debug";

const LABEL = "Диагностика панели разделов (временно)";
const NOHIDE_LABEL = "Не прятать панель при прокрутке (временно)";

const rect = (top: number, height = 56) =>
  ({ top, bottom: top + height, left: 0, right: 1, width: 1, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  window.localStorage.clear();
  resetTabbarDebug();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderOverlay() {
  const nav = document.createElement("nav");
  document.body.append(nav);
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = nav;
  return { nav, ...render(<TabbarDebug navRef={ref} />) };
}

describe("отладочная строка", () => {
  it("по умолчанию выключена: в разметке нет ничего", () => {
    const { container } = renderOverlay();
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
  });

  it("с флагом показана: закреплена, не интерактивна, скрыта от читалки, без намёков на композитный слой", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    renderOverlay();
    const box = screen.getByTestId("tabbar-debug");
    expect(box.getAttribute("aria-hidden")).toBe("true");
    const classes = box.className.split(/\s+/);
    expect(classes).toContain("pointer-events-none");
    expect(classes).toContain("fixed");
    expect(classes.some((c) => /^(will-change|transform|translate|backdrop|filter)/.test(c))).toBe(false);
    expect(box.querySelector("a, button, input")).toBeNull();
    expect(box.textContent).toContain("панель:");
  });

  it("показывает состояние, положение страницы и окна, панели, контроль, счётчики, режим и последние события", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const { nav } = renderOverlay();
    nav.setAttribute("data-hidden", "");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === "tabbar-debug-control" ? rect(659, 8) : rect(601);
    });
    act(() => {
      tabbarDebugSetHidden(true);
      tabbarDebugCountHeal();
      tabbarDebugCountRefresh();
      tabbarDebugCountRefresh();
      tabbarDebugLog("скрыта (scroll)", new Date(2026, 9, 17, 12, 34, 56, 789).getTime());
    });
    // Метка читается на событие журнала (раскладку она не трогает); раскладка — по таймеру
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("панель: СКРЫТА (метка: да)");
    act(() => vi.advanceTimersByTime(250));
    const text = screen.getByTestId("tabbar-debug").textContent ?? "";
    expect(text).toContain("панель: СКРЫТА (метка: да)");
    expect(text).toMatch(/y \d+ из \d+ {2}окно \d+\/\d+/);
    expect(text).toMatch(/vv h /);
    expect(text).toContain("rect t 601.0 b 657.0");
    expect(text).toContain("контроль t 659.0 b 667.0");
    expect(text).toContain("tf ");
    expect(text).toContain("лечений 1  освежений 2");
    expect(text).toContain("iOS: нет  приложение: нет");
    expect(text).toContain("не прятать: нет");
    expect(text).toContain("12:34:56.789 скрыта (scroll)");
  });

  it("показания окна обновляются сами: раз в 250 мс", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const { nav } = renderOverlay();
    let top = 601;
    vi.spyOn(nav, "getBoundingClientRect").mockImplementation(() => rect(top));
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("rect t 601.0");
    top = 80;
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("rect t 80.0");
  });

  it("раскладку не читает ни на прокрутку, ни на событие журнала; пока листают, пропускает и таймер", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const { nav } = renderOverlay();
    const reads = vi.spyOn(nav, "getBoundingClientRect").mockImplementation(() => rect(601));
    const styles = vi.spyOn(window, "getComputedStyle");
    const baseline = reads.mock.calls.length;
    const baselineStyles = styles.mock.calls.length;

    // Десятки событий прокрутки и событий журнала: ни одного чтения раскладки панели
    for (let i = 0; i < 40; i++) {
      tabbarDebugNoteScroll(performance.now());
      fireEvent.scroll(document);
    }
    act(() => {
      for (let i = 0; i < 10; i++) tabbarDebugLog(`событие ${i}`);
      tabbarDebugSetHidden(true);
    });
    expect(reads.mock.calls.length, "rect панели не читали").toBe(baseline);
    expect(styles.mock.calls.length, "computed style не читали").toBe(baselineStyles);

    // Таймер идёт, но листание было меньше 300 мс назад: пропуск
    act(() => vi.advanceTimersByTime(250));
    expect(reads.mock.calls.length, "250 мс после прокрутки — ещё листают").toBe(baseline);
    // Прошло больше 300 мс тишины: следующий тик читает
    act(() => vi.advanceTimersByTime(250));
    expect(reads.mock.calls.length, "тишина дольше 300 мс — читаем").toBeGreaterThan(baseline);
    const after = reads.mock.calls.length;
    // И снова листают: тик пропущен
    tabbarDebugNoteScroll(performance.now());
    act(() => vi.advanceTimersByTime(250));
    expect(reads.mock.calls.length).toBe(after);
  });

  it("контрольный квадрат: внизу слева, закреплён, без transform и размытия, не интерактивен, скрыт от читалки", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    renderOverlay();
    const mark = screen.getByTestId("tabbar-debug-control");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    const classes = mark.className.split(/\s+/);
    for (const c of ["fixed", "bottom-0", "left-0", "pointer-events-none", "h-[8px]", "w-[8px]"]) expect(classes, c).toContain(c);
    expect(classes.some((c) => /^(will-change|transform|translate|backdrop|filter)/.test(c))).toBe(false);
    expect(mark.children.length).toBe(0);
  });

  it("без флага контрольного квадрата нет, как и строки", () => {
    renderOverlay();
    expect(screen.queryByTestId("tabbar-debug-control")).toBeNull();
  });

  it("стоп-кран: строка показывает, включён ли он, и узнаёт о смене флага без таймера", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    renderOverlay();
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("не прятать: нет");
    window.localStorage.setItem(TABBAR_NOHIDE_KEY, "1");
    act(() => void window.dispatchEvent(new Event("fhr-tabbar-debug-change")));
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("не прятать: да");
  });

  it("флаг сменили в этой вкладке (событие) или в другой (storage) — строка появляется и исчезает", () => {
    renderOverlay();
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: TABBAR_DEBUG_KEY })));
    expect(screen.getByTestId("tabbar-debug")).toBeTruthy();
    window.localStorage.removeItem(TABBAR_DEBUG_KEY);
    act(() => void window.dispatchEvent(new Event("fhr-tabbar-debug-change")));
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
  });

  it("хранилище недоступно: строка выключена и ничего не бросает", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("хранилище недоступно", "SecurityError");
    });
    expect(() => renderOverlay()).not.toThrow();
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
  });

  it("панели нет в разметке (nav не передан): строка показывает это словами, а не падает", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    render(<TabbarDebug navRef={createRef<HTMLElement>()} />);
    expect(screen.getByTestId("tabbar-debug").textContent).toContain("метка: панели нет");
  });

  it("на прокрутку и смену размера строка не подписывается вовсе: только таймер и флаги", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const onDocument = vi.spyOn(document, "addEventListener");
    const onWindow = vi.spyOn(window, "addEventListener");
    renderOverlay();
    expect(onDocument.mock.calls.map(([type]) => type)).not.toContain("scroll");
    expect(onWindow.mock.calls.map(([type]) => type)).not.toContain("resize");
    expect(onWindow.mock.calls.map(([type]) => type)).not.toContain("scroll");
  });

  it("при размонтировании слушатели и таймер сняты", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    const clear = vi.spyOn(window, "clearInterval");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderOverlay();
    unmount();
    expect(clear).toHaveBeenCalled();
    const removed = remove.mock.calls.map(([type]) => type);
    for (const type of ["storage", "fhr-tabbar-debug-change"]) expect(removed, type).toContain(type);
  });
});

describe("formatTabbarDebug", () => {
  const live = {
    markHidden: false as boolean | null,
    pageY: 1385,
    max: 2853,
    innerHeight: 667,
    clientHeight: 667,
    vvHeight: 667,
    vvTop: 0,
    vvPageTop: 0,
    vvScale: 1,
    rectTop: 601,
    rectBottom: 657,
    controlTop: 659,
    controlBottom: 667,
    transform: "matrix(1, 0, 0, 1, 0, 0)",
    noHide: false,
    standalone: true,
    ios: true,
  };

  it("все показания, ради которых строка заведена, и режим приложения", () => {
    const text = formatTabbarDebug(live, { hidden: false, healed: 0, refreshed: 3, entries: [] });
    expect(text.split("\n")).toEqual([
      "панель: видна (метка: нет)",
      "y 1385 из 2853  окно 667/667",
      "vv h 667 top 0.0 pageTop 0.0 x1.00",
      "rect t 601.0 b 657.0",
      "контроль t 659.0 b 667.0",
      "tf matrix(1, 0, 0, 1, 0, 0)",
      "лечений 0  освежений 3",
      "iOS: да  приложение: да",
      "не прятать: нет",
    ]);
  });

  it("стоп-кран включён и журнал не пуст — строка про это и события после показаний", () => {
    const text = formatTabbarDebug(
      { ...live, noHide: true },
      { hidden: false, healed: 0, refreshed: 0, entries: [{ at: new Date(2026, 9, 17, 1, 2, 3, 4).getTime(), text: "touchstart (1) y 420 +350мс" }] },
    );
    const lines = text.split("\n");
    expect(lines).toContain("не прятать: да");
    expect(lines.at(-1)).toBe("01:02:03.004 touchstart (1) y 420 +350мс");
  });

  it("нет visualViewport и панели — прочерки, а не NaN и не undefined", () => {
    const text = formatTabbarDebug(
      {
        ...live,
        markHidden: null,
        vvHeight: null,
        vvTop: null,
        vvPageTop: null,
        vvScale: null,
        rectTop: null,
        rectBottom: null,
        controlTop: null,
        controlBottom: null,
        transform: null,
      },
      { hidden: true, healed: 1, refreshed: 0, entries: [] },
    );
    expect(text).toContain("панель: СКРЫТА (метка: панели нет)");
    expect(text).toContain("vv h - top - pageTop - x-");
    expect(text).toContain("rect t - b -");
    expect(text).toContain("контроль t - b -");
    expect(text).toContain("tf -");
    expect(text).not.toMatch(/NaN|undefined|null/);
  });
});

describe("переключатель в «Настройках»", () => {
  it("по умолчанию выключен, подпись — как просили, мелкий текст", () => {
    render(<TabbarDebugToggle />);
    const box = screen.getByLabelText(LABEL) as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(false);
    expect(box.closest(".text-xs"), "мелкий текст").not.toBeNull();
  });

  it("включает и выключает флаг; отражает уже записанный", () => {
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "1");
    render(<TabbarDebugToggle />);
    const box = screen.getByLabelText(LABEL) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(window.localStorage.getItem(TABBAR_DEBUG_KEY)).toBeNull();
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(window.localStorage.getItem(TABBAR_DEBUG_KEY)).toBe("1");
    expect(box.checked).toBe(true);
  });

  it("переключатель и строка работают вместе: включил — строка появилась, выключил — исчезла", () => {
    render(
      <>
        <TabbarDebugToggle />
        <TabbarDebug navRef={createRef<HTMLElement>()} />
      </>,
    );
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
    fireEvent.click(screen.getByLabelText(LABEL));
    expect(screen.getByTestId("tabbar-debug")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(LABEL));
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
  });

  it("хранилище недоступно: переключатель честно остаётся выключенным и говорит почему", () => {
    const boom = () => {
      throw new DOMException("хранилище недоступно", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    render(<TabbarDebugToggle />);
    const box = screen.getByLabelText(LABEL) as HTMLInputElement;
    expect(() => fireEvent.click(box)).not.toThrow();
    expect(box.checked).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("недоступно хранилище");
  });

  it("рядом второй переключатель — «Не прятать панель при прокрутке»: свой ключ, выключен по умолчанию, отладочную строку не трогает", () => {
    render(<TabbarDebugToggle />);
    const noHide = screen.getByLabelText(NOHIDE_LABEL) as HTMLInputElement;
    expect(noHide.type).toBe("checkbox");
    expect(noHide.checked).toBe(false);
    fireEvent.click(noHide);
    expect(window.localStorage.getItem(TABBAR_NOHIDE_KEY)).toBe("1");
    expect(window.localStorage.getItem(TABBAR_DEBUG_KEY), "строка не включилась").toBeNull();
    expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(noHide);
    expect(window.localStorage.getItem(TABBAR_NOHIDE_KEY)).toBeNull();
  });

  it("второй переключатель отражает уже записанное и говорит о недоступном хранилище отдельно", () => {
    window.localStorage.setItem(TABBAR_NOHIDE_KEY, "1");
    const { unmount } = render(<TabbarDebugToggle />);
    expect((screen.getByLabelText(NOHIDE_LABEL) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(false);
    unmount();

    window.localStorage.clear();
    const boom = () => {
      throw new DOMException("хранилище недоступно", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    render(<TabbarDebugToggle />);
    const noHide = screen.getByLabelText(NOHIDE_LABEL) as HTMLInputElement;
    expect(() => fireEvent.click(noHide)).not.toThrow();
    expect(noHide.checked).toBe(false);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("журнал живёт отдельно от флага: без включения ничего не рисуется, но сводка собирается", () => {
    renderOverlay();
    act(() => tabbarDebugLog("раздел: /vacancies"));
    expect(screen.queryByTestId("tabbar-debug")).toBeNull();
    expect(getTabbarDebug().entries.map((e) => e.text)).toEqual(["раздел: /vacancies"]);
  });
});
