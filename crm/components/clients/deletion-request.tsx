"use client";

import { useState, useTransition } from "react";

import { decideAccountDeletionAction } from "@/app/(agency)/a/clients/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Клиент с договором просит удалить свой аккаунт. Владелец агентства подтверждает
 * (аккаунт обезличивается) или отклоняет (клиент получает уведомление); остальным
 * сотрудникам агентства запрос виден, но решить они не могут.
 */
export function DeletionRequest({
  userId,
  clientId,
  canDecide,
}: {
  userId: string;
  clientId: string;
  canDecide: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  function decide(decision: "confirm" | "reject") {
    startTransition(async () => {
      setMessage(await decideAccountDeletionAction(userId, clientId, decision));
      setConfirming(false);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Просит удалить аккаунт</Badge>
        {!canDecide && <span className="text-xs text-muted-foreground">Решает владелец агентства</span>}
      </div>
      {canDecide &&
        (confirming ? (
          <div className="space-y-2">
            <p className="text-sm">Удалить аккаунт? Имя, почта и пароль будут стёрты, вход закроется. Это нельзя отменить.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => decide("confirm")}>
                {pending ? "Подождите…" : "Да, удалить"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Назад
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" onClick={() => setConfirming(true)}>
              Подтвердить удаление
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => decide("reject")}>
              Отклонить
            </Button>
          </div>
        ))}
      {message.error && (
        <Alert variant="destructive">
          <AlertDescription>{message.error}</AlertDescription>
        </Alert>
      )}
      {message.ok && (
        <Alert>
          <AlertDescription>{message.ok}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
