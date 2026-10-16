// @vitest-environment jsdom
/**
 * Счётчик (`CountUp`) считает сам, без библиотеки движения.
 *
 * Раньше он брал `animate` и `useMotionValue` из `motion/react`, и это единственное, что тянуло
 * библиотеку (около 78 КБ до сжатия) в первую загрузку главной страницы сайта (замер 13.10.2026).
 * Поведение при этом то же: в разметке сразу настоящее число, при показе на экране — отсчёт от нуля
 * по кривой `cubic-bezier(0.16, 1, 0.3, 1)` за 0,9 с, при «уменьшить движение» — число без отсчёта.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CountUp, cubicBezier } from "@/components/motion/count-up";
import { formatNumber } from "@/lib/format-money";

type Entry = { isIntersecting: boolean };
let observers: Array<{ fire: (entries: Entry[]) => void; disconnected: boolean }> = [];

class FakeObserver {
  disconnected = false;
  constructor(private readonly callback: (entries: Entry[]) => void) {
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(entries: Entry[]) {
    this.callback(entries);
  }
}

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  mockReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const text = (container: HTMLElement) => container.querySelector("span")!.textContent;

describe("CountUp", () => {
  it("до показа на экране и без JS — настоящее число, а не ноль", () => {
    const { container } = render(<CountUp value={12635} />);
    expect(text(container)).toBe(formatNumber(12635));
  });

  it("при показе отсчитывает от нуля до значения за 0,9 с и останавливается ровно на нём", () => {
    const { container } = render(<CountUp value={12635} />);

    act(() => observers[0].fire([{ isIntersecting: true }]));
    expect(text(container)).toBe("0");

    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      seen.push(Number((text(container) ?? "").replace(/\D/g, "")));
    }
    // 30 кадров по 16 мс — это ~480 мс из 900: число уже идёт, но до конца далеко, и не убывает
    expect(seen[seen.length - 1]).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeLessThan(12635);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(text(container)).toBe(formatNumber(12635));
  });

  it("разряды разделены на каждом кадре, не только в конце", () => {
    const { container } = render(<CountUp value={250000} />);
    act(() => observers[0].fire([{ isIntersecting: true }]));
    act(() => {
      vi.advanceTimersByTime(160);
    });
    const midway = text(container) ?? "";
    expect(Number(midway.replace(/\D/g, ""))).toBeGreaterThan(1000);
    expect(midway).toMatch(/\s| | /);
  });

  it("«уменьшить движение»: сразу значение, наблюдателя и кадров нет", () => {
    mockReducedMotion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { container } = render(<CountUp value={12635} />);
    expect(text(container)).toBe(formatNumber(12635));
    expect(observers).toHaveLength(0);
    expect(raf).not.toHaveBeenCalled();
  });

  it("убран со страницы до показа — наблюдатель отключён, кадры не идут", () => {
    const { unmount } = render(<CountUp value={500} />);
    expect(observers[0].disconnected).toBe(false);
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });

  it("не требует matchMedia (старый браузер, jsdom): считает как при обычном движении", () => {
    // @ts-expect-error — намеренно убираем, как в окружении без поддержки
    window.matchMedia = undefined;
    const { container } = render(<CountUp value={700} />);
    act(() => observers[0].fire([{ isIntersecting: true }]));
    expect(text(container)).toBe("0");
  });
});

describe("cubicBezier", () => {
  // Независимая сверка: точки кривой перебором параметра, без метода Ньютона из реализации
  function reference(x1: number, y1: number, x2: number, y2: number, x: number): number {
    const bez = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (bez(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return bez((lo + hi) / 2, y1, y2);
  }

  it("концы кривой — 0 и 1, за пределами отрезка значение зажато", () => {
    const ease = cubicBezier(0.16, 1, 0.3, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(1.5)).toBe(1);
  });

  it("совпадает с точной кривой замедления счётчика на всём отрезке", () => {
    const ease = cubicBezier(0.16, 1, 0.3, 1);
    for (let x = 0.02; x < 1; x += 0.02) {
      expect(ease(x)).toBeCloseTo(reference(0.16, 1, 0.3, 1, x), 3);
    }
  });

  it("замедление к концу: первая половина времени проходит почти весь путь", () => {
    const ease = cubicBezier(0.16, 1, 0.3, 1);
    expect(ease(0.5)).toBeGreaterThan(0.9);
    expect(ease(0.1)).toBeGreaterThan(0.3);
  });

  it("не убывает", () => {
    const ease = cubicBezier(0.16, 1, 0.3, 1);
    let prev = 0;
    for (let x = 0; x <= 1; x += 0.005) {
      const y = ease(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });
});
