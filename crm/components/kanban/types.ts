import type {
  ApplicationOutcome,
  ClientDecision,
  RejectionReason,
  RejectionSide,
} from "@/lib/generated/prisma/enums";

export type KanbanStage = {
  id: string;
  code: string;
  name: string;
  order: number;
  visibleToClient: boolean;
  slaHours: number | null;
};

export type KanbanCard = {
  id: string;
  stageId: string;
  stageEnteredAt: Date;
  outcome: ApplicationOutcome;
  presentedAt: Date | null;
  presentationSummary: string | null;
  rejectionReason: RejectionReason | null;
  rejectedBy: RejectionSide | null;
  clientDecision: ClientDecision | null;
  candidate: {
    id: string;
    fullName: string;
    currentPosition: string | null;
    currentCompany: string | null;
    city: string | null;
    // Именно number, а не Decimal: доска — клиентский компонент,
    // Prisma-объекты через границу сервер-клиент не проходят
    salaryExpectation: number | null;
    consentStatus: string;
  };
  _count: { comments: number };
};

/**
 * Куда на самом деле бросили карточку.
 *
 * dnd-kit отдаёт id того, над чем отпустили мышь, а это может быть
 * и колонка, и другая карточка — карточки тоже droppable. Без
 * разворачивания к этапу сервер получает идентификатор заявки
 * и справедливо отвечает «этап не принадлежит этой вакансии».
 */
export function resolveTargetStageId(
  overId: string,
  cards: Pick<KanbanCard, "id" | "stageId">[],
): string {
  const overCard = cards.find((c) => c.id === overId);
  return overCard ? overCard.stageId : overId;
}

/**
 * Сколько часов карточка на этапе — для подсветки просрочки (BR-9).
 *
 * «Сейчас» приходит аргументом, а не берётся из часов здесь. Доска —
 * клиентский компонент, то есть её разметку сначала рисует сервер,
 * а потом повторяет браузер при гидратации. Собственный вызов часов
 * означал бы два разных момента на два прохода: карточка, у которой
 * норматив истекает прямо сейчас, приезжала бы с сервера обычной,
 * а после гидратации краснела — расхождение разметки и ошибка React.
 * Тот же приём и по той же причине — в CalendarView.
 */
export function hoursOnStage(enteredAt: Date, now: number): number {
  return (now - new Date(enteredAt).getTime()) / 3_600_000;
}

export function isOverdue(
  card: KanbanCard,
  stage: KanbanStage,
  now: number,
): boolean {
  if (!stage.slaHours) return false;
  if (card.outcome !== "IN_PROGRESS") return false;
  return hoursOnStage(card.stageEnteredAt, now) > stage.slaHours;
}

export function daysOnStage(enteredAt: Date, now: number): number {
  return Math.floor(hoursOnStage(enteredAt, now) / 24);
}
