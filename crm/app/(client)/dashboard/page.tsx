import { ApplicationList } from "@/components/candidates/application-list";
import { StatCard, StatRow } from "@/components/shell/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { listApplications } from "@/lib/services/applications";
import { getClientDashboardStats } from "@/lib/services/dashboard";

export const metadata = { title: "Дашборд" };

export default async function ClientDashboard() {
  const actor = await requireClientActor();
  const [stats, { items: awaiting }, pendingAgreement] = await Promise.all([
    getClientDashboardStats(actor),
    listApplications(actor, { awaitingDecision: true }),
    // Онбординг пускает сюда сразу после выбора тарифа, до подтверждения
    // агентством (BR-1 блокирует только запуск вакансии, не сам вход) —
    // без этой плашки дашборд с одними нулями выглядит как «ничего
    // не произошло», хотя условия уже приняты в обработку
    actor.clientId
      ? prisma.agreement.findFirst({
          where: { clientId: actor.clientId, status: "PENDING" },
          select: { id: true },
        })
      : null,
  ]);

  return (
    /*
      Ширина отдана экрану: у ноутбуков она разная, и треть окна,
      отрезанная ограничением, — это треть неиспользованного места.

      Прежде здесь стояло max-w-6xl, и поставлено оно было не зря:
      без него имя, сумма и бейджи разъезжались большими пустыми
      промежутками. Но лечило оно следствие. Причина — в самой строке:
      весь избыток ширины доставался одной растягивающейся колонке.
      Теперь строки списков разложены долевой сеткой (см. VacancyList),
      избыток делится между колонками, и ограничение больше не нужно.
    */
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Дашборд</h1>
        <p className="text-sm text-muted-foreground">
          Что происходит по вашим вакансиям
        </p>
      </div>

      {pendingAgreement && (
        <Alert>
          <AlertTitle>Условия сотрудничества на подтверждении</AlertTitle>
          <AlertDescription>
            Мы получили ваш выбор и проверяем его — обычно это занимает
            рабочий день. Отправить первую заявку на подбор можно уже
            сейчас: в работу мы возьмём её, как только всё подтвердим.
          </AlertDescription>
        </Alert>
      )}

      <StatRow>
        {/* Первым идёт то, что требует действия: остальные три числа
            описывают положение дел, а это просит ответа сегодня */}
        <StatCard
          label="Ждут вашего решения"
          value={stats.awaitingDecision}
          hint="Кандидаты представлены, реакции нет"
          accent
          href="/candidates?filter=awaiting"
        />
        <StatCard
          label="Активных вакансий"
          value={stats.activeVacancies}
          href="/vacancies?status=ACTIVE"
        />
        <StatCard
          label="Интервью на неделе"
          value={stats.interviewsThisWeek}
          hint="Подтверждённые встречи"
          href="/calendar"
        />
        <StatCard
          label="Закрыто за 90 дней"
          value={stats.closedLast90Days}
          hint="Вакансий закрыто наймом"
          href="/vacancies?status=CLOSED_SUCCESS"
        />
      </StatRow>

      {awaiting.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-medium">Требуют вашего решения</h2>
            <p className="text-sm text-muted-foreground">
              Пока ответа нет, кандидат смотрит другие предложения — это
              главная причина, по которой подбор срывается на финише.
            </p>
          </div>
          <ApplicationList
            applications={awaiting}
            hrefBase="/applications"
            emptyText=""
          />
        </div>
      )}
    </div>
  );
}
