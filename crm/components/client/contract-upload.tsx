"use client";

import { startTransition, useActionState } from "react";

import { uploadSignedContractAction, type ContractUploadState } from "@/app/(client)/documents/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить на проверку"}
    </Button>
  );
}

/** Загрузка подписанного договора: скан (PDF) или фото страниц. */
export function ContractUpload() {
  const [state, action, pending] = useActionState<ContractUploadState, FormData>(uploadSignedContractAction, {});

  // Отправляем вручную: после action формы React 19 очищает поля, и при ошибке выбранный файл терялся бы
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="signedContract">Подписанный договор</Label>
        <Input
          id="signedContract"
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          onChange={(event) => {
            // Больше 4 МБ хостинг не примет — говорим сразу, а не после неудачной отправки
            const big = (event.target.files?.[0]?.size ?? 0) > 4 * 1024 * 1024;
            event.target.setCustomValidity(big ? "Файл больше 4 МБ — сожмите скан или сделайте фото поменьше" : "");
            event.target.reportValidity();
          }}
        />
        <p className="text-xs text-muted-foreground">Скан в PDF или фото (JPG, PNG) до 4 МБ.</p>
      </div>
      <Submit pending={pending} />
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
