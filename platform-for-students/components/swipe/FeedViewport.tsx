'use client';

import { useLayoutEffect, useRef } from 'react';

/** Ниже этой высоты фиксировать ленту нельзя: карточка и кнопки перестали бы помещаться. */
const MIN_FIT_HEIGHT = 440;
/** Отступ снизу: чтобы кнопки не липли к краю экрана и не прятались под панелью браузера. */
const BOTTOM_GAP = 12;

/**
 * Лента как приложение: страница не листается, карточка стоит на месте,
 * двигается только свайпом.
 *
 * Высота считается от места, где начинается блок, до низа видимой области:
 * шапка и плашки над лентой бывают разной высоты (плашка справки есть не у
 * всех), поэтому цифры в вёрстке не зашить. Прокрутка страницы гасится, пока
 * лента открыта, и возвращается при уходе. Если экран слишком низкий
 * (телефон боком), фиксация не включается — иначе кнопки остались бы за краем.
 */
export function FeedViewport({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const main = el.closest('main');
    const saved = {
      overflow: html.style.overflow,
      overscroll: html.style.overscrollBehavior,
      mainPadding: main?.style.paddingBottom ?? '',
    };

    function fit() {
      if (!el) return;
      window.scrollTo(0, 0);
      const top = el.getBoundingClientRect().top;
      const height = Math.floor(window.innerHeight - top - BOTTOM_GAP);
      if (height < MIN_FIT_HEIGHT) {
        el.style.height = '';
        html.style.overflow = saved.overflow;
        html.style.overscrollBehavior = saved.overscroll;
        if (main) main.style.paddingBottom = saved.mainPadding;
        return;
      }
      el.style.height = `${height}px`;
      // Нижний отступ страницы нужен для прокрутки; в зафиксированной ленте он
      // делает документ выше экрана, и страница всё равно уезжает вверх
      if (main) main.style.paddingBottom = '0px';
      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
    }

    fit();
    // Страница въезжает анимацией и подгружает плашки — пересчитываем, когда всё встало на места
    const timers = [80, 320, 900].map((ms) => window.setTimeout(fit, ms));
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    window.visualViewport?.addEventListener('resize', fit);

    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      html.style.overflow = saved.overflow;
      html.style.overscrollBehavior = saved.overscroll;
      if (main) main.style.paddingBottom = saved.mainPadding;
    };
  }, []);

  return (
    <div ref={ref} className="flex min-h-0 w-full flex-col items-center overflow-hidden">
      {children}
    </div>
  );
}
