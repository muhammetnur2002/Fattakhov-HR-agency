"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  queueErasureAction,
  type PdnState,
} from "@/app/(agency)/a/settings/pdn/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ERASURE_REASON_LABELS } from "@/lib/labels";
import type { ErasureQueueItem } from "@/lib/services/erasure";

function QueueButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Ставим…" : "Поставить в очередь"}
    </Button>
  );
}

/**
 * Срок в человеческом виде.
 *
 * Просрочка называется просрочкой, а не «-3 дня»: это нарушение
 * тридцатидневного срока из ст. 21 152-ФЗ, и выглядеть оно должно
 * тревожно, а не как отрицательное число в таблице.
 */
function deadlineLabel(daysLeft: number | null): {
  text: string;
  overdue: boolean;
} {
  if (daysLeft === null) return { text: "срок не назначен", overdue: true };
  if (daysLeft < 0) {
    return { text: `просрочено на ${Math.abs(daysLeft)} дн.`, overdue: true };
  }
  if (daysLeft === 0) return { text: "последний день", overdue: true };
  return { text: `осталось ${daysLeft} дн.`, overdue: daysLeft <= 3 };
}

/**
 * Очередь уничтожения персональных данных.
 *
 * Показывает не «кого можно удалить», а «что мы обязаны сделать и когда».
 * Разница существенная: прежний список ждал, пока человек решит, и данные
 * могли лежать сколько угодно. Здесь у каждой строки есть срок, а задача
 * исполнит уничтожение сама, когда он наступит.
 */
export function ErasureQueue({ items }: { items: ErasureQueueItem[] }) {
  const [state, formAction] = useActionState<PdnState, FormData>(
    queueErasureAction,
    {},
  );

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Очередь пуста: данных, обработку которых мы обязаны прекратить, нет.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}

      {items.map((item) => {
        const deadline = deadlineLabel(item.daysLeft);

        return (
          <div
            key={item.id}
            className="space-y-2 border-b pb-4 last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.fullName}</span>

              <Badge
                variant={deadline.overdue ? "destructive" : "secondary"}
                className="max-w-full"
              >
                <span className="truncate">{deadline.text}</span>
              </Badge>

              {item.reason && (
                <Badge variant="outline" className="max-w-full">
                  <span className="truncate">
                    {ERASURE_REASON_LABELS[item.reason]}
                  </span>
                </Badge>
              )}

              {item.state === "ERASURE_PENDING" && (
                <Badge variant="outline" className="max-w-full">
                  <span className="truncate">в очереди</span>
                </Badge>
              )}

              {item.activeApplications > 0 && (
                <Badge variant="secondary" className="max-w-full">
                  <span className="truncate">
                    в работе: {item.activeApplications}
                  </span>
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Обработка прекращена: кандидата нельзя двигать по воронке,
              вносить оффер и представлять клиенту.
              {item.state === "BLOCKED_FOR_ERASURE" &&
                " Данные будут уничтожены по наступлении срока, даже если не поставить в очередь вручную."}
              {/* Единственное основание, которое снимается само: продление
                  согласия (liftExpiredConsentBlock). Отзыв так не отменить */}
              {item.state === "BLOCKED_FOR_ERASURE" &&
                item.reason === "CONSENT_EXPIRED" &&
                " Если кандидат ещё нужен — попросите его продлить согласие: продление снимает блокировку."}
              {item.state === "BLOCKED_FOR_ERASURE" &&
                item.reason === "SOURCING_EXPIRED" &&
                " Если кандидат ещё нужен — получите его согласие по ссылке из карточки: согласие снимает блокировку."}
            </p>

            {item.state === "BLOCKED_FOR_ERASURE" && (
              <form action={formAction}>
                <input type="hidden" name="candidateId" value={item.id} />
                <QueueButton />
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
