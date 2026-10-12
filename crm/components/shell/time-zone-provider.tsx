"use client";

import { createContext, useContext } from "react";

import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@/lib/format-date";

/**
 * Часовой пояс человека для клиентских компонентов.
 *
 * Макет кабинета читает `User.timezone` на сервере и кладёт сюда: клиентский
 * компонент показывает время в той же зоне, что и серверный, и первый кадр
 * на сервере совпадает с гидратацией. Вне провайдера (сайт, публичные
 * страницы, тесты) — `DEFAULT_TIME_ZONE`: она одна на обеих сторонах, и
 * различия между сервером и браузером неоткуда взяться.
 */
const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

export function TimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) {
  return (
    <TimeZoneContext.Provider value={resolveTimeZone(timeZone)}>
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
