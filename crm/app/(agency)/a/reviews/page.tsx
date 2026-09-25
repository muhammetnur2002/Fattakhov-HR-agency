import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { fetchCrmLinkRequests, fetchModerationQueue, fetchPendingStudyReview } from "@/lib/students-service";

export const metadata = { title: "Проверки" };

/**
 * Проверки студенческой платформы — компании, вакансии, справки студентов
 * и метрики пилота решаются здесь, без перехода на тот сайт. Каждый
 * раздел — по своему доступу (owner выдаёт их в «Сотрудниках»), поэтому
 * список карточек собирается по факту выданных прав, а не показывает
 * то, чего у человека нет.
 */
export default async function ReviewsPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  const grants = effectiveGrants(actor);

  const [queue, study] = await Promise.all([
    grants.includes("students.moderation") ? fetchModerationQueue().catch(() => null) : null,
    grants.includes("students.study") ? fetchPendingStudyReview().catch(() => null) : null,
  ]);
  const linkRequests = grants.includes("students.moderation")
    ? await fetchCrmLinkRequests().catch(() => [])
    : [];

  const cards = [
    grants.includes("students.moderation") && {
      href: "/a/reviews/moderation",
      title: "Компании и вакансии",
      description: "Новые компании и вакансии, ждущие проверки перед публикацией студентам.",
      count: queue ? queue.companies.length + queue.vacancies.length : null,
    },
    grants.includes("students.study") && {
      href: "/a/reviews/study",
      title: "Справки студентов",
      description: "Загруженные справки об обучении — подтверждают учёбу студента.",
      count: study ? study.length : null,
    },
    grants.includes("students.pilot") && {
      href: "/a/reviews/pilot",
      title: "Метрики пилота",
      description: "Числа с доски пилота: регистрации, отклики, публикации, конверсии.",
      count: null,
    },
  ].filter(Boolean) as Array<{ href: string; title: string; description: string; count: number | null }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Проверки</h1>
        <p className="text-sm text-muted-foreground">
          Студенческая платформа — данные читаются и решения принимаются прямо здесь.
        </p>
      </div>

      {linkRequests.length > 0 && (
        <Card className="border-primary/40">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Заявки на привязку к CRM</p>
              <p className="text-sm text-muted-foreground">
                Компании со студенческой платформы просят объединить профиль с клиентом в CRM.
              </p>
            </div>
            <Link href="/a/clients/link-requests" className="shrink-0">
              <Badge className="text-sm">{linkRequests.length}</Badge>
            </Link>
          </CardContent>
        </Card>
      )}

      {cards.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Владелец пока не выдал вам ни одного раздела проверок — доступы выдаются в «Сотрудниках».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    {card.count !== null && card.count > 0 && <Badge>{card.count}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{card.description}</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
