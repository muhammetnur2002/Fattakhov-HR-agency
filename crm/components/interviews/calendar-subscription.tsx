"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Подписка на календарь.
 *
 * Вместо двусторонней синхронизации с Google и Яндексом (это OAuth,
 * вебхуки и разрешение конфликтов — отдельный проект, ТЗ 10.1) человек
 * один раз добавляет ссылку в свой календарь, и встречи приходят сами.
 */
export function CalendarSubscription({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Подписаться на календарь
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">Ссылка для календаря</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
          {url}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Скопировано
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Копировать
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Добавьте её в Google Календарь, Яндекс Календарь или Outlook как
        подписку по ссылке — встречи появятся сами и будут обновляться.
        Ссылка личная, не пересылайте её.
      </p>
    </div>
  );
}
