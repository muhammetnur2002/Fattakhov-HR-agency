"use client";

import { Check, RotateCcw } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { AuditLeadForm } from "./audit-lead-form";
import { Button } from "@/components/ui/button";
import {
  answeredCount,
  bandFor,
  blockScore,
  isComplete,
  totalScore,
  weakStagesTotal,
  weakestStages,
  type Answers,
} from "@/lib/audit/score";
import {
  clear,
  getServerSnapshot,
  getSnapshot,
  parse,
  save,
  subscribe,
} from "@/lib/audit/storage";
import {
  BLOCKS,
  MAX_SCORE,
  SCALE,
  STAGES,
  type Score,
} from "@/lib/audit/stages";
import { cn } from "@/lib/utils";

/**
 * Экспресс-аудит системы найма.
 *
 * Двенадцать этапов, оценка 0-2 на каждом, максимум 24 балла - всё
 * по методичке агентства. Веб-версия отличается от печатной ровно
 * двумя вещами, и обе в пользу человека: балл считается сам, а три
 * слабых этапа находятся сами. В бумаге это делают руками, и именно
 * на этом бросают заполнение.
 *
 * Состояние живёт не в React, а в localStorage (lib/audit/storage):
 * черновик обязан переживать обновление страницы, иначе двенадцать
 * заполненных блоков теряются одним случайным нажатием.
 */
