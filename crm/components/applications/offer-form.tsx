"use client";

import {
  recordOfferAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/hooks/use-form-action";

/**
 * Условия оффера.
 *
 * Без суммы кандидата нельзя перевести в «Вышел на работу»: вознаграждение по
 * договору считается от неё (BR-31). Раньше поле существовало только
 * в базе — заполнить его было негде, и ни один живой найм не попадал
 * в список к выставлению счёта.
 *
 * Отправка — через `useFormAction`: «сумма должна быть больше нуля» не стирает
 * должность и дату, а красный текст стоит у самой суммы.
 */
function SaveButton({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase size="sm" loading={loading} pendingLabel="Сохраняем…">
      Сохранить оффер
    </SubmitButtonBase>
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
  const { state, fields, pending, formProps } = useFormAction<CandidateState>(recordOfferAction, {});

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Сумма оффера, ₽ в месяц" error={fields.salary}>
          <Input
            id="offer-salary"
            name="salary"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={salary ?? ""}
            required
          />
        </Field>
        <Field label="Должность в оффере" error={fields.position}>
          <Input
            id="offer-position"
            name="position"
            defaultValue={position ?? ""}
            placeholder="если отличается от вакансии"
          />
        </Field>
        <Field label="Дата выхода" error={fields.startDate}>
          <Input
            id="offer-start"
            name="startDate"
            type="date"
            defaultValue={startDate ?? ""}
          />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">
        От суммы считается вознаграждение по договору, от даты выхода —
        гарантийный срок. Без даты гарантия начнётся в момент найма.
      </p>

      <SaveButton loading={pending} />

      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
