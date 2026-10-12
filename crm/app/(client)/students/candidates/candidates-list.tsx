"use client";

import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudentCandidate } from "@/lib/students-service";
import { studyLine } from "@/lib/study-level";
import { SearchField } from "@/components/ui/search-field";
import { inviteCandidateAction } from "../actions";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";

const WEEKDAYS = [
  { code: "MON", label: "Пн" },
  { code: "TUE", label: "Вт" },
  { code: "WED", label: "Ср" },
  { code: "THU", label: "Чт" },
  { code: "FRI", label: "Пт" },
  { code: "SAT", label: "Сб" },
  { code: "SUN", label: "Вс" },
];

/**
 * Список кандидатов с поиском и фильтрами. Фильтры на клиенте: список —
 * уже отобранные подтверждённые студенты пилотного города, его хватает
 * целиком в одном ответе, отдельный запрос на каждый символ не нужен.
 */
export function CandidatesList({ vacancyId, candidates }: { vacancyId: string; candidates: StudentCandidate[] }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const years = [...new Set(candidates.map((c) => c.studyYear))].sort((a, b) => a - b);
  const needle = query.trim().toLowerCase();
  const visible = candidates.filter((c) => {
    if (invited.has(c.id)) return false;
    if (year !== null && c.studyYear !== year) return false;
    // Подходит, если студент может во все выбранные дни
    if (days.length > 0 && !days.every((d) => c.workDays.includes(d))) return false;
    if (!needle) return true;
    return [c.fullName, c.university, c.speciality, ...c.skills].some((f) => f.toLowerCase().includes(needle));
  });

  function invite(studentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await inviteCandidateAction(vacancyId, studentId);
      if (result.error) setError(result.error);
      else setInvited((prev) => new Set(prev).add(studentId));
    });
  }

  if (candidates.length === 0) {
    return (
      <EmptyState>
        Подходящих студентов пока нет — все уже откликались или ещё не
        подтвердили учёбу.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <SearchField value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, вуз, специальность или навык" aria-label="Поиск студентов" />

      <div className="space-y-2">
        <FilterChipGroup label="Курс">
          <span className="text-xs text-muted-foreground">Курс:</span>
          <FilterChip selected={year === null} onClick={() => setYear(null)}>
            Любой
          </FilterChip>
          {years.map((y) => (
            <FilterChip key={y} selected={year === y} onClick={() => setYear(y)}>
              {y}
            </FilterChip>
          ))}
        </FilterChipGroup>
        <FilterChipGroup label="Может в дни">
          <span className="text-xs text-muted-foreground">Может в дни:</span>
          {WEEKDAYS.map((d) => (
            <FilterChip
              key={d.code}
              selected={days.includes(d.code)}
              onClick={() => setDays((prev) => (prev.includes(d.code) ? prev.filter((x) => x !== d.code) : [...prev, d.code]))}
            >
              {d.label}
            </FilterChip>
          ))}
        </FilterChipGroup>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">Найдено: {visible.length}</p>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ничего не нашлось — попробуйте убрать фильтры.</p>
      ) : (
        <div className="grid gap-3">
          {visible.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{c.fullName}</div>
                    <div className="text-sm text-muted-foreground">
                      {c.university}, {studyLine(c.studyLevel, c.studyYear)} · {c.speciality}
                    </div>
                  </div>
                  <Button size="sm" disabled={pending} onClick={() => invite(c.id)}>
                    Пригласить
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.age} лет{c.city ? ` · ${c.city}` : ""}
                  {c.workDays.length > 0 &&
                    ` · ${WEEKDAYS.filter((d) => c.workDays.includes(d.code))
                      .map((d) => d.label)
                      .join(", ")}${c.hoursPerWeek ? ` · до ${c.hoursPerWeek} ч/нед` : ""}`}
                </div>
                {c.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.skills.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {c.about && <p className="text-sm text-muted-foreground">{c.about}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
