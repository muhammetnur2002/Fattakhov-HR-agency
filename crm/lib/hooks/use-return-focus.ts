"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Фокус возвращается туда, откуда его взяли: после закрытия окна и блока
 * подтверждения клавиатура продолжает с кнопки, которая их открыла.
 *
 * Без этого человек с клавиатурой или читалкой экрана после «Отмены» оказывался
 * в начале страницы (`document.body`) и заново проходил Tab'ом шапку и меню.
 * Radix возвращает фокус сам, но только на `DialogTrigger`: у окон, открытых
 * состоянием (`open={…}`, кнопка стоит рядом, а не внутри `Dialog`), триггера
 * нет, и `DialogContent` отдаёт фокус никуда. Блок подтверждения («Удалить? Да /
 * Отмена») — вовсе не окно: кнопка на его месте исчезает, и фокус терялся уже
 * при открытии. Аудит 11.10.2026 (a11y-4).
 *
 * Два хука, по одному на каждый случай:
 *
 * - `useReturnFocus()` — для `Dialog` и `Sheet` без `DialogTrigger`. Открывающее
 *   действие вызывает `remember(кнопка)`, а `DialogContent` получает
 *   `onCloseAutoFocus={returnFocus.onCloseAutoFocus}` — Radix вызывает его после
 *   закрытия, когда окно уже ушло, и фокус встаёт на запомненное.
 * - `useConfirmFocus(open)` — для блока, который заменяет кнопку на месте:
 *   при открытии фокус уходит на `focusRef` (безопасное действие «Отмена» или
 *   поле, которое надо заполнить), при закрытии — на кнопку, открывавшую блок.
 *
 * Элемент, которого уже нет в странице (список перерисовался, строку удалили),
 * пропускается: фокус не уходит в пустоту и не бросает ошибку.
 */

function canFocus(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  return el.getAttribute("aria-hidden") !== "true";
}

export type ReturnFocus = {
  /**
   * Запомнить, куда вернуть фокус. Вызывается из обработчика, который открывает
   * окно. Без аргумента берёт `document.activeElement` — кнопку, на которую нажали
   * (Safari на macOS кнопке фокус не даёт, поэтому лучше передавать `event.currentTarget`).
   */
  remember: (el?: Element | null) => void;
  /** Вернуть фокус сейчас (для окон, которые закрываются без Radix). */
  restore: () => void;
  /** Для `onCloseAutoFocus` у `DialogContent` / `SheetContent`. */
  onCloseAutoFocus: (event: Event) => void;
};

export function useReturnFocus(): ReturnFocus {
  const origin = useRef<HTMLElement | null>(null);

  const remember = useCallback((el?: Element | null) => {
    const candidate = el ?? document.activeElement;
    origin.current =
      candidate instanceof HTMLElement && candidate !== document.body ? candidate : null;
  }, []);

  const restore = useCallback(() => {
    const target = origin.current;
    origin.current = null;
    if (canFocus(target)) target.focus({ preventScroll: true });
  }, []);

  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      // Radix сам вернул бы фокус на DialogTrigger; триггера нет — решаем мы
      event.preventDefault();
      restore();
    },
    [restore],
  );

  return { remember, restore, onCloseAutoFocus };
}

/**
 * Блок подтверждения, который встаёт на место кнопки.
 *
 * `triggerRef` — на кнопку, открывающую блок; `focusRef` — на то, что получает
 * фокус при открытии: безопасное действие («Отмена» — случайный Enter ничего
 * не удалит) или поле ввода, если блок просит что-то написать. Кнопка при
 * открытии блока исчезает из страницы и возвращается при закрытии, поэтому
 * ссылка хранится на ней самой, а не на запомненном элементе: после закрытия
 * это уже новый элемент.
 */
export function useConfirmFocus<
  Trigger extends HTMLElement = HTMLButtonElement,
  Focus extends HTMLElement = HTMLButtonElement,
>(open: boolean) {
  const triggerRef = useRef<Trigger | null>(null);
  const focusRef = useRef<Focus | null>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    const target = open ? focusRef.current : triggerRef.current;
    if (canFocus(target)) target.focus({ preventScroll: true });
  }, [open]);

  return { triggerRef, focusRef };
}
