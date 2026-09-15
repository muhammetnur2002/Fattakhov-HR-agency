import { StatCard, StatRow } from "@/components/shell/stat-card";
import { canDo } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import { getAgencyDashboardStats } from "@/lib/services/dashboard";

export const metadata = { title: "Дашборд агентства" };

export default async function AgencyDashboard() {
  const actor = await requireAgencyActor();
  const stats = await getAgencyDashboardStats(actor);
  const manages = canDo(actor, "vacancy.assignRecruiter");
  const managesBusiness = canDo(actor, "invoice.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Дашборд</h1>
        <p className="text-sm text-muted-foreground">
          Состояние подбора по агентству
        </p>
      </div>

      <StatRow>
        {/* Зависшие у клиента представления - главная точка утечки
            сроков, поэтому они впереди и крупнее */}
        <StatCard
          label="Ждут решения клиента"
          value={stats.awaitingClientDecision}
          hint="Представлены, реакции нет"
          accent
          href="/a/candidates?tab=awaiting"
        />
        {/*
          Руководителю отвечать за распределение работы, поэтому его
          первые цифры — про перекосы, а не про объём: вакансия без
          ведущего и кандидат, стоящий дольше норматива, до этого не
          показывались ни на одном экране.
        */}
        {manages && stats.unassignedVacancies !== null && (
          <StatCard
            label="Без рекрутёра"
            value={stats.unassignedVacancies}
            hint="В работе, ведущий не назначен"
            accent={stats.unassignedVacancies > 0}
            // Статус обязателен: плитка считает только запущенные, и без
            // него список показал бы ещё и черновики с неразобранными
            href="/a/vacancies?recruiterId=none&status=ACTIVE"
          />
        )}
        {manages && stats.overdueStages !== null && (
          <StatCard
            label="Просрочено по этапам"
            value={stats.overdueStages}
            hint="Кандидаты стоят дольше норматива"
            accent={stats.overdueStages > 0}
            href="/a/analytics"
          />
        )}

        {/*
          Тому, кто ведёт договоры и счета, а не воронку, «Мои
          вакансии» ничего не сообщает — он никогда не в команде
          вакансии. Вместо неё — то, за что отвечает эта роль: договор,
          зависший на подтверждении, и счёт, который клиент просрочил.
          Обе цифры уже считались на /a/clients и /a/finance порознь,
          сюда просто раньше не доходили.
        */}
        {managesBusiness && stats.pendingAgreements !== null && (
          <StatCard
            label="Ждут подтверждения"
            value={stats.pendingAgreements}
            hint="Договоры с выбранными условиями"
            accent={stats.pendingAgreements > 0}
            href="/a/clients"
          />
        )}
        {managesBusiness && stats.overdueInvoices !== null && (
          <StatCard
            label="Просрочено"
            value={stats.overdueInvoices}
            hint="Выставленные счета не оплачены в срок"
            accent={stats.overdueInvoices > 0}
            href="/a/finance"
          />
        )}

        {/* Тому, кто работу не раздаёт и деньги не ведёт, важнее
            собственная нагрузка, чем общий объём по агентству */}
        {!manages && !managesBusiness && (
          <StatCard
            label="Мои вакансии"
            value={stats.myVacancies}
            hint="Где я в команде"
            href={`/a/vacancies?recruiterId=${actor.id}`}
          />
        )}

        <StatCard
          label="Вакансий в работе"
          value={stats.activeVacancies}
          href="/a/vacancies?status=ACTIVE"
        />
        <StatCard
          label="Кандидатов в воронках"
          value={stats.candidatesInProgress}
          href="/a/candidates"
        />
        <StatCard
          label="Интервью на неделе"
          value={stats.interviewsThisWeek}
          href="/a/calendar"
        />
      </StatRow>
    </div>
  );
}
