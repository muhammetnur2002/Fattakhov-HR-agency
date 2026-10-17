// @vitest-environment jsdom
/**
 * Знак «HR» в разделе «Как это работает»: собирается из плиток по прокрутке.
 * Проверяем привязку к положению прокрутки (0 — плитки разбросаны, 1 — на местах),
 * «уменьшить движение» (знак сразу цельный) и что на телефоне блок скрыт классом.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogoAssembly, TILES } from "@/components/marketing/logo-assembly";

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

const tiles = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-tile]"));
const scattered = (el: HTMLElement) => el.style.transform !== "" && el.style.transform !== "translate3d(0px, 0px, 0) rotate(0deg)";

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

describe("знак, собирающийся при прокрутке", () => {
  it("25 плиток, значения детерминированы и не меняются между вызовами", () => {
    expect(TILES).toHaveLength(25);
    expect(TILES.every((t) => Math.abs(t.dx) <= 280 && Math.abs(t.turn) <= 70)).toBe(true);
  });

  it("блок декоративный: скрыт от читалок, картинки без alt, на телефоне скрыт классом", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("lg:block");
    expect(root.className).toContain("pointer-events-none");
    expect(container.querySelectorAll("img").length).toBe(25);
    container.querySelectorAll("img").forEach((img) => expect(img.getAttribute("alt")).toBe(""));
    expect(container.querySelector("a, button, [tabindex]")).toBeNull();
  });

  it("прогресс 0: плитки смещены и прозрачны; прогресс 1: на местах и непрозрачны", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);

    // Верх блока ниже точки старта (75% окна): прогресс 0
    placeAt(container, 900);
    act(() => observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    flushFrame();
    expect(tiles(container).every(scattered)).toBe(true);
    expect(tiles(container).every((t) => Number(t.style.opacity) === 0)).toBe(true);

    // Блок прошёл 90% своей высоты за точкой старта: прогресс 1
    placeAt(container, -200);
    act(() => window.dispatchEvent(new Event("scroll")));
    flushFrame();
    for (const t of tiles(container)) {
      expect(t.style.transform).toBe("translate3d(0px, 0px, 0) rotate(0deg)");
      expect(Number(t.style.opacity)).toBe(1);
    }

    // Обратно вверх: снова разбирается
    placeAt(container, 900);
    act(() => window.dispatchEvent(new Event("scroll")));
    flushFrame();
    expect(tiles(container).every(scattered)).toBe(true);
  });

  it("за кадр делается одна работа: несколько прокруток подряд — один кадр", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    placeAt(container, 500);
    act(() => observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
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
    act(() => observerCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
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
    for (const t of tiles(container)) {
      expect(t.style.transform).toBe("");
      expect(t.style.opacity).toBe("");
    }
    add.mockRestore();
  });

  it("плитки показывают куски одной картинки со своим смещением", () => {
    mockMedia({});
    const { container } = render(<LogoAssembly />);
    const imgs = Array.from(container.querySelectorAll<HTMLElement>("img"));
    expect(new Set(imgs.map((i) => i.style.left)).size).toBe(5);
    expect(new Set(imgs.map((i) => i.style.top)).size).toBe(5);
  });
});
