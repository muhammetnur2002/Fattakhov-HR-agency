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
export function useAppViewport(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const main = el.closest('main');
    const desktop = window.matchMedia(DESKTOP_QUERY);

    function unlock() {
      if (!el) return;
      html.removeAttribute('data-app-screen');
      html.removeAttribute('data-app-keyboard');
      for (const prop of ['height', 'position', 'top', 'left', 'right', 'z-index']) el.style.removeProperty(prop);
      html.style.removeProperty('overflow');
      html.style.removeProperty('overscroll-behavior');
      main?.style.removeProperty('padding-top');
      main?.style.removeProperty('padding-bottom');
    }

    function fit() {
      if (!el) return;
      if (desktop.matches) {
        unlock();
        return;
      }
      // Пока открыта клавиатура, положением страницы управляет iOS — не мешаем ему
      if (!html.hasAttribute('data-app-keyboard')) window.scrollTo(0, 0);
      // Плавающая кнопка темы закрывала бы поле ввода: на экране-приложении её прячем (см. globals.css)
      html.setAttribute('data-app-screen', '');
      // Клавиатура открыта, когда видимая область заметно ниже окна. Тогда, как в
      // Telegram, шапка сайта с вкладками уходит: иначе она занимает почти всё, что
      // осталось над клавиатурой, а переписка сжимается в полоску (см. globals.css)
      const visible = window.visualViewport?.height ?? window.innerHeight;
      if (window.innerHeight - visible > 120) html.setAttribute('data-app-keyboard', '');
      else html.removeAttribute('data-app-keyboard');
      if (main) {
        main.style.paddingTop = '0px';
        main.style.paddingBottom = '0px';
      }
      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      const vv = window.visualViewport;
      const viewport = vv?.height ?? window.innerHeight;
      if (window.innerHeight - viewport > 120) {
        // Клавиатура открыта. iOS при этом сдвигает видимую область вверх, чтобы показать
        // поле ввода, — обычная вёрстка уезжает за её край. Закрепляем экран чата прямо по
        // видимой области: он всегда занимает ровно место между верхом и клавиатурой
        el.style.position = 'fixed';
        el.style.top = `${Math.round(vv?.offsetTop ?? 0)}px`;
        el.style.left = '0';
        el.style.right = '0';
        el.style.zIndex = '40';
        el.style.height = `${Math.floor(viewport)}px`;
      } else {
        for (const prop of ['position', 'top', 'left', 'right', 'z-index']) el.style.removeProperty(prop);
        el.style.height = `${Math.floor(viewport - el.getBoundingClientRect().top)}px`;
      }
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
