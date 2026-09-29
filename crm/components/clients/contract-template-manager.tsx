"use client";

import { FileText, Trash2 } from "lucide-react";
import { startTransition as startUpload, useActionState, useState, useTransition } from "react";

import {
  deleteContractTemplateAction,
  uploadContractTemplateAction,
  type FormState,
} from "@/app/(agency)/a/clients/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit({ label, pending }: { label: string; pending: boolean }) {
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Загружаем…" : label}
    </Button>
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
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      setDeleteState(await deleteContractTemplateAction());
      setConfirming(false);
    });
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
            {confirming ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Удалить шаблон?</span>
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>
                  {pending ? "Удаляем…" : "Да, удалить"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                  Оставить
                </Button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                <Trash2 className="mr-1 size-4" aria-hidden />
                Удалить
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Шаблона нет — клиенты видят подсказку написать менеджеру. Загрузите файл ниже.
          </p>
        )}
        {deleteState.error && (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        )}
        {deleteState.ok && !current && (
          <Alert>
            <AlertDescription>{deleteState.ok}</AlertDescription>
          </Alert>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startUpload(() => upload(data));
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label htmlFor="contractTemplate">{current ? "Заменить новым файлом" : "Загрузить шаблон"}</Label>
          <Input
            id="contractTemplate"
            name="file"
            type="file"
            required
            accept=".pdf,.doc,.docx,.rtf,.odt"
            onChange={(event) => {
              const big = (event.target.files?.[0]?.size ?? 0) > 4 * 1024 * 1024;
              event.target.setCustomValidity(big ? "Файл больше 4 МБ — сожмите его" : "");
              event.target.reportValidity();
            }}
          />
          <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, RTF или ODT до 4 МБ.</p>
        </div>
        <Submit label={current ? "Заменить шаблон" : "Загрузить шаблон"} pending={uploading} />
        {uploadState.error && (
          <Alert variant="destructive">
            <AlertDescription>{uploadState.error}</AlertDescription>
          </Alert>
        )}
        {uploadState.ok && (
          <Alert>
            <AlertDescription>{uploadState.ok}</AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  );
}
