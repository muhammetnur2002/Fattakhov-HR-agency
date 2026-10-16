"use client";

import { FileText, Trash2 } from "lucide-react";
import { startTransition as startUpload, useActionState, useState } from "react";

import {
  deleteContractTemplateAction,
  uploadContractTemplateAction,
  type FormState,
} from "@/app/(agency)/a/clients/actions";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { ConfirmBlock } from "@/components/ui/confirm-block";
import { SubmitButton } from "@/components/ui/submit-button";
import { FileInput } from "@/components/ui/file-input";
import { Label } from "@/components/ui/label";

function Submit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <SubmitButton size="sm" loading={pending} pendingLabel="Загружаем…">
      {label}
    </SubmitButton>
  );
}

/**
 * Шаблон договора для клиентов без договора: текущий файл, замена новым и удаление.
 * Клиенты скачивают его в «Документах», подписывают и присылают скан или фото.
 */
export function ContractTemplateManager({
  current,
}: {
  current: { fileName: string; uploadedAt: string; url: string } | null;
}) {
  const [uploadState, upload, uploading] = useActionState<FormState, FormData>(uploadContractTemplateAction, {});
  const [deleteState, setDeleteState] = useState<FormState>({});

  async function remove() {
    const result = await deleteContractTemplateAction();
    setDeleteState(result.error ? {} : result);
    return result;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Сейчас у клиентов</p>
        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={current.url} target="_blank" rel="noopener noreferrer">
                <FileText className="size-4" aria-hidden />
                {current.fileName}
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">загружен {current.uploadedAt}</span>
            <ConfirmBlock
              trigger={
                <Button type="button" size="sm" variant="ghost">
                  <Trash2 className="mr-1 size-4" aria-hidden />
                  Удалить
                </Button>
              }
              layout="inline"
              question="Удалить шаблон?"
              confirmLabel="Да, удалить"
              pendingLabel="Удаляем…"
              cancelLabel="Оставить"
              onConfirm={remove}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Шаблона нет — клиенты видят подсказку написать менеджеру. Загрузите файл ниже.
          </p>
        )}
        <FormMessage ok={current ? null : deleteState.ok} />
      </div>

      {/* `action` — ради отправки без скриптов (POST серверному действию, не GET); после загрузки
          скриптов отправка идёт через onSubmit, чтобы выбранный файл не стирался при отказе */}
      <form
        action={upload}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startUpload(() => upload(data));
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="contractTemplate">{current ? "Заменить новым файлом" : "Загрузить шаблон"}</Label>
          <FileInput
            id="contractTemplate"
            name="file"
            required
            accept=".pdf,.doc,.docx,.rtf,.odt"
            onChange={(event) => {
              const big = (event.target.files?.[0]?.size ?? 0) > 4 * 1024 * 1024;
              event.target.setCustomValidity(big ? "Файл больше 4 МБ — сожмите его" : "");
              event.target.ariaInvalid = big ? "true" : null;
              event.target.reportValidity();
            }}
          />
          <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, RTF или ODT до 4 МБ.</p>
        </div>
        <Submit label={current ? "Заменить шаблон" : "Загрузить шаблон"} pending={uploading} />
        <FormMessage error={uploadState.error} ok={uploadState.ok} />
      </form>
    </div>
  );
}
