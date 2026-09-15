"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  clientTransitionAction,
  type VacancyActionState,
} from "@/app/actions/vacancies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function ClientVacancyActions({
  vacancyId,
  status,
  canHold,
  canClose,
}: {
  vacancyId: string;
  status: VacancyStatus;
  canHold: boolean;
  canClose: boolean;
}) {
  const [state, formAction] = useActionState<VacancyActionState, FormData>(
    clientTransitionAction,
    {},
  );
  const [cancelling, setCancelling] = useState(false);

  const showHold = canHold && status === "ACTIVE";
  const showResume = canHold && status === "ON_HOLD";
  const showCancel =
    canClose && ["SUBMITTED", "CLARIFYING", "ESTIMATED", "ACTIVE", "ON_HOLD"].includes(status);

  if (!showHold && !showResume && !showCancel) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {showHold && (
          <form action={formAction}>
            <input type="hidden" name="vacancyId" value={vacancyId} />
            <input type="hidden" name="to" value="ON_HOLD" />
            <Submit label="Приостановить" />
          </form>
        )}

        {showResume && (
          <form action={formAction}>
            <input type="hidden" name="vacancyId" value={vacancyId} />
            <input type="hidden" name="to" value="ACTIVE" />
            <Submit label="Возобновить" />
          </form>
        )}

        {showCancel && !cancelling && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCancelling(true)}
          >
            Отменить заявку
          </Button>
        )}
      </div>

      {/* Причина обязательна: без неё в аналитике останется дыра,
          а рекрутер не поймёт, что пошло не так */}
      {cancelling && (
        <form action={formAction} className="space-y-2 rounded-md border p-3">
          <input type="hidden" name="vacancyId" value={vacancyId} />
          <input type="hidden" name="to" value="CLOSED_CANCELLED" />
          <Label htmlFor="closeReason">Почему отменяете?</Label>
          <Input
            id="closeReason"
            name="closeReason"
            required
            placeholder="Закрыли внутренним переводом"
          />
          <div className="flex gap-2">
            <Submit label="Отменить заявку" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCancelling(false)}
            >
              Не отменять
            </Button>
          </div>
        </form>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
