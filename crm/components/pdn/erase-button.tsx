"use client";

import { useActionState, useState } from "react";

import {
  erasePersonalDataAction,
  type PdnState,
} from "@/app/(agency)/a/settings/pdn/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { panelClass } from "@/components/ui/panel";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";

function Submit() {
  return (
    <SubmitButtonBase size="sm" variant="destructive" pendingLabel="Удаляем…">
      Удалить безвозвратно
    </SubmitButtonBase>
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
  // «Удалить данные» заменяется формой подтверждения: фокус — в поле для слова, после «Отмены» — обратно на кнопку
  const { triggerRef, focusRef, questionId } = useConfirmFocus<HTMLButtonElement, HTMLInputElement>(open);

  if (state.ok) {
    return <FormMessage ok={state.ok} />;
  }

  if (!open) {
    return (
      <Button
        ref={triggerRef}
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
    <form action={formAction} aria-labelledby={questionId} className={panelClass("plain", "space-y-4")}>
      {/* Вопрос — абзац ниже, он длинный; форме для читалки нужно короткое название */}
      <span id={questionId} className="sr-only">
        Удалить данные кандидата {candidateName}
      </span>
      <input type="hidden" name="candidateId" value={candidateId} />

      <p className="text-sm">
        Будут стёрты контакты, профиль и резюме кандидата{" "}
        <span className="font-medium">{candidateName}</span>. Участие
        в воронках останется обезличенным — иначе статистика по вакансиям
        перестанет сходиться.
      </p>

      {activeApplications > 0 && (
        <Alert variant="warning">
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
          ref={focusRef}
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

      <FormMessage error={state.error} />
    </form>
  );
}
