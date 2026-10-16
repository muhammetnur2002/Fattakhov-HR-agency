"use client";

import { useRef, useState } from "react";

import { regenerateCalendarLinkAction } from "@/app/actions/calendar";

import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { Panel, panelClass } from "@/components/ui/panel";

/**
 * Подписка на календарь.
 *
 * Вместо двусторонней синхронизации с Google и Яндексом (это OAuth,
 * вебхуки и разрешение конфликтов — отдельный проект, ТЗ 10.1) человек
 * один раз добавляет ссылку в свой календарь, и встречи приходят сами.
 */
export function CalendarSubscription({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Подписаться на календарь
      </Button>
    );
  }

  return (
    // min-w-0 и max-w-full: карточка стоит во flex-строке заголовка, а её содержимое
    // (длинный адрес без пробелов) иначе растягивает её шире экрана телефона и
    // «Копировать» уезжает за край
    <Panel className="min-w-0 max-w-full">
      <div className="text-sm font-medium">Ссылка для календаря</div>
      <div className="flex items-center gap-2">
        {/* Адрес переносится, а не обрезается: его видно целиком, и выделение при
            отказе буфера захватывает то, что видно */}
        <code
          ref={codeRef}
          className="min-w-0 flex-1 rounded bg-muted px-2 py-1 text-xs break-all"
        >
          {url}
        </code>
        <CopyButton text={url} targetRef={codeRef} />
      </div>
      <p className="text-xs text-muted-foreground">
        Добавьте её в Google Календарь, Яндекс Календарь или Outlook как
        подписку по ссылке — встречи появятся сами и будут обновляться.
        Ссылка личная, не пересылайте её.
      </p>
      <ConfirmBlock
        trigger={
          <Button type="button" size="sm" variant="ghost">
            Обновить ссылку
          </Button>
        }
        className={panelClass("danger")}
        compact
        question="Прежняя ссылка перестанет работать, а подписку в календаре придётся добавить заново. Обновить?"
        confirmLabel="Да, обновить"
        pendingLabel="Обновляем…"
        onConfirm={async () => {
          const result = await regenerateCalendarLinkAction();
          setMessage(result.ok ?? null);
          return result;
        }}
      />
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </Panel>
  );
}
