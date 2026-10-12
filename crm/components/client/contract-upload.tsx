"use client";

import { startTransition, useActionState } from "react";

import { uploadSignedContractAction, type ContractUploadState } from "@/app/(client)/documents/actions";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";

function Submit({ pending }: { pending: boolean }) {
  return (
    <SubmitButton size="sm" loading={pending} pendingLabel="Отправляем…">
      Отправить на проверку
    </SubmitButton>
  );
}

/** Загрузка подписанного договора: скан (PDF) или фото страниц. */
export function ContractUpload() {
  const [state, action, pending] = useActionState<ContractUploadState, FormData>(uploadSignedContractAction, {});

  // Отправляем вручную: после action формы React 19 очищает поля, и при ошибке выбранный файл терялся бы.
  // `action` у формы остаётся ради отправки без скриптов: серверное действие примет её как обычный POST,
  // а не как GET с именем файла в адресе (после загрузки скриптов `preventDefault` ниже его не вызывает)
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signedContract">Подписанный договор</Label>
        <FileInput
          id="signedContract"
          name="file"
          required
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          onChange={(event) => {
            // Больше 4 МБ хостинг не примет — говорим сразу, а не после неудачной отправки
            const big = (event.target.files?.[0]?.size ?? 0) > 4 * 1024 * 1024;
            event.target.setCustomValidity(big ? "Файл больше 4 МБ — сожмите скан или сделайте фото поменьше" : "");
            event.target.ariaInvalid = big ? "true" : null;
            event.target.reportValidity();
          }}
        />
        <p className="text-xs text-muted-foreground">Скан в PDF или фото (JPG, PNG) до 4 МБ.</p>
      </div>
      <Submit pending={pending} />
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
