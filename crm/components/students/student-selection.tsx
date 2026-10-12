"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";

import {
  addStudentsAction,
} from "@/app/(agency)/a/reviews/students/pick-actions";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { panelClass } from "@/components/ui/panel";
import type { AddStudentsResult } from "@/lib/services/student-candidates";
import {
  clearSelection,
  pickStudent,
  readSelection,
  serverSelection,
  subscribeSelection,
  summarizeFailures,
  unpickStudents,
} from "@/lib/students-selection";

function useSelection() {
  return useSyncExternalStore(subscribeSelection, readSelection, serverSelection);
}

/**
 * Галочка «Подходит» на странице анкеты: выбрать можно только то, что
 * открыто и просмотрено. Уже добавленному студенту вместо галочки — ссылка
 * на его карточку кандидата.
 */
export function StudentPickToggle({
  studentId,
  name,
  candidateId,
}: {
  studentId: string;
  name: string;
  candidateId: string | null;
}) {
  const selected = useSelection();
  const checked = selected.some((s) => s.id === studentId);

  if (candidateId) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">Уже в кандидатах</Badge>
        <Link href={`/a/candidates/${candidateId}`} className="font-medium hover:underline">
          Открыть карточку кандидата
        </Link>
      </div>
    );
  }

  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
      <input
        type="checkbox"
        className="size-4"
        checked={checked}
        onChange={(event) => {
          if (event.target.checked) pickStudent({ id: studentId, name });
          else unpickStudents([studentId]);
        }}
      />
      Подходит
    </label>
  );
}

/** Отметка в списке: студент выбран (галочка ставится только в анкете). */
export function StudentSelectedMark({ studentId }: { studentId: string }) {
  const selected = useSelection();
  if (!selected.some((s) => s.id === studentId)) return null;
  return <StatusBadge tone="progress">Выбран</StatusBadge>;
}

/**
 * Корзина выбранных: сколько отмечено и кнопка «Добавить в кандидаты».
 * Показывается, пока есть выбранные или свежий результат добавления.
 */
export function StudentSelectionBar() {
  const selected = useSelection();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AddStudentsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (selected.length === 0 && !result && !error) return null;

  function add() {
    const ids = selected.map((s) => s.id);
    setError(null);
    startTransition(async () => {
      const response = await addStudentsAction(ids);
      if (response.error) {
        setError(response.error);
        return;
      }
      if (response.result) {
        setResult(response.result);
        // Добавленных и уже бывших из выбора убираем; неудавшиеся остаются
        unpickStudents([
          ...response.result.added.map((s) => s.studentId),
          ...response.result.existing.map((s) => s.studentId),
        ]);
      }
    });
  }

  return (
    <div
      className={panelClass("plain", "sticky bottom-4 z-10 space-y-2 bg-card text-card-foreground shadow-lg")}
      role="region"
      aria-label="Выбранные студенты"
    >
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <span className="font-medium">Выбрано: {selected.length}</span>
            <span className="ml-2 text-muted-foreground">
              {selected
                .slice(0, 3)
                .map((s) => s.name)
                .join(", ")}
              {selected.length > 3 ? ` и ещё ${selected.length - 3}` : ""}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={clearSelection} disabled={pending}>
              Очистить
            </Button>
            <Button type="button" size="sm" onClick={add} loading={pending}>
              {pending ? "Добавляем…" : "Добавить в кандидаты"}
            </Button>
          </div>
        </div>
      )}

      <FormMessage error={error} />

      {result && (
        <div className="space-y-1 text-sm" aria-live="polite">
          {result.added.length > 0 && (
            <p>
              Добавлено в кандидаты:{" "}
              {result.added.map((s, i) => (
                <span key={s.studentId}>
                  {i > 0 && ", "}
                  <Link href={`/a/candidates/${s.candidateId}`} className="font-medium hover:underline">
                    {s.fullName}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {result.existing.length > 0 && (
            <p className="text-muted-foreground">
              Уже были в кандидатах:{" "}
              {result.existing.map((s, i) => (
                <span key={s.studentId}>
                  {i > 0 && ", "}
                  <Link href={`/a/candidates/${s.candidateId}`} className="hover:underline">
                    {s.fullName}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {/* Одна плашка на всех: десять отказов — десять срочных объявлений подряд, они заглушают друг друга */}
          <FormMessage compact error={summarizeFailures(result.failed)} className="text-sm" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setResult(null)}>
            Скрыть
          </Button>
        </div>
      )}
    </div>
  );
}