export function AuditTool() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Разбор один раз на изменение строки: снимок хранилища строковый
  // намеренно, чтобы React мог сравнить его по значению
  const answers = useMemo(() => parse(raw), [raw]);

  const filled = answeredCount(answers);
  const score = totalScore(answers);
  const done = isComplete(answers);

  function set(stage: number, value: Score) {
    save({ ...answers, [stage]: value });
  }

  return (
    <div>
      <ProgressBar filled={filled} score={score} done={done} />

      <Scale />

      <div className="mt-12 space-y-12">
        {BLOCKS.map((block) => (
          <section key={block.title}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b pb-3">
              <h2 className="text-lg font-medium">
                {block.title}
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">
                {blockScore(answers, block.from, block.to)} из 6 баллов
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {STAGES.filter(
                (s) => s.number >= block.from && s.number <= block.to,
              ).map((stage) => (
                <article
                  key={stage.number}
                  className={cn(
                    "rounded-xl border p-6 transition-colors",
                    answers[stage.number] === undefined
                      ? "bg-card"
                      : "border-foreground/20 bg-muted/40",
                  )}
                >
                  <div className="flex gap-4">
                    <div className="mt-0.5 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
                      {String(stage.number).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg leading-snug font-medium text-balance">
                        {stage.question}
                      </h3>

                      <ul className="mt-4 space-y-2">
                        {stage.criteria.map((c) => (
                          <li
                            key={c}
                            className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                          >
                            <span
                              aria-hidden
                              className="mt-2 size-1 shrink-0 rounded-full bg-foreground/35"
                            />
                            {c}
                          </li>
                        ))}
                      </ul>

                      <fieldset className="mt-6">
                        <legend className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                          Ваша оценка
                        </legend>
                        <div className="mt-2.5 flex gap-2">
                          {SCALE.map((option) => {
                            const active = answers[stage.number] === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => set(stage.number, option.value)}
                                title={option.title}
                                className={cn(
                                  "size-11 rounded-lg border text-base font-semibold tabular-nums transition-colors",
                                  active
                                    ? "border-brand-graphite bg-brand-graphite text-white"
                                    : "bg-background hover:border-foreground/40",
                                )}
                              >
                                {option.value}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>

                      {/* Совет показывается только тем, кому он нужен:
                          висеть под каждым этапом он бы перестал читаться */}
                      {answers[stage.number] !== undefined &&
                      answers[stage.number]! < 2 ? (
                        <div className="mt-5 rounded-lg bg-secondary p-4">
                          <div className="text-xs font-medium tracking-[0.12em] uppercase opacity-60">
                            Быстрое действие
                          </div>
                          <p className="mt-1.5 text-sm leading-relaxed">
                            {stage.quickAction}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Result answers={answers} done={done} onReset={clear} />
    </div>
  );
}

/**
 * Полоса прогресса, прилипшая к верху.
 *
 * Показывает и заполненность, и текущий балл. Балл виден сразу,
 * а не только в конце: он и есть повод дойти до конца.
 */
function ProgressBar({
  filled,
  score,
  done,
}: {
  filled: number;
  score: number;
  done: boolean;
}) {
  const percent = (filled / STAGES.length) * 100;

  return (
    <div className="sticky top-16 z-30 -mx-5 border-y bg-background/90 px-5 py-3 backdrop-blur">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">
          {done ? "Аудит пройден" : `Пройдено ${filled} из ${STAGES.length}`}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {score} из {MAX_SCORE} баллов
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-brand-graphite transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Scale() {
  return (
    <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
      {SCALE.map((s) => (
        <div key={s.value} className="bg-card p-5">
          <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
          <div className="mt-1 font-medium">{s.title}</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {s.note}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Результат.
 *
 * До заполнения всех двенадцати этапов показывается заглушка, а не
 * промежуточный балл крупно: недозаполненный аудит выдал бы человеку
 * заниженную зрелость и напугал бы цифрой, которая ничего не значит.
 */
function Result({
  answers,
  done,
  onReset,
}: {
  answers: Answers;
  done: boolean;
  onReset: () => void;
}) {
  const score = totalScore(answers);
  const band = bandFor(score);
  const weak = weakestStages(answers);
  const weakTotal = weakStagesTotal(answers);
  const hidden = weakTotal - weak.length;

  if (!done) {
    return (
      <div
        id="result"
        className="mt-14 rounded-xl border border-dashed p-8 text-center"
      >
        <h2 className="text-lg font-medium">Результат появится здесь</h2>
        <p className="mx-auto mt-2 max-w-md leading-relaxed text-muted-foreground">
          Оцените все {STAGES.length} этапов, и мы посчитаем зрелость системы
          и покажем три этапа, с которых стоит начать.
        </p>
      </div>
    );
  }

  return (
    <div id="result" className="mt-14 scroll-mt-32">
      <div className="overflow-hidden rounded-2xl bg-brand-graphite text-white">
        <div className="p-8 md:p-10">
          <div className="text-xs font-medium tracking-[0.14em] text-white/65 uppercase">
            Ваш результат
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-6xl font-semibold tracking-tight tabular-nums">
              {score}
            </span>
            <span className="text-lg text-white/70">из {MAX_SCORE}</span>
          </div>

          <h2 className="mt-6 text-2xl font-medium tracking-tight text-balance md:text-3xl">
            {band.title}
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-white/75">
            {band.body}
          </p>

          <div className="mt-6 border-t border-white/12 pt-5">
            <span className="text-xs font-medium tracking-[0.12em] text-white/65 uppercase">
              С чего начать
            </span>
            <p className="mt-1.5 leading-relaxed">{band.start}</p>
          </div>
        </div>
      </div>

      {weak.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-xl font-medium tracking-tight">
            С чего начать
          </h3>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
            {hidden > 0 ? (
              <>
                Просели {weakTotal} {склонениеЭтапов(weakTotal)} из{" "}
                {STAGES.length}. Здесь первые{" "}
                {weak.length}: при равных баллах вперёд идёт этап раньше по
                цепочке, потому что слабое место в начале само создаёт
                проблемы на всех следующих. Остальные{" "}
                {hidden} {склонениеЭтапов(hidden)} видно по вашим оценкам
                выше.
              </>
            ) : (
              <>
                Порядок не по алфавиту: сначала идут этапы раньше по цепочке.
                Слабое место в начале само создаёт проблемы на всех следующих
                этапах, и чинить найм с конца бессмысленно.
              </>
            )}
          </p>

          <div className="mt-6 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
            {weak.map((w) => (
              <div key={w.number} className="flex flex-col bg-card p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase tabular-nums">
                    Этап {String(w.number).padStart(2, "0")}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {w.score}
                  </span>
                </div>
                <div className="mt-2 text-lg font-medium">{w.name}</div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {w.quickAction}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 flex gap-3 rounded-xl border bg-card p-6">
          <Check className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="leading-relaxed">
            Ни один этап не получил оценку ниже двух. Дальше работают не
            с наличием процессов, а с их скоростью и конверсией: где воронка
            проседает и сколько стоит каждое закрытие.
          </p>
        </div>
      )}

      <div className="mt-10">
        <AuditLeadForm
          answers={answers}
          score={score}
          band={band.title}
          weakCount={weak.length}
        />
      </div>

      <div className="mt-6 text-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-muted-foreground"
        >
          <RotateCcw className="size-4" />
          Пройти заново
        </Button>
      </div>
    </div>
  );
}

/** «Просели 7 этап» читается как опечатка и рушит доверие к расчёту. */
function склонениеЭтапов(n: number): string {
  const д = n % 10;
  const с = n % 100;
  if (д === 1 && с !== 11) return "этап";
  if (д >= 2 && д <= 4 && (с < 12 || с > 14)) return "этапа";
  return "этапов";
}
