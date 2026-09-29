"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { uploadContractTemplateAction, type FormState } from "@/app/(agency)/a/clients/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Загружаем…" : "Загрузить шаблон"}
    </Button>
  );
}

/** Загрузка нового шаблона договора для клиентов без договора. */
export function ContractTemplateUpload() {
  const [state, action] = useActionState<FormState, FormData>(uploadContractTemplateAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="contractTemplate">Файл шаблона</Label>
        <Input id="contractTemplate" name="file" type="file" required accept=".pdf,.doc,.docx,.rtf,.odt" />
        <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, RTF или ODT до 20 МБ.</p>
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
