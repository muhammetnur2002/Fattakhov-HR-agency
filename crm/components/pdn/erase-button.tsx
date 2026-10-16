"use client";

import { useActionState } from "react";

import {
  erasePersonalDataAction,
  type PdnState,
} from "@/app/(agency)/a/settings/pdn/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { panelClass } from "@/components/ui/panel";

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

  if (state.ok) {
    return <FormMessage ok={state.ok} />;
  }

  // «Удалить данные» заменяется формой подтверждения: фокус — в поле для слова, после «Отмены» — обратно на кнопку.
  // Вопрос — абзац ниже, он длинный; форме для читалки нужно короткое название
  return (
    <ConfirmBlock
      trigger={
        <Button type="button" size="sm" variant="outline">
          Удалить данные
        </Button>
      }
      formProps={{ action: formAction }}
      className={panelClass("plain", "space-y-4")}
      questionHidden
      question={`Удалить данные кандидата ${candidateName}`}
      confirmLabel="Удалить безвозвратно"
      pendingLabel="Удаляем…"
      error={state.error}
    >
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
          id={`confirm-${candidateId}`}
          name="confirm"
          autoComplete="off"
          required
        />
      </div>
    </ConfirmBlock>
  );
}
