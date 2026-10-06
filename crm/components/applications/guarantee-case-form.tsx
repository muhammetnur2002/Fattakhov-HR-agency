"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  recordGuaranteeCaseAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GUARANTEE_BREAK_REASON_LABELS } from "@/lib/labels";

/**
 * Гарантийный случай: нанятый ушёл в гарантийный срок.
 *
 * Обычный <select>, а не выпадающий список дизайн-системы: поле одно,
 * значений четыре, а родной элемент работает с клавиатуры и на телефоне
 * без единой строки кода.
 */
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Записываем…" : "Записать гарантийный случай"}
    </Button>
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
  const [state, formAction] = useActionState<CandidateState, FormData>(
    recordGuaranteeCaseAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gc-left">Когда ушёл</Label>
          <Input
            id="gc-left"
            name="leftAt"
            type="date"
            max={guaranteeUntil}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gc-reason">Причина</Label>
          <select
            id="gc-reason"
            name="reason"
            required
            defaultValue=""
            className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
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
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gc-comment">Что известно</Label>
        <Textarea
          id="gc-comment"
          name="comment"
          rows={2}
          placeholder="Со слов клиента: что случилось и когда он узнал"
        />
      </div>

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
