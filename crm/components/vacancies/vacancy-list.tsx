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

  // max-w-full и truncate: в узкой колонке сетки (xl, minmax(0,1fr))
  // длинный статус вроде «Заявка отправлена» иначе срезался бы краем
  // карточки — без многоточия и без полосы прокрутки. Полный текст —
  // в подсказке
  return (
    <Badge variant={variant} className="max-w-full" title={VACANCY_STATUS_LABELS[status]}>
      <span className="truncate">{VACANCY_STATUS_LABELS[status]}</span>
    </Badge>
  );
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
      {vacancies.map((v) => {
        const location =
          [
            showClient ? v.client.name : v.department,
            v.city,
            v.headcount > 1 ? `${v.headcount} чел.` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Детали не заполнены";
        const candidates =
          v._count.applications > 0
            ? `${v._count.applications} кандидатов`
            : "Кандидатов нет";

        return (
          <Link key={v.id} href={`${hrefBase}/${v.id}`}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent>
                {/*
                  Ниже xl — четыре строки одна под другой, каждая своя
                  роль: номер+название, место+срочность, вилка слева и
                  число кандидатов справа на одной строке, статус.
                  Раньше это была одна flex-строка с переносом (ниже,
                  под xl:grid) — на телефоне почти ничего не помещалось
                  рядом, и то, что переносилось, сохраняло свой text-right
                  из строчной раскладки: вилка и число кандидатов повисали
                  по центру карточки, а не выстраивались в линию. Слова
                  не «вразброс», а по строкам — то, что и просили.
                */}
                <div className="flex flex-col gap-1.5 xl:hidden">
                  <div className="font-medium">
                    <span className="text-muted-foreground">№{v.number}</span>{" "}
                    {v.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {location} · {URGENCY_LABELS[v.urgency]}
                  </div>
                  <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{formatSalary(v.salaryFrom, v.salaryTo) ?? "—"}</span>
                    <span>{candidates}</span>
                  </div>
                  <div>
                    <VacancyStatusBadge status={v.status} />
                  </div>
                </div>

                {/*
                  Сетка на широком экране (xl и шире).

                  Раньше строка всегда была flex-рядом с одной растягивающейся
                  колонкой — названием. Весь избыток ширины уходил в неё одну,
                  и на ноутбуке между названием и вилкой зияла пустота
                  в сотни пикселей. Ограничение max-w на странице это прятало,
                  но ценой трети неиспользованного экрана справа.

                  Доли вместо фиксированных ширин: избыток делится между всеми
                  колонками, а не копится в одном месте. Колонки при этом
                  по-прежнему совпадают между карточками — ради чего фиксированные
                  ширины и заводились.
                */}
                <div className="hidden xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-center xl:gap-x-6">
                  <div className="min-w-0">
                    <div className="font-medium">
                      <span className="text-muted-foreground">№{v.number}</span>{" "}
                      {v.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {location}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Срочность: {URGENCY_LABELS[v.urgency]}
                    </div>
                  </div>

                  <div className="text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatSalary(v.salaryFrom, v.salaryTo) ?? "—"}
                  </div>

                  <div className="text-right text-sm whitespace-nowrap text-muted-foreground">
                    {candidates}
                  </div>

                  {/* Без фиксированной ширины: это настоящая grid-колонка
                      (minmax(0,1fr)), её ширину задаёт сетка, а не контент —
                      в отличие от прежней flex-строки, где «Закрыта без
                      найма» и «В работе» забирали разное место и колонка
                      зарплаты левее них гуляла между карточками. */}
                  <div className="justify-self-end">
                    <VacancyStatusBadge status={v.status} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
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
