"use client";

import { useRef } from "react";

import { CopyButton } from "@/components/shared/copy-button";

/**
 * Ссылка с кнопкой копирования.
 *
 * Пока нет рассылки, менеджер копирует ссылки руками: приглашение
 * пользователю, выбор времени кандидатом, форма согласия, подписка
 * на календарь. Один компонент на все случаи. Если буфер обмена
 * недоступен, кнопка скажет об этом и выделит ссылку (CopyButton).
 */
export function CopyableLink({
  url,
  hint,
}: {
  url: string;
  hint?: string;
}) {
  const codeRef = useRef<HTMLElement>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Ссылку показываем целиком: видно, что именно уйдёт человеку */}
        <code ref={codeRef} className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
          {url}
        </code>
        <CopyButton text={url} targetRef={codeRef} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
