"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createConsentLinkAction,
  markConsentAction,
  presentAction,
  rejectAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { CopyableLink } from "@/components/shared/copyable-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RejectionSide } from "@/lib/generated/prisma/enums";
import {
  REJECTION_REASON_LABELS,
  REJECTION_REASONS_BY_SIDE,
  REJECTION_SIDE_LABELS,
} from "@/lib/labels";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state }: { state: CandidateState }) {
  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state.ok) {
    return (
      <Alert>
        <AlertDescription>{state.ok}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * Представление кандидата клиенту (BR-4).
 *
 * Форма намеренно требовательная: саммари от ста символов и резюме.
 * Клиент, которому прислали карточку без объяснения, почему человек
 * подходит, начинает делать работу рекрутера сам — и перестаёт
 * понимать, за что платит.
 */
export function PresentForm({
  applicationId,
  candidateId,
  hasResume,
  hasConsent,
  defaultSalary,
}: {
  applicationId: string;
  candidateId: string;
  hasResume: boolean;
  hasConsent: boolean;
  defaultSalary: number | null;
}) {
  const [state, formAction] = useActionState<CandidateState, FormData>(
    presentAction,
    {},
  );
  const [consentState, consentAction] = useActionState<CandidateState, FormData>(
    markConsentAction,
    {},
  );
  const [linkState, linkAction] = useActionState<
    CandidateState & { consentUrl?: string },
    FormData
  >(createConsentLinkAction, {});
  const [showManualConsent, setShowManualConsent] = useState(false);

  const blockers: string[] = [];
  if (!hasResume) blockers.push("нет резюме");
  if (!hasConsent) blockers.push("нет согласия на обработку ПДн");

  return (
    <div className="space-y-4">
      {blockers.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Представить нельзя: {blockers.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      {!hasConsent && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">
            Нужно согласие на обработку персональных данных
          </p>

          {/* Основной путь: кандидат подтверждает сам — это фиксируется
              с временем, адресом и версией текста */}
          <form action={linkAction} className="space-y-2">
            <input type="hidden" name="candidateId" value={candidateId} />
            <Submit label="Получить ссылку для кандидата" pendingLabel="Готовим…" />
            {linkState.consentUrl && (
              <CopyableLink
                url={linkState.consentUrl}
                hint="Действует 14 дней. Кандидат откроет с телефона и подтвердит."
              />
            )}
            {linkState.error && (
              <Alert variant="destructive">
                <AlertDescription>{linkState.error}</AlertDescription>
              </Alert>
            )}
          </form>

          {/* Запасной путь: согласие взято на бумаге. Спрятан за ссылкой,
              а не показан отдельной формой — иначе он выглядел таким же
              нормальным вариантом, как получение согласия по ссылке,
              хотя у него нет подтверждённого следа */}
          {showManualConsent ? (
            <form action={consentAction} className="space-y-2 border-t pt-3">
              <input type="hidden" name="candidateId" value={candidateId} />
              <p className="text-xs text-muted-foreground">
                Без подтверждённого следа — используйте, только если
                согласие правда уже получено на бумаге или письмом.
              </p>
              <Button type="submit" size="sm" variant="outline">
                Отметить вручную
              </Button>
              <Feedback state={consentState} />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowManualConsent(true)}
              className="block w-full border-t pt-3 text-left text-xs text-muted-foreground underline hover:text-foreground"
            >
              Согласие уже получено на бумаге или письмом
            </button>
          )}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="applicationId" value={applicationId} />

        <div className="space-y-2">
          <Label htmlFor="presentationSummary">Почему подходит</Label>
          <Textarea
            id="presentationSummary"
            name="presentationSummary"
            rows={6}
            minLength={100}
            required
            placeholder="Что за человек, чем занимался, почему он под эту вакансию, что важно знать до интервью"
          />
          <p className="text-xs text-muted-foreground">
            Это первое, что прочитает клиент. Минимум 100 символов.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="salaryExpectation">Зарплатное ожидание, ₽</Label>
          <Input
            id="salaryExpectation"
            name="salaryExpectation"
            type="number"
            required
            defaultValue={defaultSalary ?? ""}
          />
        </div>

        <Submit label="Представить клиенту" pendingLabel="Представляем…" />
        <Feedback state={state} />
      </form>
    </div>
  );
}

/** Отказ с обязательной причиной (BR-11). */
export function RejectForm({ applicationId }: { applicationId: string }) {
  const [state, formAction] = useActionState<CandidateState, FormData>(
    rejectAction,
    {},
  );
  const [side, setSide] = useState<RejectionSide>("CLIENT");
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="space-y-2">
        <Label htmlFor="rejectedBy">Кто отказал</Label>
        <Select
          name="rejectedBy"
          value={side}
          onValueChange={(v) => {
            setSide(v as RejectionSide);
            setReason("");
          }}
        >
          <SelectTrigger id="rejectedBy" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(REJECTION_SIDE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rejectionReason">Причина</Label>
        <Select name="rejectionReason" value={reason} onValueChange={setReason}>
          <SelectTrigger id="rejectionReason" className="w-full">
            <SelectValue placeholder="Выберите причину" />
          </SelectTrigger>
          <SelectContent>
            {REJECTION_REASONS_BY_SIDE[side].map((code) => (
              <SelectItem key={code} value={code}>
                {REJECTION_REASON_LABELS[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Из причин собирается отчёт, по которому калибруется поиск.
          «Не очень» в комментарии такой пользы не даёт.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rejectionComment">
          Комментарий{reason === "OTHER" ? "" : " (необязательно)"}
        </Label>
        <Textarea
          id="rejectionComment"
          name="rejectionComment"
          rows={3}
          required={reason === "OTHER"}
        />
      </div>

      <Submit label="Зафиксировать отказ" pendingLabel="Сохраняем…" />
      <Feedback state={state} />
    </form>
  );
}
