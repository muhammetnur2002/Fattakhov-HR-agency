import { ApplicationList } from "@/components/candidates/application-list";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { LoadMore } from "@/components/shell/load-more";
import { ListRegion } from "@/components/shell/list-pending";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { requireClientActor } from "@/lib/auth/session";
import { listApplications } from "@/lib/services/applications";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Кандидаты" };

/** Сколько карточек показываем сразу — дальше по «Показать ещё» (BR-22). */
const PAGE_SIZE = 20;

/**
 * Кандидаты по всем вакансиям клиента (ТЗ 7.2, пункт меню «Кандидаты»).
 *
 * Воронка отвечает «что с этой вакансией», этот список — «кто сейчас
 * ждёт меня». Второе спрашивают чаще: решения ждут люди.
 *
 * Порог видимости берётся из слоя доступа: здесь нет и не должно быть
 * ни одной собственной проверки, кто что видит.
 */
export default async function ClientCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    q?: string;
    sf?: string;
    st?: string;
    page?: string;
  }>;
}) {
  const actor = await requireClientActor();
  const { filter, q, sf, st, page: pageParam } = await searchParams;
  const awaitingOnly = filter === "awaiting";
  const page = Math.max(1, Number(pageParam) || 1);

  const baseFilters = {
    awaitingDecision: awaitingOnly,
    query: q,
    salaryFrom: sf ? Number(sf) : undefined,
    salaryTo: st ? Number(st) : undefined,
  };

  const [{ items: applications, hasMore }, { items: allAwaiting }] =
    await Promise.all([
      listApplications(actor, { ...baseFilters, take: page * PAGE_SIZE }),
      // Счётчик для бейджа — отдельным, непагинированным запросом: очередь
      // «ждут решения» сама по себе небольшая (открытые дела, а не архив),
      // а из уже отрезанной первой страницы верное число не собрать
      listApplications(actor, { awaitingDecision: true }),
    ]);
  const awaitingCount = allAwaiting.length;

  // Переключатель и «Показать ещё» не должны стирать введённые фильтры
  const withQuery = (params: Record<string, string>) => {
    const merged = new URLSearchParams({
      ...(q && { q }),
      ...(sf && { sf }),
      ...(st && { st }),
      ...params,
    });
    const qs = merged.toString();
    return qs ? `/candidates?${qs}` : "/candidates";
  };

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>Кандидаты</PageTitle>
        <p className="text-sm text-muted-foreground">
          {applications.length === 0
            ? "Кандидатов пока нет"
            : (hasMore ? `Показано ${applications.length}` : `Всего ${applications.length}`) +
              (awaitingCount > 0 && !awaitingOnly
                ? ` · ${awaitingCount} ${awaitingCount === 1 ? "ждёт" : "ждут"} вашего решения`
                : "")}
        </p>
      </div>

      <FilterChipGroup label="Какие кандидаты">
        <FilterChip href={withQuery({})} selected={!awaitingOnly}>
          Все
        </FilterChip>
        <FilterChip href={withQuery({ filter: "awaiting" })} selected={awaitingOnly}>
          Ждут решения
        </FilterChip>
      </FilterChipGroup>

      <CandidateFilters />

      <ListRegion>
        <ApplicationList
          applications={applications}
          hrefBase="/applications"
          emptyText={
            q || sf || st
              ? "Ничего не нашлось по этим условиям."
              : awaitingOnly
                ? "Никто не ждёт вашего ответа — всё разобрано."
                : "Как только агентство представит первого кандидата, он появится здесь."
          }
        />
      </ListRegion>

      {hasMore && (
        <LoadMore
          href={withQuery({
            ...(awaitingOnly && { filter: "awaiting" }),
            page: String(page + 1),
          })}
        />
      )}
    </div>
  );
}
