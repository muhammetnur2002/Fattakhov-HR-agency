"use client";

import { useEffect, type RefObject } from "react";

/**
 * Подвинуть горизонтально прокручиваемый ряд так, чтобы активная пилюля
 * (aria-current="page" или "true") была на виду целиком.
 *
 * На телефоне ряд вкладок шире экрана: «Сообщения» — самая правая — на
 * загрузке оказывалась за краем, и человек не видел, где он. Прокручивается
 * только сам ряд (scrollLeft), а не страница, как это сделал бы scrollIntoView.
 * `dep` — то, что меняет активную вкладку (адрес страницы).
 */
export function useScrollActiveIntoView(ref: RefObject<HTMLElement | null>, dep: unknown) {
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const active = row.querySelector<HTMLElement>('[aria-current="page"], [aria-current="true"]');
    if (!active) return;
    // Запас у края, чтобы пилюля не упиралась в него вплотную
    const gap = 8;
    // Положение внутри прокручиваемого содержимого — через рамки, а не offsetLeft:
    // тот считается от ближайшего позиционированного предка, а не от самого ряда
    const box = active.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const left = box.left - rowBox.left + row.scrollLeft;
    const right = left + box.width;
    if (left - gap < row.scrollLeft) {
      row.scrollLeft = Math.max(0, left - gap);
    } else if (right + gap > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = right + gap - row.clientWidth;
    }
  }, [ref, dep]);
}
