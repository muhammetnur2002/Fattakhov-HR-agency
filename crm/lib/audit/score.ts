/**
 * Подсчёт результата экспресс-аудита.
 *
 * Чистые функции без обращения к БД и без React: этот же расчёт
 * показывается человеку на экране и уходит в заявку агентству.
 * Если бы он жил в компоненте, версия на экране и версия в письме
 * разошлись бы на первой же правке, и разговор с клиентом начался
 * бы с выяснения, какой цифре верить.
 */
import { BANDS, MAX_SCORE, STAGES, type Band, type Score } from "./stages";

/** Ответы: номер этапа → оценка. Незаполненных может не быть вовсе. */
export type Answers = Partial<Record<number, Score>>;

export function answeredCount(answers: Answers): number {
  return STAGES.filter((s) => answers[s.number] !== undefined).length;
}

export function isComplete(answers: Answers): boolean {
  return answeredCount(answers) === STAGES.length;
}

/**
 * Сумма баллов.
 *
 * Незаполненные этапы считаются нулём осознанно: промежуточный итог
 * должен расти по мере заполнения, а не прыгать в конце. Показывать
 * этот итог как окончательный можно только при isComplete.
 */
export function totalScore(answers: Answers): number {
  return STAGES.reduce((sum, s) => sum + (answers[s.number] ?? 0), 0);
}

/** Итог блока из трёх этапов, как в методичке: из 6 баллов. */
export function blockScore(answers: Answers, from: number, to: number): number {
  let sum = 0;
  for (let n = from; n <= to; n++) sum += answers[n] ?? 0;
  return sum;
}

/**
 * Полоса результата.
 *
 * Никогда не возвращает undefined: полосы покрывают весь диапазон
 * от 0 до максимума, и это проверено тестом. Выход за границы
 * прижимается к краю, потому что человеку нужен разбор, а не ошибка.
 */
export function bandFor(score: number): Band {
  const clamped = Math.min(Math.max(score, 0), MAX_SCORE);
  return (
    BANDS.find((b) => clamped >= b.from && clamped <= b.to) ??
    BANDS[BANDS.length - 1]
  );
}

export type WeakStage = {
  number: number;
  name: string;
  score: Score;
  quickAction: string;
};

/**
 * Три самых слабых этапа.
 *
 * При равных баллах побеждает тот, что раньше в цепочке: чинить найм
 * с конца бессмысленно, потому что слабый этап выше по потоку сам
 * создаёт проблемы на всех следующих. Это не косметика сортировки,
 * а суть совета.
 *
 * Этапы с двумя баллами не попадают в список никогда, даже если
 * заполнено меньше трёх слабых: предлагать чинить работающий этап
 * значит обесценить весь разбор.
 */
export function weakestStages(answers: Answers, limit = 3): WeakStage[] {
  return allWeakStages(answers).slice(0, limit);
}

/**
 * Сколько этапов всего просело.
 *
 * Нужно, чтобы не выдавать три показанных за полную картину. Если
 * единицу получили семь этапов, в тройку попадут три самых ранних,
 * а человек решит, что остальные в порядке, и починит четверть
 * проблемы, считая, что починил всё.
 */
export function weakStagesTotal(answers: Answers): number {
  return allWeakStages(answers).length;
}

function allWeakStages(answers: Answers): WeakStage[] {
  return STAGES.filter((s) => {
    const value = answers[s.number];
    return value !== undefined && value < 2;
  })
    .map((s) => ({
      number: s.number,
      name: s.name,
      score: answers[s.number] as Score,
      quickAction: s.quickAction,
    }))
    .sort((a, b) => a.score - b.score || a.number - b.number);
}

/**
 * Текстовая выжимка результата для заявки агентству.
 *
 * Уходит в поле заметки лида: рекрутер должен открыть заявку и сразу
 * увидеть, о чём говорить, не переспрашивая цифры у клиента.
 */
export function summarize(answers: Answers): string {
  const score = totalScore(answers);
  const band = bandFor(score);
  // Рекрутеру уходят все просевшие этапы, а не показанная тройка:
  // на разговоре он должен видеть картину целиком
  const weak = allWeakStages(answers);

  const строки = [
    `Экспресс-аудит: ${score} из ${MAX_SCORE} баллов.`,
    `Зрелость: ${band.title}.`,
  ];

  if (weak.length > 0) {
    строки.push(
      "Слабые этапы: " +
        weak.map((w) => `${w.number}. ${w.name} (${w.score})`).join("; ") +
        ".",
    );
  } else {
    строки.push("Этапов с оценкой ниже 2 нет.");
  }

  строки.push(
    "Все оценки: " +
      STAGES.map((s) => `${s.number}=${answers[s.number] ?? "-"}`).join(", "),
  );

  return строки.join("\n");
}
