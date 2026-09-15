"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, Clock, Lock, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { daysOnStage, isOverdue, type KanbanCard, type KanbanStage } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REJECTION_REASON_LABELS } from "@/lib/labels";
import { formatNumber } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function CandidateCard({
  card,
  stage,
  allStages,
  hrefBase,
  draggable,
  selectable = false,
  selected = false,
  onToggleSelect,
  onMoveToStage,
  now,
}: {
  card: KanbanCard;
  stage: KanbanStage;
  allStages: KanbanStage[];
  hrefBase: string;
  draggable: boolean;
  /** Момент отрисовки со страницы — см. hoursOnStage в ./types. */
  now: number;
  /** Режим сравнения кандидатов: на доске появляются чекбоксы вместо перетаскивания. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onMoveToStage: (cardId: string, stageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !draggable });

  /*
    Было ли это перетаскиванием.

    Ссылка с именем занимает половину карточки, и хвататься люди будут
    именно за неё. Раньше здесь стояла остановка всплытия, чтобы клик
    по имени не превращался в перетаскивание, и из-за неё карточку
    нельзя было утащить за имя вовсе.

    Остановка была не нужна: у датчика задан порог в шесть пикселей,
    и обычный клик перетаскивание не начинает. А вот обратное бывает:
    после перетаскивания браузер всё равно шлёт клик, и без этой отметки
    отпускание карточки уводило бы на страницу кандидата.
  */
  const dragged = useRef(false);

  useEffect(() => {
    if (isDragging) dragged.current = true;
  }, [isDragging]);

  const overdue = isOverdue(card, stage, now);
  const days = daysOnStage(card.stageEnteredAt, now);
  const rejected = card.outcome === "REJECTED" || card.outcome === "WITHDRAWN";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onPointerDownCapture={() => {
        dragged.current = false;
      }}
      className={cn(
        "rounded-md border bg-background p-3 text-sm",
        /*
          Два обязательных свойства для перетаскивания указателем,
          без которых оно просто не начинается:

          touch-none - иначе браузер забирает жест себе. Доска
          прокручивается по горизонтали, и на трекпаде или на телефоне
          движение по карточке считается прокруткой, а не перетаскиванием.

          select-none - иначе движение по имени кандидата выделяет текст,
          и выделение перехватывает жест.

          Оба только для перетаскиваемого варианта: в кабинете клиента
          карточки неподвижны, и отбирать там обычное поведение незачем.
        */
        draggable && "cursor-grab touch-none select-none active:cursor-grabbing",
        isDragging && "opacity-40",
        overdue && "border-destructive/50",
        rejected && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        {selectable && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect?.()}
            aria-label={`Выбрать ${card.candidate.fullName}`}
            className="mt-0.5"
          />
        )}
        <Link
          href={`${hrefBase}/${card.id}`}
          onClick={(e) => {
            // Перетащили и отпустили: переходить не надо
            if (dragged.current) e.preventDefault();
          }}
          className="font-medium hover:underline"
        >
          {card.candidate.fullName}
        </Link>

        {/* Запасной путь для смены этапа без перетаскивания: на телефоне
            тащить карточку и листать доску вбок одним и тем же пальцем
            нельзя — жесты конфликтуют. Тап по пункту меню работает
            всегда, независимо от того, помещается ли доска на экране. */}
        {draggable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto size-9 shrink-0 md:size-6"
                aria-label="Переместить на этап"
                // dnd-kit слушает pointerdown на всей карточке ради
                // перетаскивания — без остановки он перехватывает
                // нажатие раньше триггера меню, и меню не открывается
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ArrowRightLeft className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allStages
                .filter((s) => s.id !== stage.id && s.code !== "PRESENTED")
                .map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => onMoveToStage(card.id, s.id)}
                  >
                    {s.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {(card.candidate.currentPosition || card.candidate.currentCompany) && (
        <div className="mt-0.5 text-xs text-muted-foreground">
          {[card.candidate.currentPosition, card.candidate.currentCompany]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {card.candidate.salaryExpectation !== null && (
          <span>{formatNumber(card.candidate.salaryExpectation)} ₽</span>
        )}

        <span
          className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}
        >
          <Clock className="size-3" />
          {days === 0 ? "сегодня" : `${days} дн.`}
        </span>

        {card._count.comments > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3" />
            {card._count.comments}
          </span>
        )}

        {card.candidate.consentStatus !== "GIVEN" && (
          <span className="inline-flex items-center gap-1" title="Нет согласия на обработку ПДн">
            <Lock className="size-3" />
            без согласия
          </span>
        )}
      </div>

      {rejected && card.rejectionReason && (
        <Badge variant="secondary" className="mt-2 font-normal">
          {REJECTION_REASON_LABELS[card.rejectionReason]}
        </Badge>
      )}
    </div>
  );
}
