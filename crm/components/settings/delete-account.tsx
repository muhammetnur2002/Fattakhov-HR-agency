"use client";

import { useState, useTransition } from "react";

import { cancelDeletionRequestAction, deleteAccountAction } from "@/app/(client)/settings/actions";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";

/**
 * Удаление своего аккаунта клиентом.
 * Без договора — сразу и насовсем; с договором — запрос владельцу агентства,
 * пока он не подтвердит, аккаунт работает.
 */
export function DeleteAccount({ contracted, requested }: { contracted: boolean; requested: boolean }) {
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, startTransition] = useTransition();

  if (requested) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Запрос на удаление отправлен владельцу агентства. Пока он не подтвердит, аккаунт работает как обычно.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMessage(await cancelDeletionRequestAction());
            })
          }
        >
          Отозвать запрос
        </Button>
        <FormMessage error={message.error} />
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

      <ConfirmBlock
        trigger={
          <Button type="button" size="sm" variant="outline">
            {contracted ? "Запросить удаление аккаунта" : "Удалить аккаунт"}
          </Button>
        }
        question={contracted ? "Отправить запрос на удаление аккаунта?" : "Удалить аккаунт? Это нельзя отменить."}
        questionClassName="font-medium"
        confirmLabel={contracted ? "Да, отправить запрос" : "Да, удалить аккаунт"}
        pendingLabel="Подождите…"
        onConfirm={async () => {
          const result = await deleteAccountAction();
          // Отказ показывает сам блок; здесь — только «готово»
          setMessage(result.error ? {} : result);
          return result;
        }}
      />

      <FormMessage ok={message.ok} />
    </div>
  );
}
