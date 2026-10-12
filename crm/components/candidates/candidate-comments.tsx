"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useState, useTransition } from "react";

import {
  addCandidateCommentAction,
  deleteCandidateCommentAction,
  type ExtrasState,
} from "@/app/(agency)/a/candidates/extras-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { panelClass } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/lib/hooks/use-form-action";

export type FeedRow = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "SHARED";
  createdAt: string;
  author: string | null;
  /** null: заметка по кандидату в целом. */
  application: { id: string; vacancyLabel: string } | null;
  canDelete: boolean;
};

export type VacancyOption = { applicationId: string; label: string };

function when(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Комментарии команды под кандидатом.
 *
 * По умолчанию видят только сотрудники агентства. Галочка «Показать
 * работодателю» открывает комментарий компании, но только в рамках выбранной
 * вакансии: работодатель видит кандидата лишь как отклик на свою вакансию,
 * поэтому без выбора вакансии галочка недоступна.
 */
export function CandidateCommentsCard({
  candidateId,
  feed,
  vacancies,
  blockedReason,
}: {
  candidateId: string;
  feed: FeedRow[];
  vacancies: VacancyOption[];
  /** Заметки по кандидату в целом закрыты (сорсинг-лид без согласия). */
  blockedReason?: string;
}) {
  const [applicationId, setApplicationId] = useState("");
  // Текст комментария после отказа остаётся: прежний action={...} очищал поле при любом ответе.
  // Успех очищает форму и возвращает выбор вакансии
  const { state, pending, formProps } = useFormAction<ExtrasState>(
    addCandidateCommentAction,
    {},
    { resetOnSuccess: true, onSuccess: () => setApplicationId("") },
  );

  // У сорсинг-лида без согласия заметка по кандидату в целом закрыта, но
  // комментарий в рамках вакансии сервис принимает: форму прячем целиком
  // только тогда, когда писать некуда
  const noPlaceToWrite = Boolean(blockedReason) && vacancies.length === 0;

  return (
    <div className="space-y-4">
      {feed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
      ) : (
        <ul className="space-y-3">
          {feed.map((item) => (
            <FeedItem key={item.id} item={item} candidateId={candidateId} />
          ))}
        </ul>
      )}

      {noPlaceToWrite ? (
        <Alert>
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      ) : (
        <form {...formProps} className="space-y-4 border-t pt-4">
          <input type="hidden" name="candidateId" value={candidateId} />
          <Textarea
            name="body"
            rows={3}
            required
            maxLength={4000}
            placeholder="Комментарий по кандидату. По умолчанию его видят только сотрудники агентства"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Вакансия</span>
              <select
                name="applicationId"
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                className="h-8 rounded-lg border border-field bg-background px-2 text-sm"
              >
                <option value="">Кандидат в целом</option>
                {vacancies.map((v) => (
                  <option key={v.applicationId} value={v.applicationId}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`flex items-center gap-2 ${applicationId ? "" : "opacity-60"}`}>
              <input
                type="checkbox"
                name="shareWithEmployer"
                disabled={!applicationId}
                className="size-4"
              />
              Показать работодателю
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {applicationId
              ? "Без галочки комментарий внутренний. С галочкой его увидит компания, для вакансии которой подбирается кандидат."
              : "Без вакансии это заметка для команды: работодатель её не увидит. Чтобы показать комментарий работодателю, выберите вакансию."}
          </p>
          {blockedReason && !applicationId && (
            <p className="text-xs text-muted-foreground">{blockedReason}</p>
          )}

          <FormMessage error={state.error} />
          <SubmitButton size="sm" loading={pending} pendingLabel="Отправляем…">
            Отправить
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

function FeedItem({ item, candidateId }: { item: FeedRow; candidateId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    setError(null);
    start(async () => {
      const result = await deleteCandidateCommentAction(candidateId, item.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <li className={panelClass("plain", "space-y-1")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{item.author ?? "Сотрудник"}</span>
        <span>{when(item.createdAt)}</span>
        {item.application ? (
          <Link href={`/a/applications/${item.application.id}`} className="underline underline-offset-2">
            {item.application.vacancyLabel}
          </Link>
        ) : (
          <span>кандидат в целом</span>
        )}
        {item.visibility === "SHARED" ? (
          <Badge variant="secondary">виден работодателю</Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Lock className="size-3" />
            только мы
          </Badge>
        )}
      </div>
      <p className="whitespace-pre-line text-sm">{item.body}</p>
      {item.canDelete && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove}>
          Удалить
        </Button>
      )}
      <FormMessage compact error={error} />
    </li>
  );
}
