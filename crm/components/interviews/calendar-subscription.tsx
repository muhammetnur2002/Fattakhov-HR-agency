"use client";

import { useRef, useState, useTransition } from "react";

import { regenerateCalendarLinkAction } from "@/app/actions/calendar";

import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";

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
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, focusRef, questionId, groupProps } = useConfirmFocus(confirming);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      {confirming ? (
        <Panel tone="danger" {...groupProps}>
          <p id={questionId} className="text-xs">
            Прежняя ссылка перестанет работать, а подписку в календаре придётся добавить заново. Обновить?
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await regenerateCalendarLinkAction();
                  setMessage(result.ok ?? result.error ?? null);
                  setConfirming(false);
                })
              }
            >
              {pending ? "Обновляем…" : "Да, обновить"}
            </Button>
            <Button ref={focusRef} aria-describedby={questionId} type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        </Panel>
      ) : (
        <Button ref={triggerRef} type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          Обновить ссылку
        </Button>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </Panel>
  );
}
