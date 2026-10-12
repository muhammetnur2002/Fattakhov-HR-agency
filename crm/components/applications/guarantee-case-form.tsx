"use client";

import {
  recordGuaranteeCaseAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/lib/hooks/use-form-action";
import { GUARANTEE_BREAK_REASON_LABELS } from "@/lib/labels";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";

/**
 * Гарантийный случай: нанятый ушёл в гарантийный срок.
 *
 * Обычный <select>, а не выпадающий список дизайн-системы: поле одно,
 * значений четыре, а родной элемент работает с клавиатуры и на телефоне
 * без единой строки кода.
 */
function SaveButton({ loading }: { loading: boolean }) {
  return (
    <SubmitButtonBase size="sm" variant="outline" loading={loading} pendingLabel="Записываем…">
      Записать гарантийный случай
    </SubmitButtonBase>
  );
}

export function GuaranteeCaseForm({
  applicationId,
  guaranteeUntil,
}: {
  applicationId: string;
  /** YYYY-MM-DD — верхняя граница даты ухода в поле */
  guaranteeUntil: string;
}) {
  const { state, fields, pending, formProps } = useFormAction<CandidateState>(recordGuaranteeCaseAction, {});

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Когда ушёл" error={fields.leftAt}>
          <Input
            id="gc-left"
            name="leftAt"
            type="date"
            max={guaranteeUntil}
            required
          />
        </Field>
        <Field label="Причина" id="gc-reason" error={fields.reason}>
          {(control) => (
            <select
              {...control}
              name="reason"
              required
              defaultValue=""
              className="h-8 w-full rounded-lg border border-field bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:not-focus-visible:ring-3 aria-invalid:not-focus-visible:ring-destructive/20 touch:text-base dark:bg-input/30"
            >
              <option value="" disabled>
                Выберите
              </option>
              {Object.entries(GUARANTEE_BREAK_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label="Что известно" error={fields.comment}>
        <Textarea
          id="gc-comment"
          name="comment"
          rows={2}
          placeholder="Со слов клиента: что случилось и когда он узнал"
        />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="reopenVacancy"
          defaultChecked
          className="mt-0.5 size-4"
        />
        <span>
          Вернуть вакансию в работу, чтобы искать замену
          <span className="block text-xs text-muted-foreground">
            Замена по гарантии бесплатна: следующий найм по этой вакансии
            будет отмечен как замена и в счёт не попадёт.
          </span>
        </span>
      </label>

      <SaveButton loading={pending} />

      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
