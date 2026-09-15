import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { URGENCY_LABELS, VACANCY_STATUS_LABELS } from "@/lib/labels";
import { formatNumber } from "@/lib/pricing";

export type VacancyListItem = {
  id: string;
  number: number;
  title: string;
  status: VacancyStatus;
  department: string | null;
  city: string | null;
  headcount: number;
  urgency: keyof typeof URGENCY_LABELS;
  salaryFrom: unknown;
  salaryTo: unknown;
  estimatedFirstCandidatesAt: Date | null;
  client: { id: string; name: string };
  _count: { applications: number };
};

/**
 * Бейдж статуса: красным — только то, что ждёт реакции клиента
 * (агентство задало вопросы или прислало сроки на подтверждение).
 *
 * SUBMITTED раньше тоже был красным, хотя это ход агентства — клиент
 * ничего не должен делать, пока мы «изучаем» заявку. Красный бейдж
 * рядом со спокойным текстом статуса читался как сигнал тревоги там,
 * где его нет.
 */
export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  const variant =
    status === "ACTIVE"
      ? "default"
      : status === "CLARIFYING" || status === "ESTIMATED"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{VACANCY_STATUS_LABELS[status]}</Badge>;
}

export function VacancyList({
  vacancies,
  hrefBase,
  showClient = false,
  emptyText,
}: {
  vacancies: VacancyListItem[];
  hrefBase: string;
  showClient?: boolean;
  emptyText: string;
}) {
  if (vacancies.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {vacancies.map((v) => (
        <Link key={v.id} href={`${hrefBase}/${v.id}`}>
          <Card className="transition-colors hover:border-primary/40">
            {/*
              Сетка на широком экране, перенос строк на узком.

              Раньше строка всегда была flex-рядом с одной растягивающейся
              колонкой — названием. Весь избыток ширины уходил в неё одну,
              и на ноутбуке между названием и вилкой зияла пустота
              в сотни пикселей. Ограничение max-w на странице это прятало,
              но ценой трети неиспользованного экрана справа.

              Доли вместо фиксированных ширин: избыток делится между всеми
              колонками, а не копится в одном месте. Колонки при этом
              по-прежнему совпадают между карточками — ради чего фиксированные
              ширины и заводились.

              Раньше вилка, срочность, число кандидатов и статус лежали
              в одной flex-строке и появлялись через один — не у каждой
              вакансии есть вилка, срочность высокая не у всех. Каждый
              пропуск сдвигал всё, что после него, и колонки не совпадали
              между карточками. Теперь у зарплаты и числа кандидатов
              фиксированная ширина (прочерк вместо пропуска), а срочность
              переехала под название — там ей не с чем конкурировать
              за место в строке.
            */}
            <CardContent
              className="
                flex flex-wrap items-center gap-x-6 gap-y-2 p-4
                xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]
              "
            >
              <div className="min-w-56 flex-1 xl:min-w-0">
                <div className="font-medium">
                  <span className="text-muted-foreground">№{v.number}</span>{" "}
                  {v.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[
                    showClient ? v.client.name : v.department,
                    v.city,
                    v.headcount > 1 ? `${v.headcount} чел.` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Детали не заполнены"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Срочность: {URGENCY_LABELS[v.urgency]}
                </div>
              </div>

              <div className="w-32 shrink-0 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground xl:w-auto xl:shrink">
                {formatSalary(v.salaryFrom, v.salaryTo) ?? "—"}
              </div>

              <div className="w-28 shrink-0 text-right text-sm whitespace-nowrap text-muted-foreground xl:w-auto xl:shrink">
                {v._count.applications > 0
                  ? `${v._count.applications} кандидатов`
                  : "Кандидатов нет"}
              </div>

              {/* Тоже фиксированная ширина: «Закрыта без найма» у одной
                  строки против «В работе» у другой иначе забирали разное
                  место, и колонка зарплаты левее неё гуляла между карточками */}
              <div className="w-40 shrink-0 text-right xl:w-auto xl:shrink">
                <VacancyStatusBadge status={v.status} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function formatSalary(from: unknown, to: unknown): string | null {
  const a = from === null || from === undefined ? null : Number(from);
  const b = to === null || to === undefined ? null : Number(to);
  if (a === null && b === null) return null;
  // Фиксированный оклад пишут одинаковым числом в оба поля — «1 000 000–1 000 000»
  // читается как ошибка ввода
  if (a !== null && b !== null && a !== b) {
    return `${formatNumber(a)}–${formatNumber(b)} ₽`;
  }
  return `${formatNumber((a ?? b) as number)} ₽`;
}
