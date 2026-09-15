"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Печать / сохранение в PDF — общая кнопка для профиля кандидата
 * и брифа вакансии.
 *
 * Не генерируем PDF на сервере — печатная страница уже есть, её просто
 * не было видно: стили `print:` на самой странице скрывают всё, кроме
 * того, что уместно передать вовне. Через диалог печати браузера это
 * и есть «Сохранить как PDF», без лишней библиотеки и формата данных,
 * который потом надо поддерживать.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => window.print()}
      aria-label={label}
    >
      <Printer className="size-4" />
      {/* Рядом почти всегда кнопка «назад» с длинным названием — вдвоём
          на самых узких телефонах (iPhone SE и уже) подпись здесь лишняя,
          иконки достаточно; порог не «sm» (640px) — это скрыло бы текст
          и на нормальных телефонах, где место есть */}
      <span className="hidden min-[400px]:inline">{label}</span>
    </Button>
  );
}
