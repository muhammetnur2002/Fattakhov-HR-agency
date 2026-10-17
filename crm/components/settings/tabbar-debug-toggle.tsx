"use client";

import { useEffect, useState } from "react";

import {
  TABBAR_DEBUG_CHANGE_EVENT,
  readTabbarDebugFlag,
  readTabbarNoHideFlag,
  writeTabbarDebugFlag,
  writeTabbarNoHideFlag,
} from "@/lib/tabbar-debug";

/**
 * Один переключатель с флагом в `localStorage`: галочка, подпись, пояснение и честное «не удалось
 * сохранить», если хранилище недоступно. Флаг читается после показа: на сервере хранилища нет,
 * а разметка сервера и клиента должна совпасть.
 */
function FlagCheckbox({
  label,
  hint,
  read,
  write,
}: {
  label: string;
  hint: string;
  read: () => boolean;
  write: (on: boolean) => boolean;
}) {
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => setOn(read());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, sync);
    };
  }, [read]);

  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => {
            const wanted = event.currentTarget.checked;
            const saved = write(wanted);
            setFailed(!saved);
            // Не удалось записать — переключатель остаётся там, где флаг на самом деле
            setOn(saved ? wanted : read());
          }}
          className="mt-0.5"
        />
        <span>{label}</span>
      </label>
      <p className="pl-6">{hint}</p>
      {failed && (
        <p role="status" className="pl-6">
          Не удалось сохранить: в этом браузере недоступно хранилище, настройка не включится.
        </p>
      )}
    </div>
  );
}

/**
 * Переключатели временной диагностики нижней панели разделов — внизу «Настроек» обоих кабинетов
 * (lib/tabbar-debug.ts). Кабинет на телефоне открыт как приложение с экрана «Домой», адресной
 * строки нет, поэтому параметром ссылки диагностику не включить. Флаги хранятся только в этом
 * браузере; пока выключены, на страницах ничего не меняется.
 *
 * Два независимых флага. «Диагностика» — отладочная строка поверх страницы. «Не прятать панель
 * при прокрутке» — стоп-кран: панель не прячется листанием, пока причину зависания ищут, и способ
 * проверить, зависает ли панель, которую не прячут.
 *
 * Убрать вместе с отладочной строкой (components/shell/tabbar-debug.tsx), когда причина
 * зависания панели на iPhone найдена.
 */
export function TabbarDebugToggle() {
  return (
    <div className="mt-8 space-y-4 border-t pt-3 text-xs text-muted-foreground">
      <FlagCheckbox
        label="Диагностика панели разделов (временно)"
        hint="Вверху слева поверх страницы появится строка с состоянием нижней панели, а внизу слева — маленький розовый квадрат. Если панель зависнет, сделайте скриншот. Настройка хранится только в этом браузере."
        read={readTabbarDebugFlag}
        write={writeTabbarDebugFlag}
      />
      <FlagCheckbox
        label="Не прятать панель при прокрутке (временно)"
        hint="Нижняя панель всегда на месте и при листании не уезжает. Пригодится, если она зависает: так можно пользоваться кабинетом и проверить, зависает ли панель, которую не прячут."
        read={readTabbarNoHideFlag}
        write={writeTabbarNoHideFlag}
      />
    </div>
  );
}
