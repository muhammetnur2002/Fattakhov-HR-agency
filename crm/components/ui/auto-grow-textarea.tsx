"use client";

import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** На сервере useLayoutEffect предупреждает, а высоту там всё равно считать нечем. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Поле сообщения, которое растёт вместе с текстом — одинаково во всех браузерах.
 *
 * Обычный Textarea растёт через CSS `field-sizing: content`. Chrome это
 * умеет и растит поле без предела (сообщение на двадцать строк выталкивало
 * кнопку «Отправить» с экрана), Safari до 26 и Firefox не умеют вовсе, и там
 * поле оставалось в одну строку с прокруткой внутри. Здесь рост считается
 * кодом, `field-sizing` выключен: высота — по тексту, но не выше `max-height`
 * (по умолчанию 10rem; свой предел — классом `max-h-*`), дальше появляется
 * прокрутка внутри поля.
 *
 * Высота пересчитывается при вводе, при смене значения снаружи (очистка
 * после отправки) и при смене ширины (поворот телефона, перенос строк).
 */
export const AutoGrowTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function AutoGrowTextarea({ className, onInput, value, ...props }, forwardedRef) {
    const ref = React.useRef<HTMLTextAreaElement | null>(null);

    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        ref.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const resize = React.useCallback(() => {
      const el = ref.current;
      if (!el) return;
      // Сбрасываем высоту, иначе scrollHeight не уменьшится при удалении текста
      el.style.height = "auto";
      const needed = el.scrollHeight;
      // Скрытое поле (display: none, закрытая вкладка) высоты не имеет: не схлопываем его в ноль
      if (needed === 0) return;
      const style = window.getComputedStyle(el);
      const max = parseFloat(style.maxHeight);
      const borders = el.offsetHeight - el.clientHeight;
      const limit = Number.isFinite(max) ? max : Infinity;
      const next = needed + borders;
      el.style.height = `${Math.min(next, limit)}px`;
      el.style.overflowY = next > limit ? "auto" : "hidden";
    }, []);

    // Каждый рендер, а не только смена value: поле бывает неуправляемым, и текст
    // в него возвращает браузер или родитель через ref (очистка формы после отправки)
    useIsomorphicLayoutEffect(() => {
      resize();
    });

    React.useEffect(() => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      let width = el.clientWidth;
      const observer = new ResizeObserver(() => {
        // Только смена ширины: свою же смену высоты пересчитывать незачем
        if (el.clientWidth === width) return;
        width = el.clientWidth;
        resize();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [resize]);

    return (
      <Textarea
        ref={setRef}
        value={value}
        onInput={(event) => {
          resize();
          onInput?.(event);
        }}
        // field-sizing выключен: высоту ведёт код, одинаково везде. max-h-40 — предел по умолчанию
        className={cn("field-sizing-fixed max-h-40 resize-none overflow-y-hidden", className)}
        {...props}
      />
    );
  },
);
