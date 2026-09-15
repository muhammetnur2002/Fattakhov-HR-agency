"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { KanbanCard, KanbanStage } from "./types";
import { DecisionPanel } from "@/components/applications/decision-panel";
import { UndoRejectButton } from "@/components/applications/undo-reject-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_OUTCOME_LABELS,
  REJECTION_REASON_LABELS,
} from "@/lib/labels";
import { formatNumber } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { ClientDecision, RejectionReason } from "@/lib/generated/prisma/enums";

/**
 * Экран сравнения (обсуждали и показывали макетом перед переносом сюда).
 *
 * Живёт внутри доски, а не на отдельном маршруте: кандидаты уже загружены
 * в `KanbanBoard`, а решение по кандидату должно остаться там же, где
 * его сравнивают — переход на страницу кандидата и обратно теряет
 * контекст сравнения ровно тогда, когда он нужнее всего.
 */
export function CompareView({
  cards,
  stages,
  hrefBase,
  canDecide,
  onExit,
  onRemove,
  onDecided,
  onUndoReject,
}: {
  cards: KanbanCard[];
  stages: KanbanStage[];
  hrefBase: string;
  canDecide: boolean;
  onExit: () => void;
  onRemove: (applicationId: string) => void;
  onDecided: (
    applicationId: string,
    decision: ClientDecision,
    rejectionReason?: RejectionReason,
  ) => void;
  onUndoReject: (applicationId: string) => void;
}) {
  // Та же логика затухания у края, что и у доски (см. kanban-board.tsx):
  // видимость держится на реальном переполнении, а не на брейкпоинте
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [cards]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onExit}>
          ← Назад к доске
        </Button>
      </div>

      <div className="relative">
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-4">
          {cards.map((card) => (
            <CompareColumn
              key={card.id}
              card={card}
              stage={stages.find((s) => s.id === card.stageId)}
              hrefBase={hrefBase}
              canDecide={canDecide}
              onRemove={() => onRemove(card.id)}
              onDecided={(decision, reason) =>
                onDecided(card.id, decision, reason)
              }
              onUndoReject={() => onUndoReject(card.id)}
            />
          ))}
        </div>
        {canScrollRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 bottom-4 w-10 bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>
    </div>
  );
}

function CompareColumn({
  card,
  stage,
  hrefBase,
  canDecide,
  onRemove,
  onDecided,
  onUndoReject,
}: {
  card: KanbanCard;
  stage: KanbanStage | undefined;
  hrefBase: string;
  canDecide: boolean;
  onRemove: () => void;
  onDecided: (decision: ClientDecision, rejectionReason?: RejectionReason) => void;
  onUndoReject: () => void;
}) {
  const closed = card.outcome === "REJECTED" || card.outcome === "WITHDRAWN";

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`${hrefBase}/${card.id}`}
            className="font-medium hover:underline"
          >
            {card.candidate.fullName}
          </Link>
          <div className="mt-1">
            {closed ? (
              <Badge variant="secondary">
                {APPLICATION_OUTCOME_LABELS[card.outcome]}
              </Badge>
            ) : (
              <Badge variant="secondary">{stage?.name}</Badge>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground"
          onClick={onRemove}
          aria-label={`Убрать ${card.candidate.fullName} из сравнения`}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/*
        Три строки всегда, даже когда поля нет («—» вместо пропуска
        строки) — иначе у карточки без города, скажем, всего две строки,
        и черта под ними уже не совпадает с чертой у соседей. Значения
        в одну строку (truncate): перенос на вторую строку сдвинул бы
        черту точно так же, как отсутствующее поле.
      */}
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">Зарплата</dt>
          <dd className="min-w-0 truncate">
            {card.candidate.salaryExpectation !== null
              ? `${formatNumber(card.candidate.salaryExpectation)} ₽`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">Город</dt>
          <dd className="min-w-0 truncate">{card.candidate.city || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">Сейчас</dt>
          <dd className="min-w-0 truncate text-right">
            {[card.candidate.currentPosition, card.candidate.currentCompany]
              .filter(Boolean)
              .join(" · ") || "—"}
          </dd>
        </div>
      </dl>

      {/*
        Черта и описание — без ограничения высоты: пусть колонка
        с длинным саммари вытягивается, это нормально. Кнопки решения
        всё равно на одном уровне благодаря mt-auto ниже — растягивает
        их до одной высоты по самой длинной карточке в ряду.
      */}
      <div className="mt-2 border-t pt-2">
        {card.presentationSummary && (
          <p className="text-sm whitespace-pre-line">
            {card.presentationSummary}
          </p>
        )}
        {closed && card.rejectionReason && (
          <p
            className={cn(
              "text-sm text-muted-foreground",
              card.presentationSummary && "mt-2",
            )}
          >
            {REJECTION_REASON_LABELS[card.rejectionReason]}
          </p>
        )}
        {closed && canDecide && card.clientDecision === "REJECT" && (
          <div className="mt-2">
            <UndoRejectButton applicationId={card.id} onUndone={onUndoReject} />
          </div>
        )}
      </div>

      {canDecide && !closed && (
        <div className="mt-auto border-t pt-3">
          {card.clientDecision && (
            <p className="mb-2 text-xs text-muted-foreground">
              Решение принято, но его можно изменить.
            </p>
          )}
          <DecisionPanel
            applicationId={card.id}
            onBehalf={false}
            currentDecision={card.clientDecision}
            onDecided={onDecided}
          />
        </div>
      )}
    </div>
  );
}
