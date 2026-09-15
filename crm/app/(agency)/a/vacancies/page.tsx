import Link from "next/link";

import { VacancyList } from "@/components/vacancies/vacancy-list";
import { VacancyStatusFilter } from "@/components/vacancies/vacancy-status-filter";
import { RecruiterFilter } from "@/components/vacancies/recruiter-filter";
import { SearchField } from "@/components/shell/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { VacancyStatus } from "@/lib/generated/prisma/enums";
import { listVacancies } from "@/lib/services/vacancies";

export const metadata = { title: "Вакансии" };

export default async function AgencyVacanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; recruiterId?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { status, q, recruiterId } = await searchParams;
  const canCreate = canDo(actor, "vacancy.create", { clientId: null });
  const canAccept = canDo(actor, "vacancy.accept");
  const filtered = Boolean(status || q || recruiterId);

  const recruiters = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      role: { in: ["RECRUITER", "HEAD", "OWNER"] },
      isActive: true,
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  const filterBar = (
    <div className="flex flex-wrap gap-3">
      <SearchField placeholder="Название, подразделение, город…" />
      <VacancyStatusFilter />
      <RecruiterFilter recruiters={recruiters} />
    </div>
  );

  // Пришли с фильтром — по статусу (например, с дашборда), поиском
  // или по рекрутёру — группировка «требуют реакции / остальные» здесь
  // только мешала бы, отдаём один плоский отфильтрованный список
  if (filtered) {
    const { items: vacancies } = await listVacancies(actor, {
      status: status as VacancyStatus | undefined,
      query: q,
      recruiterId,
    });

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Вакансии</h1>
            <p className="text-sm text-muted-foreground">{vacancies.length}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/a/vacancies">Сбросить фильтры</Link>
          </Button>
        </div>
        {filterBar}
        <VacancyList
          vacancies={vacancies}
          hrefBase="/a/vacancies"
          showClient
          emptyText="Ничего не нашлось."
        />
      </div>
    );
  }

  const { items: vacancies } = await listVacancies(actor);

  // Новые заявки — то, на что агентство обязано отреагировать первым делом
  // Дольше всех ждущая заявка — первой. Общий порядок списка (по дате
  // создания) для очереди не годится: он ставит наверх свежую заявку,
  // а не ту, по которой клиент ждёт ответа третий день
  const incoming = vacancies
    .filter((v) => ["SUBMITTED", "CLARIFYING", "ESTIMATED"].includes(v.status))
    .sort((a, b) => {
      const waitA = (a.submittedAt ?? a.createdAt).getTime();
      const waitB = (b.submittedAt ?? b.createdAt).getTime();
      return waitA - waitB;
    });
  const rest = vacancies.filter((v) => !incoming.includes(v));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Вакансии</h1>
          <p className="text-sm text-muted-foreground">
            Всего {vacancies.length}
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            {/* Пригодится, когда вакансию продиктовали голосом:
                заставлять клиента идти в кабинет значит не получить заявку */}
            <Link href="/a/vacancies/new">Завести за клиента</Link>
          </Button>
        )}
      </div>

      {filterBar}

      {incoming.length > 0 && (
        <section className="space-y-3">
          {/*
            Красный счётчик означает «сделай прямо сейчас», и адресован он
            только тем, кто может принять заявку. Рекрутёр приёмку не
            делает: для него это чужая очередь, и громкий бейдж на ней
            обесценивал бы все остальные красные метки в кабинете.
            Вакансии он всё равно видит — но как предупреждение о том,
            что скоро придёт в работу.
          */}
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">
              {canAccept ? "Требуют реакции" : "Скоро в работу"}
            </h2>
            {canAccept ? (
              <Badge variant="destructive">{incoming.length}</Badge>
            ) : (
              <Badge variant="outline">{incoming.length}</Badge>
            )}
          </div>
          <VacancyList
            vacancies={incoming}
            hrefBase="/a/vacancies"
            showClient
            emptyText=""
          />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          {incoming.length > 0 ? "Остальные" : "Все вакансии"}
        </h2>
        <VacancyList
          vacancies={rest}
          hrefBase="/a/vacancies"
          showClient
          emptyText="Пока ни одной вакансии в работе."
        />
      </section>
    </div>
  );
}
