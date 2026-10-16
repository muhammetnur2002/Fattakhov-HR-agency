"use client";

import { useCallback, useEffect, useId, useMemo, useRef, type RefObject } from "react";

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
 *   Вопрос блока («Удалить аккаунт? Это нельзя отменить.») связан с ним:
 *   хук отдаёт `questionId` (на абзац с вопросом) и `groupProps` (на контейнер
 *   блока: `role="group"` с названием из вопроса; у `<form>` вместо них —
 *   `aria-labelledby={questionId}`). Кнопка, получающая фокус, описана тем же
 *   вопросом (`aria-describedby={questionId}`): название группы при переводе
 *   фокуса читают не всегда, описание кнопки — надёжнее. Иначе фокус молча
 *   встаёт на «Отмена», и читалка говорит только «Отмена, кнопка» — человек не
 *   узнаёт ни что появился запрос подтверждения, ни о чём он. Разметка и
 *   размеры от этого не меняются.
 *
 * Элемент, которого уже нет в странице (список перерисовался, строку удалили),
 * пропускается: фокус не уходит в пустоту и не бросает ошибку.
 *
 * Новые блоки подтверждения («Да / Отмена») сам хук не вызывают: их рисует `ConfirmBlock`
 * (`components/ui/confirm-block.tsx`) — вопрос, кнопки, ожидание, ошибка, Escape и этот хук внутри.
 * Напрямую он нужен только раскрывашкам, где на месте кнопки встаёт обычная форма, не подтверждение.
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
  /**
   * Забыть запомненное: окно закрывается переходом на другую страницу (плитка шторки
   * «Ещё»), и вернуть фокус на кнопку в панели значит гонять Next, который сам ставит
   * фокус на новой странице.
   */
  forget: () => void;
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

  const forget = useCallback(() => {
    origin.current = null;
  }, []);

  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      // Radix сам вернул бы фокус на DialogTrigger; триггера нет — решаем мы
      event.preventDefault();
      restore();
    },
    [restore],
  );

  return { remember, restore, forget, onCloseAutoFocus };
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
 *
 * `questionId` — на абзац или подпись с вопросом, `groupProps` — на контейнер блока:
 * читалка экрана называет группу вопросом, когда фокус входит в неё. Хуков на одном
 * экране может быть несколько (удаление и закрытие рядом) — идентификаторы у каждого свои.
 *
 * Вторым аргументом `ConfirmBlock` передаёт своё: `triggerRef` — кнопка, которая живёт вне
 * блока и принадлежит родителю (строка в шапке комментария, ряд кнопок), и `resolveFocus` —
 * что получает фокус при открытии, когда это не одна известная ссылка (первое поле блока
 * либо «Отмена»). Читается в момент открытия, поэтому поле, появившееся в этой же отрисовке,
 * находится.
 */
export function useConfirmFocus<
  Trigger extends HTMLElement = HTMLButtonElement,
  Focus extends HTMLElement = HTMLButtonElement,
>(
  open: boolean,
  options: {
    triggerRef?: RefObject<Trigger | null>;
    resolveFocus?: () => HTMLElement | null;
  } = {},
) {
  const ownTrigger = useRef<Trigger | null>(null);
  const triggerRef = options.triggerRef ?? ownTrigger;
  const focusRef = useRef<Focus | null>(null);
  const resolveFocus = useRef(options.resolveFocus);
  const wasOpen = useRef(open);
  const questionId = useId();
  const groupProps = useMemo(
    () => ({ role: "group" as const, "aria-labelledby": questionId }),
    [questionId],
  );

  useEffect(() => {
    resolveFocus.current = options.resolveFocus;
  });

  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    const target = open ? (resolveFocus.current?.() ?? focusRef.current) : triggerRef.current;
    if (canFocus(target)) target.focus({ preventScroll: true });
  }, [open, triggerRef]);

  return { triggerRef, focusRef, questionId, groupProps };
}
