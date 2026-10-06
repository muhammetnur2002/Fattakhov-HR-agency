"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  checkAlertsAction,
  type AlertCheckState,
} from "@/app/(agency)/a/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ChannelResult } from "@/lib/monitoring/alert-check";

/**
 * Проверка канала оповещений о сбоях.
 *
 * Три состояния показываются по-разному намеренно: «не настроен» —
 * не поломка, а незаполненная настройка, и пугать им незачем; «не принято»
 * — именно то, ради чего кнопка существует, и выглядеть должно тревожно.
 */
const STATE_LABELS = {
  sent: { text: "доставлено", tone: "text-foreground" },
  failed: { text: "не доставлено", tone: "text-destructive" },
  "not-configured": { text: "канал не настроен", tone: "text-muted-foreground" },
} as const;

function CheckButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить проверочное сообщение"}
    </Button>
  );
}

function Channel({ name, result }: { name: string; result: ChannelResult }) {
  const label = STATE_LABELS[result.state];
  return (
    <div className="text-sm">
      <span className="font-medium">{name}: </span>
      <span className={label.tone}>{label.text}</span>
      <div className="text-xs text-muted-foreground">{result.detail}</div>
    </div>
  );
}

export function AlertCheck() {
  const [state, formAction] = useActionState<AlertCheckState, FormData>(
    checkAlertsAction,
    {},
  );

  return (
    <div className="space-y-4">
      <form action={formAction}>
        <CheckButton />
      </form>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state.result && (
        <div className="space-y-3 border-t pt-4">
          <Channel name="Письмо на ящик сбоев" result={state.result.email} />
          <Channel name="ВКонтакте" result={state.result.vk} />
          <Channel name="Уведомления на устройства" result={state.result.push} />
        </div>
      )}
    </div>
  );
}
