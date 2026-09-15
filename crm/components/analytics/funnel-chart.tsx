import type { FunnelStep } from "@/lib/services/analytics/metrics";
import { cn } from "@/lib/utils";

/**
 * Воронка-водопад.
 *
 * Горизонтальные полосы, а не столбики: у этапов длинные названия,
 * и вертикальная сетка заставляет их наклонять или сокращать.
 * Конверсия показана между шагами — именно она отвечает на вопрос
 * «где мы теряем», ради которого воронку и смотрят.
 */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.reached), 1);

  if (steps.every((s) => s.reached === 0)) {
    return (
      <p className="text-sm text-muted-foreground">
        Пока нет данных: воронка появится, когда кандидаты пойдут по этапам.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {steps.map((step, index) => (
        <div key={step.code}>
          {/* Конверсия стоит между полосами: это переход, а не этап */}
          {index > 0 && (
            <div className="flex items-center gap-2 py-1 pl-4 text-xs">
              <span className="text-muted-foreground">↓</span>
              <span
                className={cn(
                  "tabular-nums",
                  step.conversionFromPrevious !== null &&
                    step.conversionFromPrevious < 40 &&
                    "font-medium text-destructive",
                )}
              >
                {step.conversionFromPrevious === null
                  ? "—"
                  : `${step.conversionFromPrevious}%`}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/*
              Колонка названий росла вместе с экраном не всегда: раньше
              она была 176px при любой ширине, и «Финальный этап /
              тестовое» обрезался многоточием. Пока страница упиралась
              в 1152px, это было незаметно; когда полосы растянулись
              на всю ширину, стало видно, что место есть у полосы,
              а не хватает подписи. Отдаём подписи часть ширины там,
              где она появилась.
            */}
            <div
              className="w-44 shrink-0 truncate text-sm xl:w-64 2xl:w-72"
              title={step.name}
            >
              {step.name}
            </div>

            <div className="h-8 flex-1 rounded bg-muted">
              <div
                className="flex h-full items-center rounded bg-primary/80 px-2 text-xs font-medium text-primary-foreground transition-all"
                style={{ width: `${Math.max((step.reached / max) * 100, 4)}%` }}
              >
                {step.reached > 0 && step.reached}
              </div>
            </div>

            <div className="w-10 shrink-0 text-right text-sm tabular-nums">
              {step.reached}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
