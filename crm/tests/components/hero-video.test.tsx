// @vitest-environment jsdom
/**
 * Ролик героя: на телефоне и при «уменьшить движение» его нет в разметке вовсе.
 * Скрытый CSS-ом <video> браузер всё равно скачивает и проигрывает (240 КБ на каждом телефоне).
 *
 * Дополнено 13.10.2026: ролик — украшение, а не содержание. Его нет при «Экономии данных» и на совсем медленной
 * сети (2G по оценке браузера): 240 КБ ради фона не тратим, статичный кадр остаётся. На «3g» ролик показывается
 * (правка 15.10.2026 после проверки): Chrome по задержке и скорости легко называет «3g» обычный ноутбук с
 * посредственным Wi-Fi или VPN, и заметный элемент первого экрана пропадал бы у части обычных посетителей,
 * хотя на метрики ролик не влияет (стартует после LCP). Отложить старт
 * до простоя пробовали и откатили: на замерах (ноутбук, медленная 4G) ролик и так начинается после
 * гидратации, около 2,4 с, и на LCP (1,7 с) не влияет — выигрыша в пределах шума нет.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeroVideo, connectionAllowsVideo } from "@/components/marketing/hero-video";

function mockMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}

function setConnection(value: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", { value, configurable: true });
}

beforeEach(() => {
  setConnection(undefined);
});

afterEach(() => {
  cleanup();
  setConnection(undefined);
});

describe("ролик героя", () => {
  it("широкий экран и обычное движение: ролик есть и запускается", () => {
    mockMedia(true);
    const { container } = render(<HeroVideo />);
    expect(container.querySelector("video source")?.getAttribute("src")).toBe("/brand/hero-loop.mp4");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("телефон или reduced-motion: элемента нет, файл не запрашивается", () => {
    mockMedia(false);
    const { container } = render(<HeroVideo />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("source")).toBeNull();
  });

  it("условие показа — и ширина, и предпочтение движения", () => {
    mockMedia(true);
    render(<HeroVideo />);
    const query = (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(query).toMatch(/min-width: 768px/);
    expect(query).toMatch(/prefers-reduced-motion: no-preference/);
  });

  it("постера нет: кадр лежит под роликом (hero.tsx), второй адрес той же картинки скачивался бы ещё раз", () => {
    mockMedia(true);
    const { container } = render(<HeroVideo />);
    const video = container.querySelector("video")!;
    expect(video).toBeTruthy();
    expect(video.hasAttribute("poster")).toBe(false);
  });
});

describe("ролик героя и сеть", () => {
  it.each([
    ["«Экономия данных»", { saveData: true, effectiveType: "4g" }],
    ["«Экономия данных» на 3G", { saveData: true, effectiveType: "3g" }],
    ["2G", { effectiveType: "2g" }],
    ["медленный 2G", { effectiveType: "slow-2g" }],
  ])("%s: ролика нет, 240 КБ не тратим", (_name, connection) => {
    mockMedia(true);
    setConnection(connection);
    const { container } = render(<HeroVideo />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("source")).toBeNull();
  });

  it.each([
    ["4G", { effectiveType: "4g", saveData: false }],
    ["3G по оценке Chrome (обычный ноутбук с посредственным Wi-Fi или VPN)", { effectiveType: "3g", saveData: false }],
    ["сведений о сети нет (Safari, Firefox)", undefined],
    ["сведения неполные", {}],
  ])("%s: ролик показывается", (_name, connection) => {
    mockMedia(true);
    setConnection(connection);
    const { container } = render(<HeroVideo />);
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("connectionAllowsVideo — одно правило и для показа, и для проверки", () => {
    setConnection({ saveData: true });
    expect(connectionAllowsVideo()).toBe(false);
    setConnection({ effectiveType: "2g" });
    expect(connectionAllowsVideo()).toBe(false);
    setConnection({ effectiveType: "slow-2g" });
    expect(connectionAllowsVideo()).toBe(false);
    setConnection({ effectiveType: "3g" });
    expect(connectionAllowsVideo()).toBe(true);
    setConnection({ effectiveType: "4g" });
    expect(connectionAllowsVideo()).toBe(true);
    setConnection(undefined);
    expect(connectionAllowsVideo()).toBe(true);
  });
});
