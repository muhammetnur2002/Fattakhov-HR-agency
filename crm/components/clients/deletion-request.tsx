"use client";

import { useRef, useState, useTransition } from "react";

import { decideAccountDeletionAction } from "@/app/(agency)/a/clients/actions";
import { FormMessage } from "@/components/ui/form-message";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { Panel } from "@/components/ui/panel";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  function reject() {
    startTransition(async () => {
      setMessage(await decideAccountDeletionAction(userId, clientId, "reject"));
    });
  }

  async function confirmDeletion() {
    const result = await decideAccountDeletionAction(userId, clientId, "confirm");
    // Отказ покажет сам блок; здесь — только «готово»
    setMessage(result.error ? {} : result);
    return result;
  }

  return (
    <Panel tone="danger">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="warning">Просит удалить аккаунт</StatusBadge>
        {!canDecide && <span className="text-xs text-muted-foreground">Решает владелец агентства</span>}
      </div>
      {canDecide && !confirming && (
        <div className="flex flex-wrap gap-2">
          <Button ref={triggerRef} type="button" size="sm" variant="destructive" onClick={() => setConfirming(true)}>
            Подтвердить удаление
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={reject}>
            Отклонить
          </Button>
        </div>
      )}
      {canDecide && (
        <ConfirmBlock
          open={confirming}
          onOpenChange={setConfirming}
          triggerRef={triggerRef}
          question="Удалить аккаунт? Имя, почта и пароль будут стёрты, вход закроется. Это нельзя отменить."
          confirmLabel="Да, удалить"
          pendingLabel="Подождите…"
          cancelLabel="Назад"
          onConfirm={confirmDeletion}
        />
      )}
      <FormMessage error={message.error} ok={message.ok} />
    </Panel>
  );
}
