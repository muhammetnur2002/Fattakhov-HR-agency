import Link from "next/link";

import { LoadMore } from "@/components/shell/load-more";
import { SearchField } from "@/components/shell/search-field";
import { VacancyList } from "@/components/vacancies/vacancy-list";
import { VacancyStatusFilter } from "@/components/vacancies/vacancy-status-filter";
import { Button } from "@/components/ui/button";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { listVacancies } from "@/lib/services/vacancies";

export const metadata = { title: "Вакансии" };

/** Сколько карточек показываем сразу — дальше по «Показать ещё» (BR-22). */
const PAGE_SIZE = 20;

export default async function ClientVacanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const actor = await requireClientActor();
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { items: vacancies, hasMore } = await listVacancies(actor, {
    query: q,
    status: status as VacancyStatus | undefined,
    take: page * PAGE_SIZE,
  });
  const canCreate = canDo(actor, "vacancy.create", { clientId: actor.clientId });

  const withQuery = (params: Record<string, string>) => {
    const merged = new URLSearchParams({
      ...(q && { q }),
      ...(status && { status }),
      ...params,
    });
    const qs = merged.toString();
    return qs ? `/vacancies?${qs}` : "/vacancies";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Вакансии</h1>
          <p className="text-sm text-muted-foreground">
            {vacancies.length === 0
              ? "Заявок пока нет"
              : hasMore
                ? `Показано ${vacancies.length}`
                : `Всего ${vacancies.length}`}
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/vacancies/new">Новая заявка</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchField placeholder="Название, подразделение, город…" />
        <VacancyStatusFilter />
      </div>

      <VacancyList
        vacancies={vacancies}
        hrefBase="/vacancies"
        emptyText={
          q || status
            ? "Ничего не нашлось по этому запросу."
            : canCreate
              ? "Отправьте первую заявку на подбор — мы возьмём её в работу и назначим рекрутера."
              // Наблюдатель заявку отправить не может — приглашение
              // сделать то, чего у него нет прав сделать, это не
              // пустое состояние, а мелкая, но настоящая ошибка
              : "Заявок на подбор пока нет."
        }
      />

      {hasMore && <LoadMore href={withQuery({ page: String(page + 1) })} />}
    </div>
  );
}
