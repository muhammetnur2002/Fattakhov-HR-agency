"use client";

import { useState } from "react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import type { KanbanCard, KanbanStage } from "@/components/kanban/types";
import { PickFromBase } from "@/components/vacancies/pick-from-base";
import { useReturnFocus } from "@/lib/hooks/use-return-focus";

type StageOption = { id: string; name: string };

/**
 * Воронка вакансии для агентства: доска плюс «+ Посадить сюда» в колонках.
 *
 * Кнопка в колонке открывает то же окно, что и «Подобрать из базы» в панели
 * над доской, но сразу с этапом этой колонки. Своей кнопки в панели у этого
 * экземпляра нет: прежняя остаётся как была.
 */
export function VacancyBoard({
  vacancyId,
  stages,
  cards,
  pickableStages,
  draggable,
  bulkEnabled,
  now,
}: {
  vacancyId: string;
  stages: KanbanStage[];
  cards: KanbanCard[];
  /** Внутренние этапы, куда сервер разрешает сажать; пусто — кнопок в колонках нет. */
  pickableStages: StageOption[];
  draggable: boolean;
  bulkEnabled: boolean;
  now: number;
}) {
  const [seatStageId, setSeatStageId] = useState<string | null>(null);
  const canSeat = pickableStages.length > 0;
  // «+ Посадить сюда» в колонке открывает окно, которое стоит в стороне: запоминаем кнопку
  const returnFocus = useReturnFocus();

  return (
    <>
      <KanbanBoard
        stages={stages}
        cards={cards}
        hrefBase="/a/applications"
        draggable={draggable}
        bulkEnabled={bulkEnabled}
        seatStageIds={pickableStages.map((s) => s.id)}
        onSeatHere={
          canSeat
            ? (stageId) => {
                returnFocus.remember();
                setSeatStageId(stageId);
              }
            : undefined
        }
        now={now}
      />
      {canSeat && (
        <PickFromBase
          vacancyId={vacancyId}
          stages={pickableStages}
          presetStageId={seatStageId}
          onPresetClose={() => setSeatStageId(null)}
          returnFocus={returnFocus}
          hideTrigger
        />
      )}
    </>
  );
}
