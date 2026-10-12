// @vitest-environment jsdom
/**
 * Ролик героя: на телефоне и при «уменьшить движение» его нет в разметке вовсе.
 * Скрытый CSS-ом <video> браузер всё равно скачивает и проигрывает (240 КБ на каждом телефоне).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeroVideo } from "@/components/marketing/hero-video";

function mockMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}

afterEach(cleanup);

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
});
