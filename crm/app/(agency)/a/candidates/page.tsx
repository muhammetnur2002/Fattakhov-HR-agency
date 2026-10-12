import Link from "next/link";

import { ApplicationList } from "@/components/candidates/application-list";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { CandidateStatusBadge } from "@/components/candidates/candidate-status";
import { LoadMore } from "@/components/shell/load-more";
import { ListRegion } from "@/components/shell/list-pending";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { CANDIDATE_STATUS_LABELS, CANDIDATE_STATUS_ORDER } from "@/lib/labels";
import { formatNumber } from "@/lib/pricing";
import { listApplications } from "@/lib/services/applications";
import { searchCandidates } from "@/lib/services/candidates";
import { parseCandidateStatus } from "@/lib/services/candidate-status";
import { isSourcingLead, sourcingDaysLeft } from "@/lib/sourcing";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Кандидаты" };

/** Сколько карточек показываем сразу — дальше по «Показать ещё» (BR-22), как у клиента. */
const PAGE_SIZE = 30;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sf?: string;
    st?: string;
    tab?: string;
    page?: string;
    status?: string;
    src?: string;
  }>;
}) {
  const actor = await requireAgencyActor();
  // Общая база — внутренний актив агентства, клиенту она недоступна
  authorize(actor, "application.viewInternal");

  const { q, sf, st, tab, page: pageParam, status, src } = await searchParams;
  const studentsOnly = src === "students";
  const statusFilter = parseCandidateStatus(status) ?? undefined;
  const awaitingTab = tab === "awaiting";
  const page = Math.max(1, Number(pageParam) || 1);

  /*
    Воронка на странице вакансии отвечает «что с этой вакансией», а этот
    список — «кто сейчас ждёт меня поперёк всех вакансий». У клиента этот
    вопрос уже решён точно так же (см. app/(client)/candidates/page.tsx);
    рекрутёру с несколькими вакансиями он нужен ровно так же часто.
  */
  const withQuery = (params: Record<string, string>) => {
    const merged = new URLSearchParams({
      ...(q && { q }),
      ...(sf && { sf }),
      ...(st && { st }),
      ...(studentsOnly && { src: "students" }),
      ...(statusFilter && { status: statusFilter }),
      ...params,
    });
    const qs = merged.toString();
    return qs ? `/a/candidates?${qs}` : "/a/candidates";
  };

  if (awaitingTab) {
    const [{ items: applications }, { items: allAwaiting }] = await Promise.all([
      listApplications(actor, {
        awaitingDecision: true,
        query: q,
        salaryFrom: sf ? Number(sf) : undefined,
        salaryTo: st ? Number(st) : undefined,
      }),
      listApplications(actor, { awaitingDecision: true }),
    ]);

    return (
      <div className="space-y-6">
        <div>
          <PageTitle>Кандидаты</PageTitle>
          <p className="text-sm text-muted-foreground">
            {allAwaiting.length === 0
              ? "Никто не ждёт решения клиента"
              : `${allAwaiting.length} ${allAwaiting.length === 1 ? "ждёт" : "ждут"} решения клиента`}
          </p>
        </div>

        <FilterChipGroup label="Какие кандидаты">
          <FilterChip href={withQuery({})} selected={false}>
            Все
          </FilterChip>
          <FilterChip href={withQuery({ tab: "awaiting" })} selected>
            Ждут клиента
          </FilterChip>
        </FilterChipGroup>

        <CandidateFilters />

        <ListRegion>
          <ApplicationList
            applications={applications}
            hrefBase="/a/applications"
            showClient
            emptyText={
              q || sf || st
                ? "Ничего не нашлось по этим условиям."
                : "Все представленные кандидаты дождались ответа."
            }
          />
        </ListRegion>
      </div>
    );
  }

  const { items: candidates, hasMore } = await searchCandidates(actor, {
    query: q,
    salaryFrom: sf ? Number(sf) : undefined,
    salaryTo: st ? Number(st) : undefined,
    studentsOnly,
    status: statusFilter,
    take: page * PAGE_SIZE,
  });

  // Ссылки на статус сохраняют поиск и вилку, но сбрасывают страницу
  const withStatus = (value?: string) => {
    const params = new URLSearchParams({
      ...(q && { q }),
      ...(sf && { sf }),
      ...(st && { st }),
      ...(studentsOnly && { src: "students" }),
      ...(value && { status: value }),
    });
    const qs = params.toString();
    return qs ? `/a/candidates?${qs}` : "/a/candidates";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <PageTitle>Кандидаты</PageTitle>
          <p className="text-sm text-muted-foreground">
            {candidates.length === 0
              ? "Общая база агентства. Один человек может быть в нескольких воронках."
              : hasMore
                ? `Показано ${candidates.length}`
                : `Всего ${candidates.length}`}
          </p>
        </div>
        {canDo(actor, "application.create") && (
          <Button asChild>
            <Link href="/a/candidates/new">Добавить</Link>
          </Button>
        )}
      </div>

      <FilterChipGroup label="Какие кандидаты">
        <FilterChip href={withQuery({})} selected>
          Все
        </FilterChip>
        <FilterChip href={withQuery({ tab: "awaiting" })} selected={false}>
          Ждут клиента
        </FilterChip>
      </FilterChipGroup>

      {/* Рабочий статус кандидата (ставится вручную в карточке) */}
      <FilterChipGroup label="Статус кандидата">
        <span className="text-sm text-muted-foreground">Статус</span>
        <FilterChip href={withStatus()} selected={!statusFilter}>
          Все
        </FilterChip>
        {CANDIDATE_STATUS_ORDER.map((s) => (
          <FilterChip key={s} href={withStatus(s)} selected={statusFilter === s}>
            {CANDIDATE_STATUS_LABELS[s]}
          </FilterChip>
        ))}
      </FilterChipGroup>

      <FilterChipGroup label="Источник кандидата">
        <span className="text-xs text-muted-foreground">Источник:</span>
        <FilterChip href={withQuery({ src: "" })} selected={!studentsOnly}>
          Все
        </FilterChip>
        <FilterChip href={withQuery({ src: "students" })} selected={studentsOnly}>
          Студплатформа
        </FilterChip>
      </FilterChipGroup>

      <CandidateFilters />

      <ListRegion>
        {candidates.length === 0 ? (
          <EmptyState>
            {q || sf || st
              ? "Никого не нашли по этим условиям."
              : "База пока пуста."}
          </EmptyState>
        ) : (
          <div className="grid gap-2">
            {candidates.map((c) => (
              <Link key={c.id} href={`/a/candidates/${c.id}`}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="min-w-56 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {c.fullName}
                        {c.source === "STUDENT_PLATFORM" && <Badge variant="secondary">🎓 Студплатформа</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[c.currentPosition, c.currentCompany, c.city]
                          .filter(Boolean)
                          .join(" · ") || "Профиль не заполнен"}
                      </div>
                    </div>

                    {c.salaryExpectation != null && (
                      <div className="text-sm text-muted-foreground">
                        {formatNumber(Number(c.salaryExpectation))} ₽
                      </div>
                    )}

                    <div className="text-sm text-muted-foreground">
                      {c._count.applications > 0
                        ? `${c._count.applications} воронок`
                        : "не в работе"}
                    </div>

                    <CandidateStatusBadge status={c.status} />

                    {c.consentStatus !== "GIVEN" && (
                      <ConsentBadge sourcedAt={c.sourcedAt} consentStatus={c.consentStatus} />
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </ListRegion>

      {hasMore && <LoadMore href={withQuery({ page: String(page + 1) })} />}
    </div>
  );
}

/**
 * Без согласия — а у сорсинг-лида ещё и сколько осталось до удаления
 * (lib/services/sourcing.ts): за три дня метка красная, чтобы список
 * сам показывал, кого пора довести до согласия.
 */
function ConsentBadge({
  sourcedAt,
  consentStatus,
}: {
  sourcedAt: Date | null;
  consentStatus: string;
}) {
  if (!sourcedAt || !isSourcingLead({ sourcedAt, consentStatus })) {
    return <Badge variant="outline">без согласия</Badge>;
  }
  const daysLeft = sourcingDaysLeft(new Date(sourcedAt));
  return (
    <Badge variant={daysLeft <= 3 ? "destructive" : "outline"}>
      {daysLeft > 0 ? `без согласия · ${daysLeft} дн.` : "без согласия · срок вышел"}
    </Badge>
  );
}
