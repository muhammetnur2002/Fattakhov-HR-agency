"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createConsentLinkAction,
  markConsentAction,
  markSourcingNoticeAction,
  type CandidateState,
} from "@/app/(agency)/a/candidates/actions";
import { CopyableLink } from "@/components/shared/copyable-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function Submit({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant?: "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
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
 * Что делать с сорсинг-лидом (lib/services/sourcing.ts): уведомить первым
 * действием и получить согласие, пока не вышли 14 дней.
 *
 * Сроки и даты считает страница: здесь только кнопки. Ручная отметка
 * согласия спрятана за ссылкой, как в форме представления: у неё нет
 * подтверждённого следа, и она не должна выглядеть равноправным путём.
 */
export function SourcingPanel({
  candidateId,
  noticeDate,
  consentLinkDays,
}: {
  candidateId: string;
  /** Когда уведомили — уже отформатированная дата, или null. */
  noticeDate: string | null;
  /** Сколько живёт ссылка на согласие — для подсказки. */
  consentLinkDays: number;
}) {
  const [noticeState, noticeAction] = useActionState<CandidateState, FormData>(
    markSourcingNoticeAction,
    {},
  );
  const [linkState, linkAction] = useActionState<
    CandidateState & { consentUrl?: string },
    FormData
  >(createConsentLinkAction, {});
  const [manualState, manualAction] = useActionState<CandidateState, FormData>(
    markConsentAction,
    {},
  );
  const [showManual, setShowManual] = useState(false);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-sm font-medium">1. Уведомить первым действием</div>
        {noticeDate ? (
          <p className="text-sm text-muted-foreground">Уведомлён {noticeDate}.</p>
        ) : (
          <form action={noticeAction} className="space-y-2">
            <input type="hidden" name="candidateId" value={candidateId} />
            <p className="text-sm text-muted-foreground">
              Сообщите человеку, кто мы, откуда у нас его контакты, зачем они нам
              и какие у него права (ст. 18 152-ФЗ) — письмом, сообщением или
              звонком. Потом отметьте здесь: отметка попадёт в журнал ПДн.
            </p>
            <Submit label="Уведомил" pendingLabel="Отмечаем…" variant="outline" />
            <Feedback state={noticeState} />
          </form>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <div className="text-sm font-medium">2. Получить согласие</div>
        <form action={linkAction} className="space-y-2">
          <input type="hidden" name="candidateId" value={candidateId} />
          <Submit label="Получить ссылку для кандидата" pendingLabel="Готовим…" />
          {linkState.consentUrl && (
            <CopyableLink
              url={linkState.consentUrl}
              hint={`Действует ${consentLinkDays} дней. Кандидат откроет с телефона и подтвердит.`}
            />
          )}
          {linkState.error && (
            <Alert variant="destructive">
              <AlertDescription>{linkState.error}</AlertDescription>
            </Alert>
          )}
        </form>

        {showManual ? (
          <form action={manualAction} className="space-y-2 border-t pt-3">
            <input type="hidden" name="candidateId" value={candidateId} />
            <p className="text-xs text-muted-foreground">
              Без подтверждённого следа — используйте, только если согласие
              правда уже получено на бумаге или письмом.
            </p>
            <Submit label="Отметить вручную" pendingLabel="Отмечаем…" variant="outline" />
            <Feedback state={manualState} />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="block w-full pt-1 text-left text-xs text-muted-foreground underline hover:text-foreground"
          >
            Согласие уже получено на бумаге или письмом
          </button>
        )}
      </div>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        После согласия откроются профиль и загрузка резюме, а срок удаления снимется.
      </p>
    </div>
  );
}
