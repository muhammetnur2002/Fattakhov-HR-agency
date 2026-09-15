"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INHOUSE_ROLES,
  TARIFFS,
  inhouseMonthlyCost,
  savingsPercent,
} from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";
import { cn, NO_NUMBER_SPINNER } from "@/lib/utils";

/**
 * Расчёт на своих числах.
 *
 * Разбор выше построен на окладах Казани и Москвы, и это его слабое
 * место: у человека из другого города оклады другие, и весь расчёт
 * для него — «цифры агентства». Раздел сам обещает пересчитать
 * на диагностике, то есть предлагает подождать звонка ради арифметики,
 * которую человек хочет сделать прямо сейчас.
 *
 * Поэтому здесь он подставляет свои оклады и своё число вакансий
 * и получает свою разницу. Формулы те же самые, из lib/marketing —
 * иначе калькулятор однажды разойдётся с разбором на той же странице.
 */
export function CostCalculator() {
  const [salaries, setSalaries] = useState(() =>
    INHOUSE_ROLES.map((r) => String(r.salary)),
  );
  const [slots, setSlots] = useState(
    String(TARIFFS.find((t) => t.recommended)?.slots ?? 3),
  );

  const roles = INHOUSE_ROLES.map((role, i) => ({
    ...role,
    // Пустое поле — ноль, а не NaN: иначе стёртый оклад превращает
    // весь расчёт в «NaN ₽» и выглядит как поломка сайта
    salary: Math.max(0, Number(salaries[i]) || 0),
  }));

  const inhouse = inhouseMonthlyCost(roles);
  const tariff =
    TARIFFS.find((t) => String(t.slots) === slots) ?? TARIFFS[0];

  const monthlyDiff = inhouse.total - tariff.price;
  const percent = savingsPercent(inhouse.total, tariff.price);

  return (
    <div className="mt-10 rounded-2xl border bg-card p-6 md:p-8">
      <div className="max-w-2xl">
        <h3 className="text-2xl font-semibold tracking-tight">
          Посчитайте на своих числах
        </h3>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Оклады выше — для Казани и Москвы. Подставьте свои, и разница
          пересчитается сразу, без диагностики и звонка.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INHOUSE_ROLES.map((role, i) => (
          <div key={role.role} className="space-y-2">
            <Label htmlFor={`salary-${i}`}>{role.role}, ₽</Label>
            <Input
              id={`salary-${i}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={5000}
              value={salaries[i]}
              onChange={(e) =>
                setSalaries((prev) =>
                  prev.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
              // Повыше на телефоне: сюда приходят тапать пальцем,
              // а стандартные 32px под палец малы
              className={cn(NO_NUMBER_SPINNER, "h-11 w-full md:h-8")}
            />
          </div>
        ))}

        <div className="space-y-2">
          <Label htmlFor="calc-slots">Вакансий одновременно</Label>
          <Select value={slots} onValueChange={setSlots}>
            <SelectTrigger id="calc-slots" className="h-11! w-full md:h-8!">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARIFFS.map((t) => (
                <SelectItem key={t.slots} value={String(t.slots)}>
                  {t.slots}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-6 border-t pt-6 sm:grid-cols-3">
        <div>
          <div className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Своя команда
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {formatNumber(inhouse.total)} ₽
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            в месяц, со взносами и площадками
          </div>
        </div>

        <div>
          <div className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Подписка, тариф «{tariff.name}»
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {formatNumber(tariff.price)} ₽
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            в месяц, {tariff.slots} в работе одновременно
          </div>
        </div>

        <div>
          <div className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Остаётся в компании
          </div>
          {/*
            Разница бывает и отрицательной — на маленьких окладах
            подписка дороже своей команды. Прятать это нельзя: расчёт,
            который всегда показывает выгоду, ничего не стоит, а сайт
            и так обещает сказать прямо, если подписка не подходит
          */}
          <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {monthlyDiff > 0
              ? `${formatNumber(monthlyDiff * 12)} ₽`
              : "—"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {monthlyDiff > 0
              ? `за год, подписка дешевле на ${percent}%`
              : "на этих окладах своя команда дешевле — так и скажем на диагностике"}
          </div>
        </div>
      </div>
    </div>
  );
}
