"use client";

import { useState, useTransition } from "react";

import { cancelDeletionRequestAction, deleteAccountAction } from "@/app/(client)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Удаление своего аккаунта клиентом.
 * Без договора — сразу и насовсем; с договором — запрос владельцу агентства,
 * пока он не подтвердит, аккаунт работает.
 */
export function DeleteAccount({ contracted, requested }: { contracted: boolean; requested: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; ok?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      setConfirming(false);
    });
  }

  if (requested) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Запрос на удаление отправлен владельцу агентства. Пока он не подтвердит, аккаунт работает как обычно.
        </p>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(cancelDeletionRequestAction)}>
          Отозвать запрос
        </Button>
        {message.error && (
          <Alert variant="destructive">
            <AlertDescription>{message.error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {contracted
          ? "У вашей компании заключён договор, поэтому удаление подтверждает владелец агентства: вы отправляете запрос, а аккаунт остаётся, пока он не ответит."
          : "Аккаунт удалится сразу и насовсем: имя, почта, телефон и пароль будут стёрты, войти будет нельзя. Если вы последний сотрудник компании, её вакансии на студенческой платформе будут сняты."}
      </p>

      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {contracted ? "Отправить запрос на удаление аккаунта?" : "Удалить аккаунт? Это нельзя отменить."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => run(deleteAccountAction)}>
              {pending ? "Подождите…" : contracted ? "Да, отправить запрос" : "Да, удалить аккаунт"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
          {contracted ? "Запросить удаление аккаунта" : "Удалить аккаунт"}
        </Button>
      )}

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
