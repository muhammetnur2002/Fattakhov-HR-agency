"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { OnboardingState } from "@/app/(onboarding)/onboarding/actions";
import { acceptTariffAction } from "@/app/(onboarding)/onboarding/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  feePerHire,
  formatMoney,
  monthlyCost,
  prepaymentAmount,
  subscriptionBreakEven,
  TARIFF_PRESETS,
  type TariffPreset,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={disabled || pending}>
      {pending ? "Отправляем…" : "Выбрать эти условия"}
    </Button>
  );
}

/**
 * Живой калькулятор из ТЗ 12.1.
 *
 * Смысл экрана — снять вопрос «сколько это будет стоить» до переговоров:
 * клиент вводит свою вилку и сразу видит цену по каждой модели.
 * Расчёт идёт на клиенте, чтобы цифры менялись без задержки.
 */
export function TariffPicker() {
  const [salary, setSalary] = useState(150_000);
  const [bonus, setBonus] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    acceptTariffAction,
    {},
  );

  const context = { monthlySalary: salary, annualBonus: bonus };

  // Для точки окупаемости подписки сравниваем с самой дешёвой разовой моделью
  const perHireFees = TARIFF_PRESETS.map((p) => feePerHire(p, context)).filter(
    (f): f is number => f !== null && f > 0,
  );
  const cheapestPerHire = perHireFees.length ? Math.min(...perHireFees) : null;

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Ваша вилка</h2>
          <p className="text-sm text-muted-foreground">
            Укажите примерный оклад по типичной для вас позиции — расчёт
            обновится сразу.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="salary">Оклад в месяц, ₽</Label>
            <Input
              id="salary"
              type="number"
              min={0}
              step={10_000}
              value={salary}
              onChange={(e) => setSalary(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bonus">Годовой бонус, ₽</Label>
            <Input
              id="bonus"
              type="number"
              min={0}
              step={50_000}
              value={bonus}
              onChange={(e) => setBonus(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="text-xs text-muted-foreground">
              Влияет только на модель с процентом от годового дохода
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Условия сотрудничества</h2>

        <div className="grid gap-3 lg:grid-cols-2">
          {TARIFF_PRESETS.map((preset) => (
            <TariffCard
              key={preset.key}
              preset={preset}
              salary={salary}
              bonus={bonus}
              cheapestPerHire={cheapestPerHire}
              selected={selected === preset.key}
              onSelect={() => setSelected(preset.key)}
            />
          ))}
        </div>
      </section>

      <input type="hidden" name="presetKey" value={selected ?? ""} />

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton disabled={!selected} />
        <p className="text-sm text-muted-foreground">
          {selected
            ? "Агентство подтвердит условия, после этого можно отправлять заявки."
            : "Выберите один из вариантов выше."}
        </p>
      </div>
    </form>
  );
}

function TariffCard({
  preset,
  salary,
  bonus,
  cheapestPerHire,
  selected,
  onSelect,
}: {
  preset: TariffPreset;
  salary: number;
  bonus: number;
  cheapestPerHire: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const context = { monthlySalary: salary, annualBonus: bonus };
  const perHire = feePerHire(preset, context);
  const monthly = monthlyCost(preset);
  const breakEven =
    monthly !== null ? subscriptionBreakEven(monthly, cheapestPerHire) : null;

  const headlineAmount = perHire ?? monthly ?? 0;
  const prepayment = prepaymentAmount(headlineAmount, preset.prepaymentPercent);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div>
          <div className="font-medium">{preset.title}</div>
          <div className="text-xs text-muted-foreground">{preset.bestFor}</div>
        </div>

        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatMoney(headlineAmount)}
          </div>
          <div className="text-xs text-muted-foreground">
            {perHire !== null ? "за закрытую позицию" : "в месяц"}
          </div>
        </div>

        {breakEven !== null && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs">
            Выгоднее разовой оплаты начиная с{" "}
            <span className="font-medium">
              {breakEven} {pluralHire(breakEven)}
            </span>{" "}
            в месяц
          </div>
        )}

        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Гарантия замены</dt>
            <dd>{preset.guaranteeDays} дней</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Предоплата</dt>
            <dd>
              {preset.prepaymentPercent > 0
                ? `${preset.prepaymentPercent}% — ${formatMoney(prepayment)}`
                : "Нет"}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">{preset.paymentTerms}</p>
      </CardContent>
    </Card>
  );
}

function pluralHire(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "закрытия";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "закрытий";
  return "закрытий";
}
