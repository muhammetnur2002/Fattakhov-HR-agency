"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { uploadSignedContractAction, type ContractUploadState } from "@/app/(client)/documents/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить на проверку"}
    </Button>
  );
}

/** Загрузка подписанного договора: скан (PDF) или фото страниц. */
export function ContractUpload() {
  const [state, action] = useActionState<ContractUploadState, FormData>(uploadSignedContractAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="signedContract">Подписанный договор</Label>
        <Input
          id="signedContract"
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        />
        <p className="text-xs text-muted-foreground">Скан в PDF или фото (JPG, PNG) до 20 МБ.</p>
      </div>
      <Submit />
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
