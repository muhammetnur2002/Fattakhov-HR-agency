"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Кнопка отправки формы: во время отправки показывает индикатор, меняет текст
 * на `pendingLabel` (если он есть) и не даёт отправить повторно.
 *
 * Единая вместо 36 копий в разных формах: у каждой была своя «…» или
 * «Сохраняем…», и ни одна не отличалась от выключенной кнопки, кроме текста.
 * Состояние берёт у ближайшей формы (`useFormStatus`), поэтому кнопка
 * должна стоять внутри <form>.
 *
 * Два случая, из-за которых раньше кнопки писали заново:
 * - форма уходит не через `action`, а через `onSubmit` и `startTransition`
 *   (чтобы не терять набранное, например выбранный файл): `useFormStatus`
 *   её не видит. Состояние передаётся явно — `loading={pending}`; оно
 *   складывается с состоянием формы, а не заменяет его;
 * - в форме несколько кнопок отправки (у каждой `name` и `value`): индикатор
 *   и подпись «идёт» — только у нажатой, остальные просто блокируются.
 *
 * Для читалки ход отправки объявляется отдельным скрытым `role="status"`: кнопка на время
 * запроса блокируется, а смена её подписи читалка не озвучивает — человек не знал, ушла ли
 * форма. Область стоит ДО кнопки и всегда в разметке (пустая, пока ничего не идёт): живая область,
 * которой не было до появления текста, объявляется не везде. Она `absolute`, поэтому не занимает
 * места ни во flex/grid, ни в `space-y-*`, а стоит перед кнопкой, чтобы та оставалась последним
 * ребёнком контейнера и не получала лишний отступ снизу. Не внутри кнопки: дети кнопки для
 * читалки — часть её названия. `announce={false}` — у кнопки, что объявляет себя сама.
 */
export function SubmitButton({
  pendingLabel,
  announce = true,
  children,
  disabled,
  loading,
  name,
  value,
  ...props
}: React.ComponentProps<typeof Button> & {
  /** Что написать, пока идёт отправка; нет — остаётся прежний текст. */
  pendingLabel?: React.ReactNode;
  /** Объявлять читалке «Отправляем…» (по умолчанию да). */
  announce?: boolean;
}) {
  const { pending, data } = useFormStatus();
  // Нажата именно эта кнопка: у формы с одной кнопкой имени нет — тогда любая отправка её
  const mine = pending && (name === undefined || value === undefined || data?.get(name) === String(value));
  const busy = Boolean(loading) || mine;
  return (
    <>
      {announce && (
        <span role="status" className="sr-only">
          {busy ? "Отправляем…" : ""}
        </span>
      )}
      <Button
        type="submit"
        name={name}
        value={value}
        loading={busy}
        disabled={disabled || pending}
        {...props}
      >
        {busy && pendingLabel ? pendingLabel : children}
      </Button>
    </>
  );
}
