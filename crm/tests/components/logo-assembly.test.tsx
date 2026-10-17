// @vitest-environment jsdom
/**
 * Знак «HR» в разделе «Как это работает»: вектор из девяти кусков, собирается по прокрутке.
 * Проверяем привязку к положению прокрутки (0 — куски разлетелись и невидимы, 1 — на местах),
 * финальное «схлопывание», «уменьшить движение» (знак сразу цельный), размер и что на телефоне
 * блок скрыт классом.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogoAssembly, PIECES, pieceStyle, settleAmount } from "@/components/marketing/logo-assembly";

function mockMedia(opts: { reduce?: boolean; wide?: boolean }) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? !opts.reduce : (opts.wide ?? true),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/** Блок высотой 1000px, верх которого стоит на `top` (окно 1000px). */
function placeAt(container: HTMLElement, top: number) {
  const root = container.firstElementChild as HTMLElement;
  root.getBoundingClientRect = () => ({ top, height: 1000, bottom: top + 1000, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
}

const pieces = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-piece]"));
const SETTLED = "translate(0%, 0%) rotate(0deg) scale(1)";
const scattered = (el: HTMLElement) => el.style.transform !== "" && el.style.transform !== SETTLED;

let observerCallback: IntersectionObserverCallback | undefined;
let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  rafQueue = [];
  observerCallback = undefined;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => rafQueue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function flushFrame() {
  const queue = rafQueue;
  rafQueue = [];
  act(() => queue.forEach((cb) => cb(0)));
}

function visible(on: boolean) {
  act(() => observerCallback?.([{ isIntersecting: on } as IntersectionObserverEntry], {} as IntersectionObserver));
}

describe("знак, собирающийся при прокрутке", () => {
  it("девять кусков, значения детерминированы: сервер и браузер строят одно и то же", () => {
    expect(PIECES).toHaveLength(9);
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(9);
    // Нет случайных чисел: повторный расчёт даёт те же строки
    expect(pieceStyle(PIECES[0], 0.3)).toEqual(pieceStyle(PIECES[0], 0.3));
    // Каждый следующий кусок стартует позже: поочерёдная сборка
    const starts = PIECES.map((p) => p.start).sort((a, b) => a - b);
    expect(new Set(starts).size).toBe(9);
    expect(Math.max(...starts)).toBeLessThan(0.5);
  });

  it("блок декоративный: скрыт от читалок, на телефоне скрыт классом, без интерактивных элементов", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("lg:block");
    expect(root.className).toContain("pointer-events-none");
    expect(container.querySelector("a, button, input, [tabindex]")).toBeNull();
    // Вектор: никаких растровых картинок
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("svg path")).toHaveLength(9);
  });

  it("знак небольшой: 180–220px, а не 440px", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    const box = container.querySelector<HTMLElement>("[data-logo-assembly]")!;
    const px = Number(/max-w-\[(\d+)px\]/.exec(box.className)?.[1]);
    expect(px).toBeGreaterThanOrEqual(180);
    expect(px).toBeLessThanOrEqual(220);
    expect(box.className).toContain("sticky");
  });

  it("прогресс 0: куски смещены и прозрачны; прогресс 1: на местах и непрозрачны; обратно разбирается", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);

    // Верх знака на 90% высоты окна (900px): прогресс 0
    placeAt(container, 900);
    visible(true);
    flushFrame();
    expect(pieces(container).every(scattered)).toBe(true);
    expect(pieces(container).every((p) => Number(p.style.opacity) === 0)).toBe(true);

    // Верх знака поднялся выше 40% высоты окна: прогресс 1
    placeAt(container, -200);
    act(() => window.dispatchEvent(new Event("scroll")));
    flushFrame();
    for (const p of pieces(container)) {
      expect(p.style.transform).toBe(SETTLED);
      expect(Number(p.style.opacity)).toBe(1);
    }
    const group = container.querySelector<HTMLElement>("[data-logo-assembly] > div")!;
    expect(group.style.transform).toBe("");

    // Обратно вверх: снова разбирается
    placeAt(container, 900);
    act(() => window.dispatchEvent(new Event("scroll")));
    flushFrame();
    expect(pieces(container).every(scattered)).toBe(true);
  });

  it("собранный знак виден на 70%: прозрачность задана группе, а не кускам (на шве не светлеет)", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    const group = container.querySelector<HTMLElement>("[data-logo-assembly] > div")!;
    expect(group.className).toContain("opacity-70");
    placeAt(container, -200);
    visible(true);
    flushFrame();
    // Куски в конце непрозрачны: 0.7 даёт только общая группа
    for (const p of pieces(container)) expect(Number(p.style.opacity)).toBe(1);
    // Свечение финиша не заметно поднимает яркость
    const glow = container.querySelector<HTMLElement>("[data-glow]")!;
    expect(Number(glow.style.opacity || 0)).toBeLessThanOrEqual(0.2);
  });

  it("знак встаёт центром на высоту заголовка третьего шага и не выходит за блок", () => {
    mockMedia({});
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const r = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
      if (this.hasAttribute("data-assembly-anchor")) return r(600, 40);
      return r(0, 1000);
    });
    const offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(240);
    const { container } = render(
      <div>
        <div data-assembly-anchor>Ведём всю воронку</div>
        <LogoAssembly />
      </div>,
    );
    const box = container.querySelector<HTMLElement>("[data-logo-assembly]")!;
    // Центр строки 620, половина знака 120: верх знака на 500
    expect(box.style.marginTop).toBe("500px");

    // Строка у самого низа блока: смещение ограничено, знак не вылезает
    spy.mockImplementation(function (this: HTMLElement) {
      const r = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
      return this.hasAttribute("data-assembly-anchor") ? r(990, 40) : r(0, 1000);
    });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(box.style.marginTop).toBe("760px");
    spy.mockRestore();
    offsetHeight.mockRestore();
  });

  it("середина прокрутки: часть кусков уже села, часть ещё в полёте", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    // Путь сборки — 500px (половина окна), верх знака на 90% окна: сдвиг на 250px даёт прогресс 0.5
    placeAt(container, 650);
    visible(true);
    flushFrame();
    const opacities = pieces(container).map((p) => Number(p.style.opacity));
    expect(opacities.some((o) => o === 1)).toBe(true);
    expect(opacities.some((o) => o < 1)).toBe(true);
  });

  it("схлопывание: есть в последней десятой прогресса, на 0.9 и на 1 его нет", () => {
    expect(settleAmount(0.5)).toBe(0);
    expect(settleAmount(0.9)).toBeCloseTo(0, 5);
    expect(settleAmount(0.95)).toBeGreaterThan(0.9);
    expect(settleAmount(1)).toBeCloseTo(0, 5);
  });

  it("за кадр делается одна работа: несколько прокруток подряд — один кадр", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    placeAt(container, 500);
    visible(true);
    flushFrame();
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(rafQueue).toHaveLength(1);
  });

  it("вне окна прокрутку не слушаем", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    placeAt(container, 500);
    visible(false);
    flushFrame();
    rafQueue = [];
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(rafQueue).toHaveLength(0);
  });

  it("reduced-motion: знак сразу цельный, наблюдателя и обработчика прокрутки нет", () => {
    mockMedia({ reduce: true });
    const add = vi.spyOn(window, "addEventListener");
    const { container } = render(<LogoAssembly />);
    expect(observerCallback).toBeUndefined();
    expect(add.mock.calls.some(([type]) => type === "scroll")).toBe(false);
    for (const p of pieces(container)) {
      expect(p.style.transform).toBe("");
      expect(p.style.opacity).toBe("");
    }
    add.mockRestore();
  });

  it("анимируются только transform и opacity: размытия и фильтров нет", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    placeAt(container, 300);
    visible(true);
    flushFrame();
    expect(container.innerHTML).not.toMatch(/filter|blur/i);
  });
});
