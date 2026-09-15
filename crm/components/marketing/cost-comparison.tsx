import { CountUp, Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import {
  COMPARABLE_TARIFF,
  ENTRY_TARIFF,
  INHOUSE_ROLES,
  inhouseMonthlyCost,
  savingsPercent,
} from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Сравнение: своя команда найма против подписки.
 *
 * Главный приём страницы, поэтому построен на разборе, а не на лозунге.
 * «Экономьте в шесть раз» без расшифровки вызывает недоверие; те же
 * деньги, разложенные по окладам и взносам, вызывают узнавание,
 * потому что заказчик эти цифры видел в своём бюджете.
 *
 * Столбцы нарисованы долями от большей суммы, а не произвольной
 * высотой: если картинка врёт про пропорцию, читатель это чувствует
 * раньше, чем осознаёт.
 */
export function CostComparison() {
  const inhouse = inhouseMonthlyCost();
  // Сравниваем по сопоставимой конфигурации, а не по цене входа:
  // один слот против отдела из трёх человек - разная пропускная
  // способность, и подмену видно сразу
  const percent = savingsPercent(inhouse.total, COMPARABLE_TARIFF.price);

  const rows = [
    ...INHOUSE_ROLES.map((r) => ({
      label: r.role,
      note: r.note,
      value: r.salary,
    })),
    {
      label: "Страховые взносы",
      note: "То, что компания платит сверх окладов",
      value: inhouse.contributions,
    },
    {
      label: "Площадки и инструменты",
      note: "Доступы к базам резюме, рабочие места",
      value: inhouse.tools,
    },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
      <Reveal>
        <div className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Своя команда найма
        </div>

        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-5xl font-semibold tracking-tight tabular-nums md:text-6xl">
            <CountUp value={inhouse.total} /> ₽
          </span>
          <span className="text-base text-muted-foreground">в месяц</span>
        </div>

        <Stagger className="mt-8 divide-y border-t">
          {rows.map((row) => (
            <StaggerItem key={row.label}>
              <div className="py-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-lg font-medium">{row.label}</span>
                  <span className="shrink-0 text-base tabular-nums text-muted-foreground">
                    {formatNumber(row.value)} ₽
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {row.note}
                </p>
                {/* Полоса показывает вес строки в общей сумме: глаз ловит
                    пропорцию быстрее, чем сравнивает числа */}
                <div
                  aria-hidden
                  className="mt-2 h-[3px] rounded-full bg-foreground/12"
                >
                  <div
                    className="h-full rounded-full bg-foreground/45"
                    style={{ width: `${(row.value / inhouse.total) * 100}%` }}
                  />
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Reveal>

      <Reveal delay={0.08} className="flex h-full flex-col">
        {/*
          Невидимый двойник шапки левой колонки — той же высоты при любом
          масштабе текста и брейкпоинте, потому что построен из тех же
          классов. Он не занимает место по счёту, а буквально отодвигает
          верх тёмной карточки туда, где у левой колонки кончается
          заголовок и начинается линия над первой строкой: без него
          верх карточки и верх списка не совпадали.
        */}
        <div aria-hidden className="invisible">
          <div className="text-sm font-medium tracking-[0.14em] uppercase">
            Своя команда найма
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-5xl font-semibold tracking-tight tabular-nums md:text-6xl">
              {formatNumber(inhouse.total)} ₽
            </span>
            <span className="text-base">в месяц</span>
          </div>
        </div>

        {/*
          flex-1 растягивает карточку на всё, что осталось до низа
          колонки — а низ колонки, за счёт стретча грида и того же
          невидимого двойника сверху, ровно совпадает с низом левого
          списка («Площадки и инструменты»). Раньше карточка была
          высотой ровно по своему содержимому и заканчивалась выше.
        */}
        {/* mt-8 — та же величина, что задаёт Stagger слева между шапкой
            и первой линией: без неё верх карточки не совпадал с линией */}
        <div className="relative mt-8 flex flex-1 flex-col overflow-hidden rounded-2xl bg-brand-graphite p-6 text-white md:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"
          />

          {/* justify-between держит верхний блок сверху, а разницу —
              внизу, у самого края растянутой карточки */}
          <div className="relative flex flex-1 flex-col justify-between">
            <div>
              <div className="text-sm font-medium tracking-[0.14em] text-white/65 uppercase">
                Команда по подписке
              </div>

              {/* Здесь только вход и рекомендованный: вся лестница из пяти
                  тарифов стоит ниже, в прайсе, и повторять её в блоке про
                  деньги значит утопить сравнение в списке.

                  Ритм внутри карточки плотнее, чем кажется уместным для
                  такого крупного шрифта — это не оплошность: карточка
                  обязана поместиться в высоту левого списка, а он
                  диктует её целиком (ниже стоит flex-1). Крупный шрифт
                  и плотные интервалы совместимы, разрежённые — с этой
                  высотой уже нет. */}
              <dl className="mt-4 space-y-1.5">
                {[ENTRY_TARIFF, COMPARABLE_TARIFF].map((t) => (
                  <div key={t.slots}>
                    <dt className="flex items-baseline justify-between gap-4">
                      <span
                        className={cn(
                          "text-base",
                          t.recommended ? "font-medium text-white" : "text-white/70",
                        )}
                      >
                        {t.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 leading-none font-semibold tabular-nums",
                          t.recommended ? "text-4xl" : "text-2xl text-white/80",
                        )}
                      >
                        {formatNumber(t.price)} ₽
                      </span>
                    </dt>
                    <dd className="text-sm text-white/60">{t.note}</dd>
                  </div>
                ))}
              </dl>

              {/* Полосы в одном масштабе: подписка занимает ровно свою долю
                  от стоимости штата, без художественных допущений */}
              <div className="mt-4 space-y-1.5">
                <Bar label="Свой отдел найма" value={inhouse.total} max={inhouse.total} />
                <Bar
                  label={COMPARABLE_TARIFF.title}
                  value={COMPARABLE_TARIFF.price}
                  max={inhouse.total}
                  accent
                />
              </div>
            </div>

            <div className="mt-4 border-t border-white/12 pt-3">
              <div className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
                <CountUp value={percent} />%
              </div>
              <div className="mt-1.5 text-base leading-snug text-white/70">
                разница при сопоставимом объёме: три параллельные вакансии
                против отдела из трёх человек
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  accent = false,
}: {
  label: string;
  value: number;
  max: number;
  accent?: boolean;
}) {
  const width = Math.max((value / max) * 100, 4);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-base">
        <span className={accent ? "font-medium" : "text-white/70"}>{label}</span>
        <span className="tabular-nums text-white/70">
          {formatNumber(value)} ₽
        </span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-white/12">
        <div
          className={cn(
            "h-full rounded-full",
            accent ? "bg-white" : "bg-white/35",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
