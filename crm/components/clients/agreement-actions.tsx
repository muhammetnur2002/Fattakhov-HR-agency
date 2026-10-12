"use client";

import { FileText } from "lucide-react";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  attachAgreementFileAction,
  confirmAgreementAction,
  terminateAgreementAction,
  type FormState,
} from "@/app/(agency)/a/clients/actions";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { SubmitButton as SubmitButtonBase } from "@/components/ui/submit-button";
import { oversizeMessage } from "@/lib/upload-limits";

function Submit({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline";
}) {
  return (
    <SubmitButtonBase size="sm" variant={variant} pendingLabel={pendingLabel}>
      {label}
    </SubmitButtonBase>
  );
}

/** Подтверждение условий, выбранных клиентом в онбординге (сценарий A, шаг 4). */
export function ConfirmAgreementButton({
  agreementId,
  clientId,
}: {
  agreementId: string;
  clientId: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    confirmAgreementAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Submit label="Подтвердить условия" pendingLabel="Подтверждаем…" />
      <FormMessage error={state.error} />
    </form>
  );
}

export function TerminateAgreementButton({
  agreementId,
  clientId,
}: {
  agreementId: string;
  clientId: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    terminateAgreementAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="clientId" value={clientId} />
      <Submit
        label="Расторгнуть"
        pendingLabel="Расторгаем…"
        variant="outline"
      />
      <FormMessage error={state.error} />
    </form>
  );
}

/** Сам input: useFormStatus видит статус только формы-родителя. */
function FileInput({ formRef }: { formRef: React.RefObject<HTMLFormElement | null> }) {
  const { pending } = useFormStatus();
  return (
    <input
      type="file"
      name="file"
      accept=".pdf,.doc,.docx,.rtf,.odt,image/jpeg,image/png"
      disabled={pending}
      onChange={(event) => {
        // Больше предела запрос не дойдёт до сервера — говорим сразу, а не страницей с ошибкой
        const message = oversizeMessage(event.target.files?.[0]);
        event.target.setCustomValidity(message);
        if (message) event.target.reportValidity();
        else formRef.current?.requestSubmit();
      }}
      className="text-xs file:mr-2 file:rounded-md file:border file:border-field file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium"
    />
  );
}

/** Загрузка скана подписанного договора — клиент увидит ссылку в «Документах». */
export function AgreementFileUpload({
  agreementId,
  clientId,
  fileUrl,
}: {
  agreementId: string;
  clientId: string;
  fileUrl: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    attachAgreementFileAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-3">
      {fileUrl && (
        <Button asChild variant="outline" size="sm">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <FileText className="size-4" />
            Скачать скан
          </a>
        </Button>
      )}
      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="agreementId" value={agreementId} />
        <input type="hidden" name="clientId" value={clientId} />
        <span className="text-xs text-muted-foreground">
          {fileUrl ? "Заменить скан" : "Прикрепить скан подписанного договора"}
        </span>
        <FileInput formRef={formRef} />
        <FormMessage compact error={state.error} ok={state.ok} />
      </form>
    </div>
  );
}
