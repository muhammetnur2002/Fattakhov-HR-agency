"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  addManyToVacancyAction,
  searchForVacancyAction,
} from "@/app/(agency)/a/vacancies/pick-actions";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { panelClass } from "@/components/ui/panel";
import { formatMoney } from "@/lib/format-money";
import type { PickerCandidate } from "@/lib/services/vacancy-picker";
import { useReturnFocus, type ReturnFocus } from "@/lib/hooks/use-return-focus";

type StageOption = { id: string; name: string };

/**
 * «Подобрать из базы»: найти кандидатов по условиям, отметить нескольких
 * и посадить на внутренний этап вакансии одним действием.
 *
 * Рядом остаётся прежняя кнопка «Из базы» (по одному, на первый этап).
 * Сюда выносится то, чего в ней нет: фильтры по городу и зарплате, выбор
 * нескольких людей, выбор этапа и пометки «уже здесь» и «ждёт клиента».
 */
export function PickFromBase({
  vacancyId,
  stages,
  presetStageId = null,
  onPresetClose,
  hideTrigger = false,
  returnFocus: externalReturnFocus,
}: {
  vacancyId: string;
  /** Внутренние этапы, на которые можно посадить (скрытые от клиента). */
  stages: StageOption[];
  /**
   * «+ Посадить сюда» в колонке воронки: окно открывается само, сразу
   * с этим этапом. Закрытие сообщаем наружу, чтобы колонку можно было
   * выбрать повторно.
   */
  presetStageId?: string | null;
  onPresetClose?: () => void;
  /** Экземпляр только для колонок: своей кнопки в панели у него нет. */
  hideTrigger?: boolean;
  /**
   * Когда окно открывает не его кнопка, а кнопка в колонке воронки, запоминает её
   * тот, кто открывает (`VacancyBoard`): фокус после закрытия вернётся на неё.
   */
  returnFocus?: ReturnFocus;
}) {
  // Своя кнопка «Подобрать из базы» стоит рядом с окном, а не внутри DialogTrigger
  const ownReturnFocus = useReturnFocus();
  const returnFocus = externalReturnFocus ?? ownReturnFocus;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [salaryTo, setSalaryTo] = useState("");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [items, setItems] = useState<PickerCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  // Ответ на устаревший запрос не должен перетереть свежий
  const requestRef = useRef(0);

  // Окно открывает колонка воронки — подставляем её этап. Во время рендера,
  // а не в эффекте (react.dev, «Adjusting state when props change»)
  const [seenPreset, setSeenPreset] = useState(presetStageId);
  if (presetStageId !== seenPreset) {
    setSeenPreset(presetStageId);
    if (presetStageId) {
      setStageId(presetStageId);
      setOpen(true);
    }
  }

  function runSearch() {
    const request = ++requestRef.current;
    startSearch(async () => {
      const result = await searchForVacancyAction({
        vacancyId,
        query,
        city,
        salaryTo: salaryTo ? Number(salaryTo) : undefined,
      });
      if (request !== requestRef.current) return;
      setItems(result.items);
      setError(result.error ?? null);
      // Выбор сохраняем только у тех, кто остался в выдаче и ещё не в вакансии
      setSelected((prev) => {
        const keep = new Set(
          result.items.filter((c) => !c.inThisVacancy && prev.has(c.id)).map((c) => c.id),
        );
        return keep;
      });
    });
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(runSearch, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, city, salaryTo]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    setError(null);
    setMessage(null);
    startAdd(async () => {
      const result = await addManyToVacancyAction({
        vacancyId,
        candidateIds: [...selected],
        stageId: stageId || undefined,
      });
      if (result.error || !result.result) {
        setError(result.error ?? "Не получилось посадить кандидатов");
        return;
      }
      const { added, skipped } = result.result;
      setMessage(
        `Посажено: ${added}.` +
          (skipped.length > 0 ? ` Пропущено: ${skipped.length} (${skipped[0].reason.toLowerCase()}).` : ""),
      );
      setSelected(new Set());
      runSearch();
    });
  }

  const stageName = stages.find((s) => s.id === stageId)?.name ?? "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelected(new Set());
          setError(null);
          setMessage(null);
          onPresetClose?.();
        }
      }}
    >
      {!hideTrigger && (
        <Button
          type="button"
          size="sm"
          onClick={(e) => {
            returnFocus.remember(e.currentTarget);
            setOpen(true);
          }}
        >
          Подобрать из базы
        </Button>
      )}
      <DialogContent className="sm:max-w-2xl" onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Подобрать кандидатов из базы</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя, должность, навык…"
            aria-label="Поиск"
            autoFocus
          />
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город"
            aria-label="Город"
          />
          <Input
            value={salaryTo}
            onChange={(e) => setSalaryTo(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Зарплата до, ₽"
            aria-label="Зарплата до"
          />
        </div>

        <FormMessage error={error} ok={message} />

        <div className="max-h-96 space-y-2 overflow-y-auto" aria-busy={searching}>
          {!searching && items.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Никого не нашли по этим условиям.
            </p>
          )}
          {items.map((c) => (
            <label
              key={c.id}
              className={panelClass(
                "plain",
                "flex items-start gap-3 space-y-0 " +
                  (c.inThisVacancy ? "opacity-60" : "cursor-pointer"),
              )}
            >
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={selected.has(c.id)}
                disabled={c.inThisVacancy}
                onChange={() => toggle(c.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    c.currentPosition,
                    c.city,
                    c.salaryExpectation != null ? formatMoney(c.salaryExpectation) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Профиль не заполнен"}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.inThisVacancy && <Badge variant="secondary">уже в этой вакансии</Badge>}
                  {c.awaitingClient && <Badge variant="outline">ждёт клиента по другой вакансии</Badge>}
                  {!c.inThisVacancy && c.otherVacancies > 0 && !c.awaitingClient && (
                    <Badge variant="outline">в других воронках: {c.otherVacancies}</Badge>
                  )}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Посадить на этап</span>
            <NativeSelect value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Этап">
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button
            type="button"
            loading={adding}
            disabled={selected.size === 0 || !stageName}
            onClick={handleAdd}
          >
            {adding ? "Сажаем…" : `Посадить ${selected.size > 0 ? selected.size : ""}`.trim()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
