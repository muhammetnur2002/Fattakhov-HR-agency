"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { CandidateCard } from "./candidate-card";
import { CompareView } from "./compare-view";
import { resolveTargetStageId, type KanbanCard, type KanbanStage } from "./types";
import {
  moveStageAction,
  moveStageBulkAction,
} from "@/app/(agency)/a/candidates/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { ClientDecision, RejectionReason } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** Куда переезжает карточка после решения клиента — см. setClientDecision. */
const DECISION_TARGET_STAGE_CODE: Partial<Record<ClientDecision, string>> = {
  INTERVIEW: "CLIENT_INTERVIEW",
  OFFER: "OFFER",
};

/**
 * Канбан воронки.
 *
 * Один компонент на оба кабинета. Разницу задаёт `draggable`: клиент
 * карточки не двигает — процессом управляет агентство, клиент влияет
 * решениями по кандидату (ТЗ 7.2.4).
 *
 * Колонки и карточки приходят уже отфильтрованными по BR-3, никакой
 * фильтрации по видимости здесь нет и быть не должно.
 */
export function KanbanBoard({
  stages,
  cards: initialCards,
  hrefBase,
  draggable = false,
  compareEnabled = false,
  canDecide = false,
  bulkEnabled = false,
  now,
}: {
  stages: KanbanStage[];
  cards: KanbanCard[];
  hrefBase: string;
  draggable?: boolean;
  /**
   * Момент отрисовки в миллисекундах, приходит со страницы.
   *
   * Часы спрашиваются один раз на сервере: доска — клиентский
   * компонент, и собственный вызов часов в карточке дал бы серверной
   * разметке одно значение, а гидратации другое (см. ./types).
   */
  now: number;
  /** Клиентский кабинет: чекбоксы на карточках и экран сравнения (ТЗ 7.2.4). */
  compareEnabled?: boolean;
  /** Можно ли решать по кандидатам — панель решения на экране сравнения. */
  canDecide?: boolean;
  /** Агентство с правом application.moveStage: перевод пачкой. */
  bulkEnabled?: boolean;
}) {
  const [cards, setCards] = useState(initialCards);
  // Синхронизация с сервером при смене пропа — не в эффекте, а во время
  // рендера (react.dev, «Adjusting state when props change»): без этого
  // доска не замечала карточку, добавленную тем же действием на этой же
  // странице (например, «Из базы») — счётчик в шапке обновлялся, а сама
  // доска держала состояние с момента своего монтирования
  const [prevInitialCards, setPrevInitialCards] = useState(initialCards);
  if (initialCards !== prevInitialCards) {
    setPrevInitialCards(initialCards);
    setCards(initialCards);
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [bulkStageId, setBulkStageId] = useState("");
  const [bulkComment, setBulkComment] = useState("");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /*
    Решение, принятое на экране сравнения, должно сразу отразиться
    на карточке — иначе кандидат «отказан», а колонка кандидата
    молчит об этом до следующей загрузки страницы. Этап меняем только
    для приглашения на интервью и оффера — ровно так же, как это делает
    сервер в setClientDecision; для паузы и отказа этап не меняется.
  */
  function handleDecided(
    applicationId: string,
    decision: ClientDecision,
    rejectionReason?: RejectionReason,
  ) {
    const targetCode = DECISION_TARGET_STAGE_CODE[decision];
    const targetStage = targetCode
      ? stages.find((s) => s.code === targetCode)
      : undefined;

    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== applicationId) return c;
        const outcome =
          decision === "REJECT"
            ? "REJECTED"
            : decision === "HOLD"
              ? "ON_HOLD"
              : "IN_PROGRESS";
        return {
          ...c,
          outcome,
          clientDecision: decision,
          rejectionReason: decision === "REJECT" ? (rejectionReason ?? null) : null,
          rejectedBy: decision === "REJECT" ? "CLIENT" : null,
          ...(targetStage && {
            stageId: targetStage.id,
            stageEnteredAt: new Date(),
          }),
        };
      }),
    );
  }

  /** Отмена отказа на экране сравнения — симметрично handleDecided. */
  function handleUndoReject(applicationId: string) {
    setCards((prev) =>
      prev.map((c) =>
        c.id === applicationId
          ? {
              ...c,
              outcome: "IN_PROGRESS",
              clientDecision: null,
              rejectionReason: null,
              rejectedBy: null,
            }
          : c,
      ),
    );
  }

  // Небольшой порог, иначе клик по имени кандидата превращается в перетаскивание
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /*
    Затухание у края держится не на md:hidden, а на реальном факте
    переполнения. Доска ограничена max-w-4xl на странице вакансии,
    и при пяти-шести этапах не помещается вообще ни на каком экране,
    включая широкий монитор — брейкпоинт прятал подсказку ровно там,
    где она ещё нужна. Заодно гаснет сама, когда доскроллили до конца:
    незачем намекать на то, чего дальше нет.
  */
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
  }, [stages, cards]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  /**
   * Перемещение на этап — общий путь для перетаскивания и для пункта
   * меню «Переместить на этап» на карточке (см. CandidateCard). Второе
   * появилось потому, что перетаскивание на телефоне спорит с прокруткой
   * доски вбок: тащить карточку и листать доску одним и тем же пальцем
   * нельзя, а без перетаскивания раньше сменить этап было нечем.
   */
  function moveCard(applicationId: string, toStageId: string) {
    const card = cards.find((c) => c.id === applicationId);
    if (!card || card.stageId === toStageId) return;

    /*
      В «Представлен клиенту» перетаскиванием не попасть: там нужны
      резюме, согласие и саммари, и проверяет их отдельное действие
      на карточке кандидата.

      Раньше сервер отказывал уже после того, как карточка оптимистично
      уехала: она прыгала в колонку и возвращалась обратно. Выглядело
      как сбой, а не как правило. Теперь останавливаемся до движения
      и говорим, что делать.
    */
    const target = stages.find((s) => s.id === toStageId);
    if (target?.code === "PRESENTED") {
      toast.info("Представить клиенту можно с карточки кандидата", {
        description: "Там проверяются резюме, согласие и саммари",
      });
      return;
    }

    const previousStageId = card.stageId;

    // Оптимистично двигаем сразу: ждать ответа сервера на перетаскивании
    // ощущается как залипание
    setCards((prev) =>
      prev.map((c) =>
        c.id === applicationId
          ? { ...c, stageId: toStageId, stageEnteredAt: new Date() }
          : c,
      ),
    );

    startTransition(async () => {
      const result = await moveStageAction({ applicationId, toStageId });

      if (result.error) {
        // Сервер отказал — возвращаем карточку на место, иначе интерфейс
        // будет врать о том, где кандидат на самом деле
        setCards((prev) =>
          prev.map((c) =>
            c.id === applicationId ? { ...c, stageId: previousStageId } : c,
          ),
        );
        toast.error(result.error);
      }
    });
  }

  /**
   * Перевод выбранных карточек одним действием.
   *
   * Часть перевода может не пройти (возврат назад без комментария,
   * «Представлен клиенту»). Такие карточки возвращаются на место
   * и остаются выбранными: человек дописывает комментарий и повторяет,
   * не собирая выделение заново.
   */
  function moveSelected() {
    const target = stages.find((s) => s.id === bulkStageId);
    if (!target) return;

    if (target.code === "PRESENTED") {
      toast.info("Представить клиенту можно с карточки кандидата", {
        description: "Там проверяются резюме, согласие и саммари",
      });
      return;
    }

    const ids = [...selected].filter((id) => {
      const card = cards.find((c) => c.id === id);
      return card && card.stageId !== target.id;
    });
    if (ids.length === 0) return;

    const previous = new Map(
      ids.map((id) => {
        const card = cards.find((c) => c.id === id)!;
        return [id, { stageId: card.stageId, stageEnteredAt: card.stageEnteredAt }];
      }),
    );

    const now = new Date();
    setCards((prev) =>
      prev.map((c) =>
        previous.has(c.id)
          ? { ...c, stageId: target.id, stageEnteredAt: now }
          : c,
      ),
    );

    const comment = bulkComment.trim() || undefined;

    startTransition(async () => {
      const result = await moveStageBulkAction({
        applicationIds: ids,
        toStageId: target.id,
        comment,
      });

      const failed = new Set(result.failedIds ?? []);
      if (failed.size > 0) {
        setCards((prev) =>
          prev.map((c) => (failed.has(c.id) ? { ...c, ...previous.get(c.id)! } : c)),
        );
      }

      if (result.error) toast.error(result.error);
      else if (result.ok) toast.success(result.ok);

      setSelected(failed);
      if (failed.size === 0) {
        setBulkStageId("");
        setBulkComment("");
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    moveCard(String(active.id), resolveTargetStageId(String(over.id), cards));
  }

  const activeCard = cards.find((c) => c.id === activeId);

  // Хоть одна выбранная карточка едет назад — значит, сервис потребует
  // комментарий, и спросить его надо до отправки
  const bulkTarget = stages.find((s) => s.id === bulkStageId);
  const movingBack =
    bulkTarget != null &&
    [...selected].some((id) => {
      const card = cards.find((c) => c.id === id);
      const from = card && stages.find((s) => s.id === card.stageId);
      return from != null && from.order > bulkTarget.order;
    });

  return (
    <div className={cn((compareEnabled || bulkEnabled) && "pb-16")}>
      <DndContext
        // Без явного id dnd-kit генерирует его сам, и на сервере он
        // получается не тот, что на клиенте — гидратация ругается
        // на несовпадение aria-describedby
        id="pipeline"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/*
          Общая группа нужна, чтобы карточка, переехавшая в другую колонку,
          анимировалась из прежнего места. При смене этапа она меняет
          родителя в разметке, то есть для React это удаление и вставка;
          связать два положения может только общая метка.
        */}
        <LayoutGroup id="pipeline">
          {/* Затухание у правого края — подсказка, что доска шире экрана:
              рамки колонок сами по себе не читаются как «здесь можно
              листать», особенно у новых пользователей. Видимость решает
              canScrollRight, а не ширина экрана (см. эффект выше) */}
          {/*
            Доска — тёмная поверхность внутри светлого кабинета: воронка
            читается как отдельный рабочий стол, а не как продолжение
            страницы.

            text-foreground здесь обязателен. Класс dark переопределяет
            переменные темы, и утилиты вроде text-muted-foreground их
            подхватывают сами. Но обычный текст цвета не объявляет вовсе —
            он наследует его от body, то есть остаётся почти чёрным из
            светлой темы. Без этой строки имя кандидата оказывалось
            тёмным на тёмном, тогда как должность и зарплата рядом
            читались нормально.
          */}
          <div className="dark relative rounded-xl bg-background p-3 text-foreground">
            <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-4">
              {stages.map((stage) => (
                <Column
                  key={stage.id}
                  stage={stage}
                  allStages={stages}
                  cards={cards.filter((c) => c.stageId === stage.id)}
                  hrefBase={hrefBase}
                  draggable={draggable}
                  selectable={compareEnabled || bulkEnabled}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onMoveToStage={moveCard}
                  now={now}
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
        </LayoutGroup>

        <DragOverlay>
          {activeCard ? (
            <div className="rounded-md border bg-background p-3 text-sm shadow-lg">
              <div className="font-medium">{activeCard.candidate.fullName}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/*
        Панель массового перевода. Появляется с первой выбранной
        карточкой: «перевести одного отсюда же» — тот же жест, что
        и «перевести десятерых», и отдельного порога тут не нужно.
      */}
      {bulkEnabled && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-2 text-sm shadow-lg">
            <span className="tabular-nums">Выбрано: {selected.size}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Сбросить
            </Button>

            <Select value={bulkStageId} onValueChange={setBulkStageId}>
              <SelectTrigger size="sm" className="w-52">
                <SelectValue placeholder="Перевести на этап…" />
              </SelectTrigger>
              <SelectContent>
                {stages
                  .filter((s) => s.code !== "PRESENTED")
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Возврат назад сервис принимает только с объяснением —
                спрашиваем его здесь, а не после отказа */}
            {movingBack && (
              <Input
                value={bulkComment}
                onChange={(e) => setBulkComment(e.target.value)}
                placeholder="Что случилось?"
                className="h-8 w-48"
              />
            )}

            <Button
              size="sm"
              onClick={moveSelected}
              disabled={!bulkStageId || (movingBack && !bulkComment.trim())}
            >
              Перевести
            </Button>
          </div>
        </div>
      )}

      {/* Появляется только когда есть с кем сравнивать: одна карточка —
          это просто карточка, сравнение начинается с двух */}
      {compareEnabled && selected.size >= 2 && (
        <div className="fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 text-sm shadow-lg">
            <span>Выбрано: {selected.size}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Сбросить
            </Button>
            <Button size="sm" onClick={() => setCompareOpen(true)}>
              Сравнить →
            </Button>
          </div>
        </div>
      )}

      {/*
        Оверлей, а не подмена доски: сравнить двух-трёх кандидатов —
        быстрая операция, и раньше она стирала весь контекст остальных
        этапов и колонок. Нижний лист держит доску за спиной видимой
        (приглушённой) и закрывается тем же жестом, что и остальные
        оверлеи в кабинете.
      */}
      <Sheet open={compareOpen} onOpenChange={setCompareOpen}>
        <SheetContent
          side="bottom"
          className="h-[88vh] w-full gap-0 overflow-y-auto p-4 sm:max-w-none"
        >
          <SheetTitle className="sr-only">Сравнение кандидатов</SheetTitle>
          <CompareView
            cards={cards.filter((c) => selected.has(c.id))}
            stages={stages}
            hrefBase={hrefBase}
            canDecide={canDecide}
            onExit={() => setCompareOpen(false)}
            onRemove={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                next.delete(id);
                if (next.size < 2) setCompareOpen(false);
                return next;
              })
            }
            onDecided={handleDecided}
            onUndoReject={handleUndoReject}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Column({
  stage,
  allStages,
  cards,
  hrefBase,
  draggable,
  selectable,
  selected,
  onToggleSelect,
  onMoveToStage,
  now,
}: {
  stage: KanbanStage;
  allStages: KanbanStage[];
  cards: KanbanCard[];
  hrefBase: string;
  draggable: boolean;
  /** Момент отрисовки — один на всю доску, см. KanbanBoard. */
  now: number;
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onMoveToStage: (cardId: string, stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-lg border p-2",
        // Скрытые от клиента этапы визуально отделены: рекрутер должен
        // видеть границу, за которой начинается кабинет клиента
        stage.visibleToClient ? "bg-muted/30" : "border-dashed bg-muted/60",
        isOver && "ring-2 ring-primary",
      )}
    >
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{stage.name}</span>
          <Badge variant="secondary">{cards.length}</Badge>
        </div>

        {!stage.visibleToClient && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" />
            не видно клиенту
          </div>
        )}
      </div>

      <SortableContext
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-24 flex-col gap-2">
          {cards.map((card) => (
            <MovingCard
              key={card.id}
              card={card}
              stage={stage}
              allStages={allStages}
              hrefBase={hrefBase}
              draggable={draggable}
              selectable={selectable}
              selected={selected?.has(card.id)}
              onToggleSelect={() => onToggleSelect?.(card.id)}
              onMoveToStage={onMoveToStage}
              now={now}
            />
          ))}
          {cards.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
              Пусто
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

/**
 * Карточка, которая переезжает, а не перескакивает.
 *
 * Обёртка отделена от самой карточки намеренно: перетаскиванием
 * управляет dnd-kit и пишет своё смещение в transform внутреннего узла.
 * Если бы движение положения висело на том же узле, две библиотеки
 * дрались бы за одно свойство прямо во время перетаскивания.
 *
 * Отказ анимации здесь безобиден: карточка просто окажется на новом
 * месте сразу, то есть ровно так, как было до этой правки.
 */
function MovingCard({
  card,
  stage,
  allStages,
  hrefBase,
  draggable,
  selectable,
  selected,
  onToggleSelect,
  onMoveToStage,
  now,
}: {
  card: KanbanCard;
  stage: KanbanStage;
  allStages: KanbanStage[];
  hrefBase: string;
  draggable: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onMoveToStage: (cardId: string, stageId: string) => void;
  /** Момент отрисовки — один на всю доску, см. KanbanBoard. */
  now: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <CandidateCard
        card={card}
        stage={stage}
        allStages={allStages}
        hrefBase={hrefBase}
        draggable={draggable}
        selectable={selectable}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onMoveToStage={onMoveToStage}
        now={now}
      />
    );
  }

  return (
    <motion.div
      layoutId={card.id}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 38,
        // Пружина без ограничения сверху даёт перелёт: карточка проскакивает
        // мимо колонки и возвращается, и это читается как сбой
        mass: 0.7,
      }}
    >
      <CandidateCard
        card={card}
        stage={stage}
        allStages={allStages}
        hrefBase={hrefBase}
        draggable={draggable}
        selectable={selectable}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onMoveToStage={onMoveToStage}
        now={now}
      />
    </motion.div>
  );
}
