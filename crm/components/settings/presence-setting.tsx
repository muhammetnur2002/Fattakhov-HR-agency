"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { savePresenceAction } from "@/app/actions/profile";
import type { ProfileState } from "@/app/actions/profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить"}
    </Button>
  );
}

/**
 * «Показывать, что я в сети» — галочка владельца агентства (остальным её не
 * показывают, см. PresenceCard): скрыть статус может только он.
 *
 * Выключая, владелец скрывается целиком: ни «В сети», ни «был(а) вчера»
 * у него не видно, а мы не запоминаем, когда он заходил. Показывать
 * статус других при этом он продолжает.
 */
export function PresenceSetting({ showPresence }: { showPresence: boolean }) {
  const [state, formAction] = useActionState<ProfileState, FormData>(savePresenceAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="showPresence"
          defaultChecked={showPresence}
          className="mt-1 size-4"
        />
        <span>
          <span className="text-sm font-medium">Показывать, что я в сети</span>
          <span className="block text-xs text-muted-foreground">
            Те, кому вы можете писать в «Сообщениях», видят «В сети» или «был(а) вчера в 21:40».
            Если выключить, вас не будет видно в сети, а время ваших заходов мы не сохраняем.
          </span>
        </span>
      </label>

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

      <Submit />
    </form>
  );
}
