"use client";

import { CalendarPlus, PauseCircle, ThumbsDown } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { decideAction, type DecisionState } from "@/app/actions/decisions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REJECTION_REASON_LABELS,
  REJECTION_REASONS_BY_SIDE,
} from "@/lib/labels";
import type {
  ClientDecision,
  RejectionReason,
} from "@/lib/generated/prisma/enums";

function DecisionButton({
  label,
  icon,
  variant = "outline",
}: {
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="gap-2">
      {icon}
      {pending ? "…" : label}
    </Button>
  );
}

/**
 * Панель решения по кандидату (BR-12).
 *
 * Три кнопки вместо переписки: клиент, которому надо написать письмо,
 * чтобы отреагировать, не реагирует неделю. Отказ требует причину —
 * из неё потом собирается отчёт, по которому калибруется поиск (BR-11).
 *
 * `onBehalf` включается, когда панель открыл сотрудник агентства:
 * решение будет записано как внесённое со слов клиента (BR-14).
 *
 * `onDecided` — опциональный колбэк для мест, где карточка кандидата
 * живёт вне этой страницы (сравнение кандидатов на доске): сама панель
 * не знает о такой карточке и не может её обновить, а револидация пути
 * этой страницы её не тронет.
 */
export function DecisionPanel({
  applicationId,
  onBehalf,
  currentDecision,
  onDecided,
}: {
  applicationId: string;
  onBehalf: boolean;
  currentDecision: string | null;
  onDecided?: (decision: ClientDecision, rejectionReason?: RejectionReason) => void;
}) {
  const [state, formAction] = useActionState<DecisionState, FormData>(
    decideAction,
    {},
  );
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const lastDecision = useRef<ClientDecision | null>(null);

  useEffect(() => {
    if (state.ok && lastDecision.current && onDecided) {
      onDecided(
        lastDecision.current,
        lastDecision.current === "REJECT"
          ? (reason as RejectionReason)
          : undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="space-y-3">
      {onBehalf && (
        <p className="text-xs text-muted-foreground">
          Вы вносите решение со слов клиента. В его кабинете появится
          пометка, что решение внесли вы.
        </p>
      )}

      {!rejecting && (
        <div className="flex flex-wrap gap-2">
          <form
            action={formAction}
            onSubmit={() => (lastDecision.current = "INTERVIEW")}
          >
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="decision" value="INTERVIEW" />
            <DecisionButton
              label="Пригласить на интервью"
              icon={<CalendarPlus className="size-4" />}
              variant="default"
            />
          </form>

          <form
            action={formAction}
            onSubmit={() => (lastDecision.current = "HOLD")}
          >
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="decision" value="HOLD" />
            <DecisionButton
              label="Взять паузу"
              icon={<PauseCircle className="size-4" />}
            />
          </form>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setRejecting(true)}
          >
            <ThumbsDown className="size-4" />
            Отказать
          </Button>
        </div>
      )}

      {rejecting && (
        <form
          action={formAction}
          onSubmit={() => (lastDecision.current = "REJECT")}
          className="space-y-3 rounded-md border p-3"
        >
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="decision" value="REJECT" />
          <input type="hidden" name="rejectedBy" value="CLIENT" />

          <div className="space-y-2">
            <Label htmlFor="rejectionReason">Почему не подходит</Label>
            <Select name="rejectionReason" value={reason} onValueChange={setReason}>
              <SelectTrigger id="rejectionReason" className="w-full">
                <SelectValue placeholder="Выберите причину" />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS_BY_SIDE.CLIENT.map((code) => (
                  <SelectItem key={code} value={code}>
                    {REJECTION_REASON_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Причина нужна не для отчётности: по ней рекрутер поймёт,
              кого искать дальше.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rejectionComment">
              Комментарий{reason === "OTHER" ? "" : " (необязательно)"}
            </Label>
            <Textarea
              id="rejectionComment"
              name="rejectionComment"
              rows={2}
              required={reason === "OTHER"}
            />
          </div>

          <div className="flex gap-2">
            <DecisionButton
              label="Отказать"
              icon={<ThumbsDown className="size-4" />}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejecting(false)}
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      {currentDecision && !state.ok && (
        <p className="text-xs text-muted-foreground">
          Решение можно изменить — например, вернуть кандидата из паузы.
        </p>
      )}

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
    </div>
  );
}
