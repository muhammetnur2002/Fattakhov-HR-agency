/**
 * Логика доски, вынесенная из компонента.
 *
 * Поймано на живом прогоне: карточка, бро́шенная на другую карточку,
 * а не в пустое место колонки, отправляла на сервер id заявки вместо
 * id этапа — и перевод отклонялся. Тестами интерфейса это не ловится,
 * поэтому решение вынесено в чистую функцию.
 */
import { describe, expect, it } from "vitest";

import {
  daysOnStage,
  isOverdue,
  resolveTargetStageId,
  type KanbanCard,
  type KanbanStage,
} from "@/components/kanban/types";

const cards = [
  { id: "app_1", stageId: "stage_longlist" },
  { id: "app_2", stageId: "stage_screening" },
];

describe("куда бросили карточку", () => {
  it("бросок в пустое место колонки — это сам этап", () => {
    expect(resolveTargetStageId("stage_screening", cards)).toBe(
      "stage_screening",
    );
  });

  it("бросок на другую карточку — это её этап", () => {
    expect(resolveTargetStageId("app_2", cards)).toBe("stage_screening");
  });

  it("бросок на карточку своего же этапа не меняет этап", () => {
    expect(resolveTargetStageId("app_1", cards)).toBe("stage_longlist");
  });

  it("неизвестный id возвращается как есть — сервер отклонит сам", () => {
    expect(resolveTargetStageId("что-то_чужое", cards)).toBe("что-то_чужое");
  });
});

function makeCard(overrides: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id: "app_1",
    stageId: "stage_1",
    stageEnteredAt: new Date(),
    outcome: "IN_PROGRESS",
    presentedAt: null,
    presentationSummary: null,
    rejectionReason: null,
    rejectedBy: null,
    clientDecision: null,
    candidate: {
      id: "cand_1",
      fullName: "Иван Иванов",
      currentPosition: null,
      currentCompany: null,
      city: null,
      salaryExpectation: null,
      consentStatus: "GIVEN",
    },
    _count: { comments: 0 },
    ...overrides,
  };
}

const stage: KanbanStage = {
  id: "stage_1",
  code: "PRESENTED",
  name: "Представлен клиенту",
  order: 3,
  visibleToClient: true,
  slaHours: 72,
};

describe("просрочка на этапе (BR-9)", () => {
  // «Сейчас» задаём числом: доска получает его со страницы, а не берёт
  // из часов сама, иначе серверная разметка и гидратация расходятся
  const NOW = new Date("2026-08-10T12:00:00Z").getTime();

  function hoursAgo(h: number): Date {
    return new Date(NOW - h * 3_600_000);
  }

  it("в пределах норматива просрочки нет", () => {
    expect(
      isOverdue(makeCard({ stageEnteredAt: hoursAgo(20) }), stage, NOW),
    ).toBe(false);
  });

  it("за пределами норматива — просрочка", () => {
    expect(
      isOverdue(makeCard({ stageEnteredAt: hoursAgo(100) }), stage, NOW),
    ).toBe(true);
  });

  it("у этапа без норматива просрочки не бывает", () => {
    expect(
      isOverdue(
        makeCard({ stageEnteredAt: hoursAgo(1000) }),
        { ...stage, slaHours: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("отклонённый кандидат не считается просроченным", () => {
    // Иначе доска краснела бы от кандидатов, по которым решение уже принято
    expect(
      isOverdue(
        makeCard({ stageEnteredAt: hoursAgo(1000), outcome: "REJECTED" }),
        stage,
        NOW,
      ),
    ).toBe(false);
  });

  it("дни на этапе считаются вниз", () => {
    expect(daysOnStage(hoursAgo(47), NOW)).toBe(1);
    expect(daysOnStage(hoursAgo(1), NOW)).toBe(0);
  });

  /*
    Ровно то расхождение, ради которого «сейчас» стало аргументом:
    один и тот же набор данных, отрисованный дважды с разницей
    в секунду, должен дать одинаковую разметку. Раньше карточка
    на границе норматива успевала покраснеть между сервером
    и гидратацией.
  */
  it("отрисовка в два прохода даёт один ответ, если момент один", () => {
    const card = makeCard({ stageEnteredAt: hoursAgo(72) });
    const server = isOverdue(card, stage, NOW);
    const hydration = isOverdue(card, stage, NOW);

    expect(hydration).toBe(server);
    // А с разными моментами — уже нет: без общего «сейчас» доска
    // именно так и вела себя
    expect(isOverdue(card, stage, NOW + 60_000)).not.toBe(server);
  });
});
