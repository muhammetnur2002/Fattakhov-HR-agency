"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Ссылка приглашения с копированием.
 *
 * Почтовой рассылки пока нет (Этап 7), поэтому менеджер копирует ссылку
 * и передаёт её сам. Показываем целиком: так видно, что именно уходит клиенту.
 */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
        {url}
      </code>
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
