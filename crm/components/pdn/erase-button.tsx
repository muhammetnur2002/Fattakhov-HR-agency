"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  erasePersonalDataAction,
  type PdnState,
} from "@/app/(agency)/a/settings/pdn/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="destructive" disabled={pending}>
      {pending ? "Удаляем…" : "Удалить безвозвратно"}
    </Button>
  );
}

/**
 * Удаление персональных данных кандидата.
 *
 * Требует вписать слово: действие необратимое, и подтверждения одним
 * кликом здесь мало. Резюме стирается из хранилища, контакты и профиль
 * обнуляются, заявка остаётся обезличенной ради статистики.
 */
export function EraseButton({
  candidateId,
  candidateName,
  activeApplications,
}: {
  candidateId: string;
  candidateName: string;
  activeApplications: number;
}) {
  const [state, formAction] = useActionState<PdnState, FormData>(
    erasePersonalDataAction,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return <p className="text-sm text-muted-foreground">{state.ok}</p>;
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Удалить данные
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border p-3">
      <input type="hidden" name="candidateId" value={candidateId} />

      <p className="text-sm">
        Будут стёрты контакты, профиль и резюме кандидата{" "}
        <span className="font-medium">{candidateName}</span>. Участие
        в воронках останется обезличенным — иначе статистика по вакансиям
        перестанет сходиться.
      </p>

      {activeApplications > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Кандидат сейчас участвует в {activeApplications} активных
            воронках. Возможно, стоит продлить согласие, а не удалять
            данные посреди подбора.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor={`confirm-${candidateId}`}>
          Впишите «удалить» для подтверждения
        </Label>
        <Input
          id={`confirm-${candidateId}`}
          name="confirm"
          autoComplete="off"
          required
        />
      </div>

      <div className="flex gap-2">
        <Submit />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Отмена
        </Button>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
