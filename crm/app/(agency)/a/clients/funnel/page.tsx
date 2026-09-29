import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { formatDate } from "@/lib/format-date";
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_HINTS,
  FUNNEL_STAGE_LABELS,
  funnelStage,
  isCold,
  lastMove,
  type FunnelStage,
} from "@/lib/students-funnel";
import { listClients } from "@/lib/services/clients";
import { fetchStudentsFunnel, type StudentsFunnelRow } from "@/lib/students-service";

export const metadata = { title: "Воронка клиентов студплатформы" };

/**
 * Клиенты, которые работают со студентами прямо из кабинета: где каждый
 * остановился на пути к договору. Задача менеджера — позвонить тем, кто
 * уже получает отклики, пока они не остыли.
 */
export default async function StudentsFunnelPage() {
  const actor = await requireAgencyActor();
  authorize(actor, "client.view");

  const [clients, rows] = await Promise.all([
    listClients(actor),
    fetchStudentsFunnel().catch(() => null),
  ]);

  if (!rows) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Воронка клиентов студплатформы</h1>
        <Alert variant="destructive">
          <AlertDescription>
            Студенческая платформа сейчас не отвечает — воронку не построить. Попробуйте обновить страницу чуть позже.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const activityByClient = new Map<string, StudentsFunnelRow>(rows.map((r) => [r.crmClientId, r]));
  // Только те, кто заходил на платформу, и не архив: остальные клиенты к этой воронке не относятся
  const inFunnel = clients
    .filter((c) => c.status !== "ARCHIVED" && activityByClient.has(c.id))
    .map((c) => {
      const activity = activityByClient.get(c.id)!;
      return { client: c, activity, stage: funnelStage(c.status === "ACTIVE", activity) };
    });

  const byStage = new Map<FunnelStage, typeof inFunnel>(FUNNEL_STAGES.map((s) => [s, []]));
  for (const item of inFunnel) byStage.get(item.stage)!.push(item);
  // Внутри этапа — сначала те, кто активнее двигался последним
  for (const list of byStage.values()) {
    list.sort((a, b) => lastMove(b.activity).getTime() - lastMove(a.activity).getTime());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Воронка клиентов студплатформы</h1>
          <p className="text-sm text-muted-foreground">
            {inFunnel.length === 0
              ? "Пока никто из клиентов не заходил на студенческую платформу"
              : `Клиентов на платформе: ${inFunnel.length}. Этап считается по их действиям — вручную двигать не нужно.`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/a/clients">Все клиенты</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {FUNNEL_STAGES.map((stage) => {
          const items = byStage.get(stage)!;
          return (
            <section key={stage} className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{FUNNEL_STAGE_LABELS[stage]}</h2>
                  <Badge variant={stage === "READY" && items.length > 0 ? "default" : "secondary"}>{items.length}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{FUNNEL_STAGE_HINTS[stage]}</p>
              </div>

              {items.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-center text-xs text-muted-foreground">Никого</CardContent>
                </Card>
              ) : (
                items.map(({ client, activity }) => (
                  <Link key={client.id} href={`/a/clients/${client.id}`} className="block">
                    <Card className="transition-colors hover:border-primary/40">
                      <CardContent className="space-y-2 p-4">
                        <div className="font-medium leading-snug">{client.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[client.city, client.industry].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">Вакансий</dt>
                          <dd className="text-right">
                            {activity.published} из {activity.vacancies}
                          </dd>
                          <dt className="text-muted-foreground">Откликов</dt>
                          <dd className="text-right">
                            {activity.applications}
                            {activity.newApplications > 0 && ` (новых ${activity.newApplications})`}
                          </dd>
                          <dt className="text-muted-foreground">Приглашено</dt>
                          <dd className="text-right">{activity.invited}</dd>
                          <dt className="text-muted-foreground">Принято</dt>
                          <dd className="text-right">{activity.hired}</dd>
                        </dl>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Движение: {formatDate(lastMove(activity))}</span>
                          {stage !== "CONTRACT" && isCold(activity) && <Badge variant="outline">остыл</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
