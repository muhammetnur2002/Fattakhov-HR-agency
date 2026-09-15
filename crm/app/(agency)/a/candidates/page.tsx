import Link from "next/link";

import { ApplicationList } from "@/components/candidates/application-list";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { LoadMore } from "@/components/shell/load-more";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { formatNumber } from "@/lib/pricing";
import { listApplications } from "@/lib/services/applications";
import { searchCandidates } from "@/lib/services/candidates";

export const metadata = { title: "Кандидаты" };

/** Сколько карточек показываем сразу — дальше по «Показать ещё» (BR-22), как у клиента. */
const PAGE_SIZE = 30;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sf?: string; st?: string; tab?: string; page?: string }>;
}) {
  const actor = await requireAgencyActor();
  // Общая база — внутренний актив агентства, клиенту она недоступна
  authorize(actor, "application.viewInternal");

  const { q, sf, st, tab, page: pageParam } = await searchParams;
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
          <h1 className="text-2xl font-semibold">Кандидаты</h1>
          <p className="text-sm text-muted-foreground">
            {allAwaiting.length === 0
              ? "Никто не ждёт решения клиента"
              : `${allAwaiting.length} ${allAwaiting.length === 1 ? "ждёт" : "ждут"} решения клиента`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={withQuery({})}>Все</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={withQuery({ tab: "awaiting" })}>Ждут клиента</Link>
          </Button>
        </div>

        <CandidateFilters />

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
      </div>
    );
  }

  const { items: candidates, hasMore } = await searchCandidates(actor, {
    query: q,
    salaryFrom: sf ? Number(sf) : undefined,
    salaryTo: st ? Number(st) : undefined,
    take: page * PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Кандидаты</h1>
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

      <div className="flex gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={withQuery({})}>Все</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={withQuery({ tab: "awaiting" })}>Ждут клиента</Link>
        </Button>
      </div>

      <CandidateFilters />

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {q || sf || st ? "Никого не нашли по этим условиям." : "База пока пуста."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {candidates.map((c) => (
            <Link key={c.id} href={`/a/candidates/${c.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
                  <div className="min-w-56 flex-1">
                    <div className="font-medium">{c.fullName}</div>
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

                  {c.consentStatus !== "GIVEN" && (
                    <Badge variant="outline">без согласия</Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {hasMore && <LoadMore href={withQuery({ page: String(page + 1) })} />}
    </div>
  );
}
