"use client";

import { useState, useTransition } from "react";

import { setCandidateStatusAction } from "@/app/(agency)/a/candidates/extras-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CandidateStatus } from "@/lib/generated/prisma/enums";
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_ORDER } from "@/lib/labels";
import { CANDIDATE_STATUS_TONE } from "@/lib/status-tones";
import { FormMessage } from "@/components/ui/form-message";

const NONE = "__none__";

/** Метка статуса для списков. Без статуса ничего не рисуется. */
export function CandidateStatusBadge({ status }: { status: CandidateStatus | null }) {
  if (!status) return null;
  return <StatusBadge tone={CANDIDATE_STATUS_TONE[status]}>{CANDIDATE_STATUS_LABELS[status]}</StatusBadge>;
}

/**
 * Смена статуса в карточке кандидата одним выбором.
 *
 * Сохраняется сразу, без отдельной кнопки: статус меняют часто и по одному
 * полю. Ошибка (нет прав, кандидат пропал) показывается рядом и возвращает
 * прежнее значение.
 */
export function CandidateStatusSelect({
  candidateId,
  status,
}: {
  candidateId: string;
  status: CandidateStatus | null;
}) {
  const [value, setValue] = useState<string>(status ?? NONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    start(async () => {
      const result = await setCandidateStatusAction(candidateId, next === NONE ? "" : next);
      if (result.error) {
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Статус</span>
      <Select value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger className="h-8 w-44" aria-label="Статус кандидата">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Не указан</SelectItem>
          {CANDIDATE_STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              {CANDIDATE_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage compact error={error} />
    </div>
  );
}
