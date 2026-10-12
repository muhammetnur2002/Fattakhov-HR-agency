"use client";

import { FileText } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import {
  deleteCandidateFileAction,
  uploadCandidateFileAction,
  type ExtrasState,
} from "@/app/(agency)/a/candidates/extras-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { useConfirmFocus } from "@/lib/hooks/use-return-focus";
import { MAX_FILE_SIZE, oversizeMessage } from "@/lib/upload-limits";

export type CandidateFileRow = {
  id: string;
  kind: string;
  fileName: string;
  fileSize: number;
  visibility: "INTERNAL" | "SHARED";
  createdAt: string;
  /** Подписанная ссылка на скачивание, живёт 15 минут (BR-37). */
  url: string;
};

const KIND_LABELS: Record<string, string> = {
  RESUME: "Резюме",
  PORTFOLIO: "Портфолио",
  TEST_TASK: "Тестовое задание",
  OTHER: "Прочее",
  COVER_LETTER: "Сопроводительное",
};

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

/**
 * Файлы кандидата: загрузить, скачать, удалить.
 *
 * Вид файла (резюме, портфолио, тестовое, прочее) и «показывать клиенту».
 * По умолчанию файл внутренний. Исходное резюме клиенту не передаётся
 * никогда (слой доступа), поэтому для него галочка закрыта. Кандидату без
 * согласия файлы не сохраняются: вместо формы показывается причина.
 */
export function CandidateFilesCard({
  candidateId,
  files,
  blockedReason,
}: {
  candidateId: string;
  files: CandidateFileRow[];
  /** Если задана, загрузка закрыта и показывается это объяснение. */
  blockedReason?: string;
}) {
  const [state, setState] = useState<ExtrasState>({});
  const [kind, setKind] = useState("RESUME");
  const [tooBig, setTooBig] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Отправка обычным обработчиком, а не эффектом на результат: после успеха
  // форма очищается здесь же, без каскада перерисовок
  async function submit(formData: FormData) {
    const result = await uploadCandidateFileAction({}, formData);
    setState(result);
    if (result.ok) {
      formRef.current?.reset();
      setKind("RESUME");
      setTooBig("");
    }
  }

  return (
    <div className="space-y-4">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Файлов пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <FileItem key={file.id} file={file} />
          ))}
        </ul>
      )}

      {blockedReason ? (
        <Alert>
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      ) : (
        <form ref={formRef} action={submit} className="space-y-4 border-t pt-4">
          <input type="hidden" name="candidateId" value={candidateId} />
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Вид файла</span>
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="h-9 w-full rounded-lg border border-field bg-background px-2 text-sm"
              >
                <option value="RESUME">Резюме</option>
                <option value="PORTFOLIO">Портфолио</option>
                <option value="TEST_TASK">Тестовое задание</option>
                <option value="OTHER">Прочее</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Файл (до {MAX_FILE_SIZE / (1024 * 1024)} МБ)</span>
              <input
                type="file"
                name="file"
                required
                onChange={(e) => setTooBig(oversizeMessage(e.target.files?.[0]))}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-field file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
            </label>
          </div>
          <FormMessage compact error={tooBig} />

          <label
            className={`flex items-center gap-2 text-sm ${kind === "RESUME" ? "opacity-60" : ""}`}
          >
            <input type="checkbox" name="shareWithClient" disabled={kind === "RESUME"} className="size-4" />
            Показывать клиенту
          </label>
          <p className="text-xs text-muted-foreground">
            {kind === "RESUME"
              ? "Исходное резюме клиенту не передаётся: в нём домашний адрес, дата рождения и другое лишнее."
              : "Без галочки файл виден только сотрудникам агентства. С галочкой его увидят компании, которым представлен кандидат."}
          </p>

          <FormMessage error={state.error} ok={state.ok} />

          <SubmitButton size="sm" disabled={Boolean(tooBig)} pendingLabel="Загружаем…">
            Загрузить
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

function FileItem({ file }: { file: CandidateFileRow }) {
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, focusRef } = useConfirmFocus(confirming);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    setError(null);
    start(async () => {
      const result = await deleteCandidateFileAction(file.id);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium underline-offset-2 hover:underline"
          >
            {file.fileName}
          </a>
          <span className="text-xs text-muted-foreground">
            {KIND_LABELS[file.kind] ?? file.kind} · {sizeLabel(file.fileSize)}
          </span>
          {file.visibility === "SHARED" ? (
            <Badge variant="secondary">виден клиенту</Badge>
          ) : (
            <Badge variant="outline">только мы</Badge>
          )}
        </div>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            Удалить файл?
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>
              Да, удалить
            </Button>
            <Button ref={focusRef} type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Нет
            </Button>
          </span>
        ) : (
          <Button ref={triggerRef} type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Удалить
          </Button>
        )}
      </div>
      <FormMessage compact error={error} />
    </li>
  );
}
