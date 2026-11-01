'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Ширина, с которой чат показывается двумя колонками в карточке; уже — как приложение на весь экран. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Экран на весь остаток окна, как в мобильном приложении: без рамки и без
 * прокрутки самой страницы — листается только список или переписка внутри.
 *
 * Высота считается от места, где блок начинается, до низа видимой области
 * (visualViewport: когда открыта клавиатура, поле ввода остаётся над ней).
 * Верхний и нижний отступы страницы на это время обнуляются, а блокировка
 * прокрутки просто снимается при уходе — ничего не «запоминаем и возвращаем»,
 * иначе при быстрой смене экранов она залипала на других страницах.
 */
export function useAppViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const main = el.closest('main');
    const desktop = window.matchMedia(DESKTOP_QUERY);

    function unlock() {
      if (!el) return;
      html.removeAttribute('data-app-screen');
      for (const prop of ['height', 'position', 'top', 'left', 'right', 'z-index']) el.style.removeProperty(prop);
      html.style.removeProperty('overflow');
      html.style.removeProperty('overscroll-behavior');
      main?.style.removeProperty('overflow');
      main?.style.removeProperty('padding-top');
      main?.style.removeProperty('padding-bottom');
    }

    function fit() {
      if (!el) return;
      if (desktop.matches) {
        unlock();
        return;
      }
      // Keep the same shell and horizontal gutters when a search or composer gains focus.
      html.setAttribute('data-app-screen', '');
      if (main) {
        main.scrollTop = 0;
        main.style.overflow = 'hidden';
        main.style.paddingTop = '0px';
        main.style.paddingBottom = '0px';
      }
      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      const vv = window.visualViewport;
      // Pinch zoom belongs to the user; do not resize the layout around a zoomed viewport.
      if (vv && Math.abs(vv.scale - 1) > 0.01) return;
      const bottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
      el.style.height = `${Math.max(0, Math.floor(bottom - el.getBoundingClientRect().top))}px`;

    }

    fit();
    // Страница въезжает анимацией и подгружает плашки — пересчитываем, когда всё встало на места
    const timers = [80, 320, 900].map((ms) => window.setTimeout(fit, ms));
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    desktop.addEventListener('change', fit);

    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
      desktop.removeEventListener('change', fit);
      unlock();
    };
  }, [ref]);
}
