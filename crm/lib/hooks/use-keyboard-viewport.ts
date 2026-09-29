"use client";

import { useEffect, type RefObject } from "react";

/** Порог, с которого разница высот окна и видимой области считается открытой клавиатурой. */
const KEYBOARD_MIN_PX = 120;
/** Ниже этой ширины чат занимает экран целиком (md в tailwind). */
const MOBILE_MAX_WIDTH = 767;

/**
 * Переписка на телефоне при открытой клавиатуре — как в Telegram.
 *
 * Обычная вёрстка по высоте окна клавиатуру не учитывает: в iOS она ложится
 * поверх страницы и закрывает поле ввода и последние сообщения. Пока клавиатура
 * открыта, экран переписки закрепляется по видимой области (visualViewport) —
 * между верхом и клавиатурой, — а шапка кабинета скрывается, чтобы не отнимать
 * место (см. globals.css). После закрытия всё возвращается как было.
 */
export function useKeyboardViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    const html = document.documentElement;
    const props = ["position", "top", "left", "right", "height", "z-index", "background"];

    function release() {
      if (!el) return;
      html.removeAttribute("data-app-keyboard");
      for (const prop of props) el.style.removeProperty(prop);
    }

    function sync() {
      if (!el || !vv) return;
      const open = window.innerWidth <= MOBILE_MAX_WIDTH && window.innerHeight - vv.height > KEYBOARD_MIN_PX;
      if (!open) {
        release();
        return;
      }
      html.setAttribute("data-app-keyboard", "");
      el.style.position = "fixed";
      el.style.top = `${Math.round(vv.offsetTop)}px`;
      el.style.left = "0";
      el.style.right = "0";
      el.style.height = `${Math.floor(vv.height)}px`;
      el.style.zIndex = "40";
      el.style.background = "var(--background)";
    }

    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      release();
    };
  }, [ref]);
}

/**
 * Держит последнее сообщение на виду, пока человек печатает: нажал в поле или
 * поменялся размер видимой области — лента прокручивается вниз, как в мессенджерах.
 */
export function useScrollToLatestOnKeyboard(scroller: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const toBottom = () => {
      const node = scroller.current;
      if (node) node.scrollTop = node.scrollHeight;
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLTextAreaElement)) return;
      // Клавиатура выезжает с задержкой — догоняем, когда размер уже поменялся
      window.setTimeout(toBottom, 120);
      window.setTimeout(toBottom, 420);
    };
    const onResize = () => {
      if (document.activeElement instanceof HTMLTextAreaElement) toBottom();
    };
    vv?.addEventListener("resize", onResize);
    document.addEventListener("focusin", onFocus);
    return () => {
      vv?.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocus);
    };
  }, [scroller]);
}
