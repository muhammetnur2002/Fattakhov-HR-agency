"use client";

import { useActionState } from "react";

import { revokeAllSessionsAction, type SessionsState } from "@/app/actions/sessions";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * «Завершить все сессии» — на случай, если кажется, что сессию украли
 * (вредоносная программа на компьютере, чужой доступ). Пароль не меняется,
 * но входить заново придётся на всех устройствах, включая это.
 */
export function SessionsCard() {
  const [state, action] = useActionState<SessionsState>(revokeAllSessionsAction, {});

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Если подозреваете, что кто-то получил доступ к вашей учётной записи (например, на компьютере
        нашли вредоносную программу), завершите все сессии. Вы выйдете на всех устройствах, в том
        числе на этом, и войдёте заново. Пароль не изменится. Если подозрение серьёзное, после этого
        ещё и смените пароль.
      </p>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Завершаем…" variant="outline">
        Завершить все сессии
      </SubmitButton>
    </form>
  );
}
