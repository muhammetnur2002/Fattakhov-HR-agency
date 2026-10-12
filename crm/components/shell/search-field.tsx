"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useListNavigation } from "./list-pending";
import { ListSearchInput } from "./list-toolbar";

/**
 * Поиск, привязанный к адресу (`?q=`), а не к локальному состоянию.
 *
 * Фильтрация идёт на сервере (BR-22 — списки не грузятся целиком ради
 * фильтра на клиенте), поэтому ввод не режет список сам, а обновляет
 * URL с задержкой в 300мс, и уже это перерисовывает страницу.
 *
 * Вид и ширина — у `ListSearchInput`, а ставят поле внутрь `ListToolbar`.
 * Пока сервер собирает новую выборку, на месте лупы крутится индикатор, а
 * список помечен `aria-busy` (`list-pending.tsx`).
 */
export function SearchField({
  paramName = "q",
  placeholder = "Поиск…",
}: {
  paramName?: string;
  placeholder?: string;
}) {
  const { navigate, pending } = useListNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramName) ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) params.set(paramName, value);
      else params.delete(paramName);
      // Новый поиск — заново с первой страницы (см. LoadMore)
      params.delete("page");
      navigate(`${pathname}?${params.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <ListSearchInput
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      label={placeholder.replace(/…$/, "")}
      pending={pending}
    />
  );
}
