// @vitest-environment jsdom
/**
 * Переписка при открытой клавиатуре на телефоне (lib/hooks/use-keyboard-viewport.ts).
 *
 * Экран переписки гасит отступы main отрицательными полями (-m-4) и держит
 * место под нижнюю панель разделов своей высотой. Пока клавиатура открыта,
 * он закреплён по видимой области (fixed, top/height из visualViewport) —
 * и отрицательные поля у fixed-элемента с left/right/top сдвинули бы его
 * на 16px за края экрана, а отступ под полосу «Домой» оставил бы пустую
 * полосу над клавиатурой. Клавиатуру в браузере не открыть — поэтому
 * видимая область здесь подменяется руками.
 */
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useKeyboardViewport } from "@/lib/hooks/use-keyboard-viewport";

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
}

let vv: FakeVisualViewport;

function Screen() {
  const ref = useRef<HTMLDivElement>(null);
  useKeyboardViewport(ref);
  // Отступы — классами, как у настоящих экранов переписки (messages-shell,
  // student-messages): закрепление их перекрывает инлайном и снимает
  return <div ref={ref} data-testid="screen" className="-mx-4 -mt-4 -mb-4" />;
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

beforeEach(() => {
  vv = new FakeVisualViewport();
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  setViewport(375, 800);
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-app-keyboard");
});

describe("переписка при открытой клавиатуре", () => {
  it("закрепляется по видимой области без своих отступов из раскладки", () => {
    const { getByTestId } = render(<Screen />);
    const el = getByTestId("screen");

    vv.height = 420;
    vv.offsetTop = 0;
    vv.dispatchEvent(new Event("resize"));

    expect(document.documentElement.hasAttribute("data-app-keyboard")).toBe(true);
    expect(el.style.position).toBe("fixed");
    expect(el.style.height).toBe("420px");
    // Ни сдвига за края экрана, ни пустой полосы над клавиатурой
    expect(el.style.margin).toBe("0px");
    expect(el.style.paddingBottom).toBe("0px");
  });

  it("после закрытия клавиатуры возвращает обычную раскладку целиком", () => {
    const { getByTestId } = render(<Screen />);
    const el = getByTestId("screen");

    vv.height = 420;
    vv.dispatchEvent(new Event("resize"));
    vv.height = 800;
    vv.dispatchEvent(new Event("resize"));

    expect(document.documentElement.hasAttribute("data-app-keyboard")).toBe(false);
    expect(el.style.position).toBe("");
    expect(el.style.height).toBe("");
    expect(el.style.paddingBottom).toBe("");
    // Инлайн-отступов не осталось — снова действуют классы раскладки
    expect(el.style.margin).toBe("");
    expect(el.getAttribute("style") ?? "").toBe("");
  });

  it("с md экран не закрепляется — там нет ни клавиатуры поверх, ни панели", () => {
    setViewport(1024, 800);
    const { getByTestId } = render(<Screen />);
    const el = getByTestId("screen");

    vv.height = 420;
    vv.dispatchEvent(new Event("resize"));

    expect(document.documentElement.hasAttribute("data-app-keyboard")).toBe(false);
    expect(el.style.position).toBe("");
  });
});
