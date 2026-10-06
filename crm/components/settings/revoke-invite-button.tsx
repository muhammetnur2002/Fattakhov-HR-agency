"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export type RevokeInviteState = { error?: string };

function Submit() {
  const status = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={status.pending}>
      {status.pending ? "Отзываем…" : "Отозвать"}
    </Button>
  );
}

/**
 * «Отозвать» у неотвеченного приглашения — одна кнопка на три экрана.
 *
 * Серверное действие приходит снаружи, как у InviteForm: экранов три —
 * сотрудники агентства, пользователи клиента глазами агентства и своя
 * команда в кабинете клиента, — и право за каждым стоит своё, а значит
 * и проверка разная. Разметка при этом одна и та же, и повторять её
 * трижды незачем.
 *
 * Форма и состояние у каждой кнопки свои: ошибка относится к конкретному
 * приглашению и показывается в его строке, а не общим сообщением наверху,
 * где непонятно, к какому из них она.
 */
export function RevokeInviteButton({
  action,
  id,
  clientId,
}: {
  action: (
    prev: RevokeInviteState,
    formData: FormData,
  ) => Promise<RevokeInviteState>;
  id: string;
  /**
   * Компания приглашённого. Нужна агентскому действию: право
   * проверяется на неё, и её же страницу надо обновить после отзыва.
   * В кабинете клиента компания берётся из актора — подставлять её
   * из формы там нельзя (см. app/(client)/settings/actions.ts).
   */
  clientId?: string;
}) {
  const [state, formAction] = useActionState<RevokeInviteState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      {clientId && <input type="hidden" name="clientId" value={clientId} />}
      <Submit />
      {state.error && (
        <p className="max-w-64 text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}
