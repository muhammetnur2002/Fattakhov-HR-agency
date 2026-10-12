"use client";

import { Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { seatInVacancyAction } from "@/app/(agency)/a/candidates/seat-actions";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { panelClass } from "@/components/ui/panel";
import { useReturnFocus } from "@/lib/hooks/use-return-focus";

export type SeatVacancy = { id: string; label: string };
export type SeatTaken = { id: string; label: string; stage: string };

/**
 * «Посадить в вакансию» на карточке кандидата.
 *
 * Список приходит со страницы: вакансии в работе, где этого человека ещё нет
 * (listOfferableVacancies), и отдельно те, где он уже сидит — они видны серыми
 * и недоступны, чтобы было понятно, почему вакансии нет в выборе. Сажаем
 * на первый этап воронки, как «Из базы» внутри вакансии.
 */
export function SeatInVacancy({
  candidateId,
  candidateName,
  vacancies,
  taken,
}: {
  candidateId: string;
  candidateName: string;
  vacancies: SeatVacancy[];
  taken: SeatTaken[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Кнопка стоит рядом с окном, а не внутри DialogTrigger: фокус возвращаем сами
  const returnFocus = useReturnFocus();

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? vacancies.filter((v) => v.label.toLowerCase().includes(needle)) : vacancies),
    [vacancies, needle],
  );
  const shownTaken = useMemo(
    () => (needle ? taken.filter((v) => v.label.toLowerCase().includes(needle)) : taken),
    [taken, needle],
  );

  function reset() {
    setQuery("");
    setChoice("");
    setError(null);
  }

  function seat() {
    if (!choice) return;
    setError(null);
    startTransition(async () => {
      const result = await seatInVacancyAction({ candidateId, vacancyId: choice });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button
        type="button"
        size="sm"
        onClick={(e) => {
          returnFocus.remember(e.currentTarget);
          setOpen(true);
        }}
      >
        <Plus className="size-4" />
        Посадить в вакансию
      </Button>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Посадить в вакансию: {candidateName}</DialogTitle>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти вакансию: номер, название, клиент…"
          aria-label="Поиск вакансии"
          autoFocus
        />

        <FormMessage error={error} />

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {shown.length === 0 && shownTaken.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {vacancies.length === 0 && taken.length === 0
                ? "Нет вакансий в работе, куда можно посадить."
                : "Ничего не нашли."}
            </p>
          )}
          {shown.map((v) => (
            <label
              key={v.id}
              className={panelClass("plain", "flex cursor-pointer items-center gap-3 space-y-0")}
            >
              <input
                type="radio"
                name="seat-vacancy"
                className="size-4"
                checked={choice === v.id}
                onChange={() => setChoice(v.id)}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.label}</span>
            </label>
          ))}
          {shownTaken.map((v) => (
            <div
              key={v.id}
              className={panelClass("plain", "flex items-center gap-3 space-y-0 opacity-60")}
            >
              <input type="radio" className="size-4" disabled aria-label={`${v.label}: уже в этой вакансии`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{v.label}</span>
                <span className="block text-xs text-muted-foreground">
                  Уже в этой вакансии · {v.stage}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Встанет на первый этап воронки</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" loading={pending} disabled={!choice} onClick={seat}>
              Посадить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
