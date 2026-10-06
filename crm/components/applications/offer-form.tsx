"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  recordOfferAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Условия оффера.
 *
 * Без суммы кандидата нельзя перевести в «Вышел на работу»: вознаграждение по
 * договору считается от неё (BR-31). Раньше поле существовало только
 * в базе — заполнить его было негде, и ни один живой найм не попадал
 * в список к выставлению счёта.
 */
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить оффер"}
    </Button>
  );
}

export function OfferForm({
  applicationId,
  salary,
  position,
  startDate,
}: {
  applicationId: string;
  salary: number | null;
  position: string | null;
  /** YYYY-MM-DD или null */
  startDate: string | null;
}) {
  const [state, formAction] = useActionState<CandidateState, FormData>(
    recordOfferAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="offer-salary">Сумма оффера, ₽ в месяц</Label>
          <Input
            id="offer-salary"
            name="salary"
            type="number"
            inputMode="numeric"
            min={1}
            step={1000}
            defaultValue={salary ?? ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-position">Должность в оффере</Label>
          <Input
            id="offer-position"
            name="position"
            defaultValue={position ?? ""}
            placeholder="если отличается от вакансии"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="offer-start">Дата выхода</Label>
          <Input
            id="offer-start"
            name="startDate"
            type="date"
            defaultValue={startDate ?? ""}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        От суммы считается вознаграждение по договору, от даты выхода —
        гарантийный срок. Без даты гарантия начнётся в момент найма.
      </p>

      <SaveButton />

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
    </form>
  );
}
