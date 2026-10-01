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
  GENERAL_CONTRIBUTIONS_RATE,
  INHOUSE_ROLES,
  TARIFFS,
  inhouseMonthlyCost,
  savingsPercent,
} from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";
import { cn, NO_NUMBER_SPINNER } from "@/lib/utils";

/** Пустое или битое поле — ноль, а не NaN: иначе расчёт превращается в «NaN ₽». */
function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Расчёт на своих числах.
 *
 * Единственный расчёт стоимости своей команды на сайте, и построен он так
 * намеренно: ни одного числа за посетителя здесь нет. Оклады и инструменты
 * вводит он, ставку взносов видит и правит. Агентство не называет цифр
 * рынка, потому что не может их подтвердить, а расчёт на выдуманных окладах
 * первым разберёт финансовый директор клиента.
 *
 * Поля пустые, а не «примерные»: поле, заполненное за человека, превращает
 * его расчёт в наш. Исключение одно, и оно видно: общий тариф взносов
 * стоит в своём поле с пояснением, что у части компаний он ниже.
 *
 * Формулы те же, что проверены тестами, из lib/marketing.
 */
export function CostCalculator() {
  const [salaries, setSalaries] = useState<string[]>(() =>
    INHOUSE_ROLES.map(() => ""),
  );
  const [ratePercent, setRatePercent] = useState(
    String(Math.round(GENERAL_CONTRIBUTIONS_RATE * 100)),
  );
  const [tools, setTools] = useState("");
  const [slots, setSlots] = useState(
    String(TARIFFS.find((t) => t.recommended)?.slots ?? 3),
  );

  const inhouse = inhouseMonthlyCost(
    salaries.map(toNumber),
    Math.min(toNumber(ratePercent), 100) / 100,
    toNumber(tools),
  );
  // Без окладов считать нечего: пустой расчёт не должен показывать
  // «стоимость команды» из одних инструментов
  const filled = inhouse.salaries > 0;

  const tariff =
    TARIFFS.find((t) => String(t.slots) === slots) ?? TARIFFS[0];

  const monthlyDiff = inhouse.total - tariff.price;
  const percent = savingsPercent(inhouse.total, tariff.price);

  return (
    <div className="rounded-2xl border bg-card p-6 md:p-8">
      <div className="max-w-2xl">
        <h3 className="text-2xl font-semibold tracking-tight">
          Посчитайте на своих числах
        </h3>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Впишите оклады, которые платите или планируете платить, до вычета
          НДФЛ. Разница с подпиской посчитается сразу, без диагностики
          и звонка. Заранее здесь ничего не заполнено: цифры только ваши.
        </p>
      </div>

      <div className="mt-6 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {INHOUSE_ROLES.map((role, i) => (
          <div key={role.role} className="space-y-2">
            <Label htmlFor={`salary-${i}`}>{role.role}, ₽ в месяц</Label>
            <Input
              id={`salary-${i}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={5000}
              placeholder="0"
              aria-describedby={`salary-${i}-note`}
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
            <p id={`salary-${i}-note`} className="text-sm text-muted-foreground">
              {role.note}
            </p>
          </div>
        ))}

        <div className="space-y-2">
          <Label htmlFor="calc-rate">Страховые взносы, %</Label>
          <Input
            id="calc-rate"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.1}
            aria-describedby="calc-rate-note"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
            className={cn(NO_NUMBER_SPINNER, "h-11 w-full md:h-8")}
          />
          <p id="calc-rate-note" className="text-sm text-muted-foreground">
            Общий тариф: то, что компания платит сверх окладов. У малого
            и среднего бизнеса может быть ниже, впишите свою.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="calc-tools">Площадки и инструменты, ₽ в месяц</Label>
          <Input
            id="calc-tools"
            type="number"
            inputMode="numeric"
            min={0}
            step={5000}
            placeholder="0"
            aria-describedby="calc-tools-note"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            className={cn(NO_NUMBER_SPINNER, "h-11 w-full md:h-8")}
          />
          <p id="calc-tools-note" className="text-sm text-muted-foreground">
            Доступы к базам резюме, рабочие места. Можно оставить пустым.
          </p>
        </div>

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

      <div
        aria-live="polite"
        className="mt-8 grid gap-6 border-t pt-6 sm:grid-cols-3"
      >
        <div>
          <div className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Своя команда
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {filled ? `${formatNumber(inhouse.total)} ₽` : "—"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {filled
              ? `в месяц: оклады ${formatNumber(inhouse.salaries)} + взносы ${formatNumber(inhouse.contributions)}${
                  inhouse.tools > 0
                    ? ` + инструменты ${formatNumber(inhouse.tools)}`
                    : ""
                }`
              : "впишите оклады, и здесь появится ваша сумма"}
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
            {filled && monthlyDiff > 0
              ? `${formatNumber(monthlyDiff * 12)} ₽`
              : "—"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {!filled
              ? "покажем разницу за год, когда будут оклады"
              : monthlyDiff > 0
                ? `за год, подписка дешевле на ${percent}%`
                : "на этих окладах своя команда дешевле — так и скажем на диагностике"}
          </div>
        </div>
      </div>
    </div>
  );
}
