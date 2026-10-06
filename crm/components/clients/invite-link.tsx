"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Ссылка приглашения: по умолчанию закрыта, копируется не открываясь.
 *
 * Приглашение уходит письмом, но ссылка нужна и на экране: письмо может
 * не дойти — спам, опечатка в домене, корпоративный фильтр, — и тогда
 * передать доступ можно только руками.
 *
 * Показывать её постоянно, однако, незачем: ссылка это пропуск. Кто её
 * открыл, тот и задаёт пароль и входит под приглашённым адресом с его
 * ролью — у сотрудника агентства вместе с выданными доступами. А экраны
 * настроек и команды показывают на созвоне, фотографируют и кладут
 * в переписку. Поэтому по умолчанию видно только, что ссылка есть;
 * «Копировать» работает и в закрытом виде.
 *
 * Перенесено из CRM агентства 01.10.2026: прежняя версия здесь
 * показывала ссылку целиком и считала, что писем нет вовсе.
 */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown ? (
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
          {url}
        </code>
      ) : (
        // Текст короткий намеренно: рядом три кнопки, колонка настроек
        // узкая, и длинная фраза обрезается на полуслове. Почему скрыта —
        // написано в описании карточки, где место есть.
        <span className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          Ссылка скрыта
        </span>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
      >
        {shown ? (
          <>
            <EyeOff className="size-3.5" /> Скрыть
          </>
        ) : (
          <>
            <Eye className="size-3.5" /> Показать
          </>
        )}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={copy}>
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
  );
}
