import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { Card, CardContent } from "@/components/ui/card";
import type { ClientDecision } from "@/lib/generated/prisma/enums";
import { formatNumber } from "@/lib/pricing";

export type ApplicationListItem = {
  id: string;
  presentedAt: Date | null;
  clientDecision: ClientDecision | null;
  stage: { name: string };
  vacancy: {
    id: string;
    number: number;
    title: string;
    client?: { id: string; name: string };
  };
  candidate: {
    fullName: string;
    currentPosition: string | null;
    currentCompany: string | null;
    city: string | null;
    salaryExpectation: number | null;
  };
};

/**
 * Кандидаты поперёк вакансий.
 *
 * Главное в строке — сколько человек ждёт ответа: это единственное,
 * что требует действия прямо сейчас. Поэтому счётчик дней стоит справа
 * и подсвечивается, а не прячется в карточке.
 */
export function ApplicationList({
  applications,
  hrefBase,
  emptyText,
  showClient = false,
}: {
  applications: ApplicationListItem[];
  hrefBase: string;
  emptyText: string;
  /** Сквозной список у агентства — вакансии вперемешку у разных клиентов. */
  showClient?: boolean;
}) {
  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <Stagger className="grid gap-3">
      {applications.map((a) => {
        const waiting =
          a.presentedAt !== null && a.clientDecision === null
            ? daysSince(a.presentedAt)
            : null;

        return (
          <StaggerItem key={a.id}>
          <Link href={`${hrefBase}/${a.id}`}>
            <Card className="transition-colors hover:border-primary/40">
              {/*
                Сетка на широком экране, перенос строк на узком — как
                в VacancyList. Без неё весь избыток ширины уходил в две
                растягивающиеся колонки (имя и вакансия), и между
                содержимым зияли провалы в сотни пикселей; страница
                прятала это ограничением ширины, ценой неиспользованного
                экрана справа.
              */}
              <CardContent
                className="
                  flex flex-wrap items-center gap-x-6 gap-y-2 p-4
                  xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]
                "
              >
                <div className="min-w-56 flex-1 xl:min-w-0">
                  <div className="font-medium">{a.candidate.fullName}</div>
                  {/* Должность и компания в одну строку через один
                      разделитель. Город и деньги вынесены в отдельные
                      колонки: цепочка из трёх точек в одной строке
                      не читается, глаз не находит, где кончается одно
                      и начинается другое */}
                  <div className="text-xs text-muted-foreground">
                    {[a.candidate.currentPosition, a.candidate.currentCompany]
                      .filter(Boolean)
                      .join(" · ") || "Профиль не заполнен"}
                  </div>
                </div>

                {/* Фиксированная ширина, как у зарплаты и статуса в
                    VacancyList: не у каждой карточки есть ожидание по
                    зарплате, и без прочерка колонка вакансии правее
                    гуляла между карточками */}
                <div className="w-28 shrink-0 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground xl:w-auto xl:shrink">
                  {a.candidate.salaryExpectation !== null
                    ? `${formatNumber(a.candidate.salaryExpectation)} ₽`
                    : "—"}
                </div>

                <div className="min-w-40 flex-1 text-xs text-muted-foreground xl:min-w-0">
                  №{a.vacancy.number} {a.vacancy.title}
                  {showClient && a.vacancy.client && (
                    <span className="block">{a.vacancy.client.name}</span>
                  )}
                </div>

                {/* Тоже фиксированная ширина: бейдж ожидания есть не у
                    каждой карточки, а бейдж этапа правее должен стоять
                    на одном месте независимо от того, есть ли сосед слева */}
                <div className="w-32 shrink-0 text-right xl:w-auto xl:shrink">
                  {waiting !== null && (
                    <Badge variant={waiting >= 3 ? "destructive" : "outline"}>
                      {waiting === 0
                        ? "Ждёт решения"
                        : `Ждёт ${waiting} ${plural(waiting)}`}
                    </Badge>
                  )}
                </div>

                <div className="w-32 shrink-0 text-right xl:w-auto xl:shrink">
                  <Badge variant="secondary">{a.stage.name}</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function plural(days: number): string {
  const last = days % 10;
  const teen = days % 100 >= 11 && days % 100 <= 14;
  if (!teen && last === 1) return "день";
  if (!teen && last >= 2 && last <= 4) return "дня";
  return "дней";
}
