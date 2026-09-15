"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Ссылка с кнопкой копирования.
 *
 * Пока нет рассылки, менеджер копирует ссылки руками: приглашение
 * пользователю, выбор времени кандидатом, форма согласия, подписка
 * на календарь. Один компонент на все четыре случая.
 */
export function CopyableLink({
  url,
  hint,
}: {
  url: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Ссылку показываем целиком: видно, что именно уйдёт человеку */}
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
