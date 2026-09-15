/**
 * Экспресс-аудит: содержание и расчёт.
 *
 * Проверяется не «функция вернула число», а то, за что агентство
 * отвечает перед человеком, который прошёл аудит: что полосы
 * покрывают весь диапазон, что советы даются по слабым этапам,
 * и что выжимка для рекрутера содержит всё нужное для разговора.
 */
import { describe, expect, it } from "vitest";

import {
  answeredCount,
  bandFor,
  blockScore,
  isComplete,
  summarize,
  totalScore,
  weakStagesTotal,
  weakestStages,
  type Answers,
} from "@/lib/audit/score";
import {
  BANDS,
  BLOCKS,
  MAX_SCORE,
  SCALE,
  STAGES,
  type Score,
} from "@/lib/audit/stages";

/** Ответы одним баллом на все этапы. */
function все(value: Score): Answers {
  return Object.fromEntries(STAGES.map((s) => [s.number, value]));
}

describe("содержание аудита", () => {
  it("двенадцать этапов подряд, без пропусков и повторов", () => {
    expect(STAGES).toHaveLength(12);
    expect(STAGES.map((s) => s.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("у каждого этапа ровно три критерия и заполненные тексты", () => {
    for (const s of STAGES) {
      expect(s.criteria, s.name).toHaveLength(3);
      for (const c of s.criteria) expect(c.length, s.name).toBeGreaterThan(10);
      expect(s.quickAction.length, s.name).toBeGreaterThan(10);
      expect(s.keyQuestion.length, s.name).toBeGreaterThan(10);
    }
  });

  it("блоки покрывают все этапы по три, как в методичке", () => {
    expect(BLOCKS).toHaveLength(4);
    const покрытые = BLOCKS.flatMap((b) =>
      Array.from({ length: b.to - b.from + 1 }, (_, i) => b.from + i),
    );
    expect(покрытые).toEqual(STAGES.map((s) => s.number));
  });

  it("максимум равен двенадцати этапам по два балла", () => {
    expect(MAX_SCORE).toBe(24);
    expect(totalScore(все(2))).toBe(MAX_SCORE);
  });

  it("шкала из трёх ступеней от нуля до двух", () => {
    expect(SCALE.map((s) => s.value)).toEqual([0, 1, 2]);
  });
});

describe("полосы результата", () => {
  it("покрывают весь диапазон без дыр", () => {
    // Дырка между полосами означала бы, что при каком-то балле
    // человек не увидит вообще никакого разбора
    for (let score = 0; score <= MAX_SCORE; score++) {
      expect(bandFor(score), `балл ${score}`).toBeDefined();
    }
  });

  it("границы полос стыкуются встык", () => {
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].from).toBe(BANDS[i - 1].to + 1);
    }
    expect(BANDS[0].from).toBe(0);
    expect(BANDS[BANDS.length - 1].to).toBe(MAX_SCORE);
  });

  it("края диапазона попадают в крайние полосы", () => {
    expect(bandFor(0).title).toBe(BANDS[0].title);
    expect(bandFor(MAX_SCORE).title).toBe(BANDS[BANDS.length - 1].title);
  });

  it("выход за границы прижимается к краю, а не падает", () => {
    expect(bandFor(-5)).toBe(BANDS[0]);
    expect(bandFor(999)).toBe(BANDS[BANDS.length - 1]);
  });

  it("границы взяты из методички", () => {
    expect(bandFor(8).title).toBe("Найм работает в ручном режиме");
    expect(bandFor(9).title).toBe(
      "Отдельные процессы есть, но цепочка разрывается",
    );
    expect(bandFor(17).title).toBe(
      "Отдельные процессы есть, но цепочка разрывается",
    );
    expect(bandFor(18).title).toBe("Система сформирована");
  });
});

describe("подсчёт по мере заполнения", () => {
  it("пустые ответы дают ноль и незавершённость", () => {
    expect(totalScore({})).toBe(0);
    expect(answeredCount({})).toBe(0);
    expect(isComplete({})).toBe(false);
  });

  it("итог растёт по мере заполнения, а не прыгает в конце", () => {
    expect(totalScore({ 1: 2 })).toBe(2);
    expect(totalScore({ 1: 2, 2: 1 })).toBe(3);
  });

  it("завершённость требует всех двенадцати", () => {
    const почти: Answers = { ...все(1) };
    delete почти[12];
    expect(answeredCount(почти)).toBe(11);
    expect(isComplete(почти)).toBe(false);
    expect(isComplete(все(1))).toBe(true);
  });

  it("ноль отличается от незаполненного при подсчёте заполненных", () => {
    // Иначе честный ноль читался бы как «человек не ответил»
    expect(answeredCount({ 1: 0 })).toBe(1);
  });

  it("итог блока считается по своим трём этапам", () => {
    const a: Answers = { 1: 2, 2: 1, 3: 0, 4: 2 };
    expect(blockScore(a, 1, 3)).toBe(3);
    expect(blockScore(a, 4, 6)).toBe(2);
  });
});

describe("слабые этапы", () => {
  it("возвращает три самых слабых", () => {
    const a: Answers = { ...все(2), 3: 0, 7: 1, 11: 0, 5: 1 };
    const weak = weakestStages(a);
    expect(weak.map((w) => w.number)).toEqual([3, 11, 5]);
  });

  it("при равных баллах побеждает более ранний этап", () => {
    // Чинить найм с конца бессмысленно: слабый этап выше по потоку
    // сам создаёт проблемы на всех следующих
    const a: Answers = { ...все(2), 9: 0, 2: 0 };
    expect(weakestStages(a).map((w) => w.number)).toEqual([2, 9]);
  });

  it("этапы с двумя баллами не попадают в список никогда", () => {
    // Даже если слабых меньше трёх: советовать чинить работающий
    // этап значит обесценить весь разбор
    const a: Answers = { ...все(2), 4: 1 };
    expect(weakestStages(a)).toHaveLength(1);
    expect(weakestStages(все(2))).toHaveLength(0);
  });

  it("незаполненные этапы не считаются слабыми", () => {
    // Пустой ответ это не ноль: человек мог до него не дойти
    expect(weakestStages({ 1: 1 })).toHaveLength(1);
  });

  it("несёт с собой быстрое действие из методички", () => {
    const weak = weakestStages({ 1: 0 });
    expect(weak[0].quickAction).toBe(STAGES[0].quickAction);
  });
});

describe("выжимка для агентства", () => {
  it("содержит балл, зрелость и слабые этапы", () => {
    const a: Answers = { ...все(1), 3: 0 };
    const текст = summarize(a);

    expect(текст).toContain("11 из 24");
    expect(текст).toContain("Отдельные процессы есть");
    expect(текст).toContain("3. Рыночная проверка (0)");
  });

  it("сохраняет все оценки, а не только слабые", () => {
    // Рекрутер должен видеть картину целиком, не переспрашивая клиента
    const текст = summarize(все(2));
    for (const s of STAGES) expect(текст).toContain(`${s.number}=2`);
  });

  it("не врёт про слабые этапы, когда их нет", () => {
    expect(summarize(все(2))).toContain("Этапов с оценкой ниже 2 нет");
  });

  it("помечает незаполненные прочерком", () => {
    expect(summarize({ 1: 2 })).toContain("2=-");
  });
});

describe("сколько этапов просело всего", () => {
  it("считает все ниже двух, а не только показанные три", () => {
    // Полина заметила это на своём результате: при семи единицах
    // в тройку попадали три самых ранних, и остальные четыре
    // человек не видел вовсе
    const a: Answers = { ...все(2), 1: 1, 2: 1, 3: 1, 5: 1, 7: 1, 9: 1, 11: 1 };
    expect(weakStagesTotal(a)).toBe(7);
    expect(weakestStages(a)).toHaveLength(3);
  });

  it("ноль, когда всё по двойке", () => {
    expect(weakStagesTotal(все(2))).toBe(0);
  });

  it("незаполненные не считаются просевшими", () => {
    expect(weakStagesTotal({ 1: 0 })).toBe(1);
  });

  it("в выжимке агентству идут все просевшие, а не тройка", () => {
    // Рекрутер на разговоре должен видеть картину целиком
    const a: Answers = { ...все(2), 1: 1, 2: 1, 3: 1, 5: 1, 7: 1 };
    const текст = summarize(a);
    for (const n of [1, 2, 3, 5, 7]) {
      expect(текст).toContain(`${n}. `);
    }
  });
});
