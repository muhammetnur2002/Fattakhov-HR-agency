import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Пустое состояние списка: одна карточка, одинаковый отступ и текст.
 *
 * Раньше в кабинете было 20 копий `<Card><CardContent className="p-8
 * text-center …">`, и у двадцати не было следующего шага: человек читал
 * «Пока пусто» и не знал, что с этим делать. Теперь у компонента есть
 * место под действие (`action`) — кнопку или ссылку, которая ведёт дальше.
 */
export function EmptyState({
  children,
  action,
  className,
}: {
  /** Что сказать: почему пусто и когда появится. */
  children: React.ReactNode;
  /** Следующий шаг: кнопка или ссылка. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card data-slot="empty-state" className={className}>
      <CardContent className={cn("space-y-3 p-8 text-center text-sm text-muted-foreground")}>
        <div className="space-y-2">{children}</div>
        {action && <div className="flex justify-center">{action}</div>}
      </CardContent>
    </Card>
  );
}
