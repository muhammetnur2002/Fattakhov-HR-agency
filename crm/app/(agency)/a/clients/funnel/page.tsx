import Link from "next/link";
import type * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authorize, getUserTimeZone, requireAgencyActor } from "@/lib/auth/session";
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
import { PageHeader } from "@/components/ui/page-header";
import { PageTitle } from "@/components/ui/page-title";

export const metadata = { title: "Воронка клиентов студплатформы" };

/** Названия этапов с мягкими переносами там, где слово не влезает в колонку (на 1024 — 156 точек). Текст тот же, что в FUNNEL_STAGE_LABELS. */
const SOFT_LABELS: Partial<Record<FunnelStage, string>> = {
  REGISTERED: "Заре\u00ADгистри\u00ADро\u00ADвался",
  READY: "Пора пред\u00ADло\u00ADжить подбор",
};

/**
 * Клиенты, которые работают со студентами прямо из кабинета: где каждый
 * остановился на пути к договору. Задача менеджера — позвонить тем, кто
 * уже получает отклики, пока они не остыли.
 */
export default async function StudentsFunnelPage() {
  const actor = await requireAgencyActor();
  const timeZone = await getUserTimeZone();
  authorize(actor, "client.view");

  const [clients, rows] = await Promise.all([
    listClients(actor),
    fetchStudentsFunnel().catch(() => null),
  ]);

  if (!rows) {
    return (
      <div className="space-y-6">
        <PageTitle>Воронка клиентов студплатформы</PageTitle>
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
      <PageHeader
        title="Воронка клиентов студплатформы"
        description={
          inFunnel.length === 0
            ? "Пока никто из клиентов не заходил на студенческую платформу"
            : `Клиентов на платформе: ${inFunnel.length}. Этап считается по их действиям — вручную двигать не нужно.`
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/a/clients">Все клиенты</Link>
          </Button>
        }
      />

      {/*
        Шапки колонок — общий ряд (subgrid), а не высота «как получилось».

        Подсказка у этапа — от одной строки до пяти («Пять и больше откликов,
        приглашения или найм — самое время позвонить»), название в узкой
        колонке переносится на две-три. Шапка была блоком внутри колонки,
        и первая карточка каждой колонки начиналась на своей высоте: рядом
        стояли карточки на 60–110 точек выше и ниже соседних. Теперь ряд
        шапок общий для пяти колонок и растёт по самой длинной — без
        фиксированных пикселей, переживает любой текст и перенос на 1024.

        Ряды задаёт родитель (`grid-rows-[auto_1fr]`), колонка занимает оба
        (`row-span-2`) и берёт их себе (`grid-rows-subgrid`). Промежуток между
        шапкой и карточками — только `gap-y` родителя, как в invite-form:
        своего у subgrid нет, а `space-y` колонки (нужен ниже lg, где
        колонки идут стопкой) на lg отключён.
      */}
      <div className="grid gap-x-4 gap-y-4 lg:grid-cols-5 lg:grid-rows-[auto_1fr] lg:gap-y-3">
        {FUNNEL_STAGES.map((stage) => {
          const items = byStage.get(stage)!;
          return (
            <section key={stage} className="min-w-0 space-y-3 lg:row-span-2 lg:grid lg:grid-cols-1 lg:grid-rows-subgrid lg:space-y-0">
              <div className="min-w-0">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  {/* «Зарегистрировался» — одно слово, шире колонки на 1024 и 1280: без
                      подсказки браузеру оно ломалось как «Зареги-стировалс-я». Мягкие
                      переносы (SOFT_LABELS) ставят места разрыва по слогам, а
                      `overflow-wrap:anywhere` остаётся про запас — чтобы слово никогда
                      не наезжало на соседнюю колонку и не уходило под счётчик. Словарная
                      расстановка (`hyphens-auto`) не годится: у неё мало точек и она
                      оставляет одинокое «я» на последней строке */}
                  <h2 className="text-sm font-semibold [overflow-wrap:anywhere]">
                    {SOFT_LABELS[stage] ?? FUNNEL_STAGE_LABELS[stage]}
                  </h2>
                  <StatusBadge tone={stage === "READY" && items.length > 0 ? "warning" : "neutral"}>{items.length}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{FUNNEL_STAGE_HINTS[stage]}</p>
              </div>

              <div className="space-y-3">
                {items.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-center text-xs text-muted-foreground">Никого</CardContent>
                  </Card>
                ) : (
                  items.map(({ client, activity }) => (
                    <Link key={client.id} href={`/a/clients/${client.id}`} className="block">
                      <Card className="transition-colors hover:border-primary/40">
                        <CardContent className="space-y-2">
                          <div className="font-medium leading-snug">{client.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[client.city, client.industry].filter(Boolean).join(" · ") || "—"}
                          </div>
                          {/* Подпись слева, число справа; если не помещаются вместе
                              (колонка на 1024 — 156 точек, «Приглашено» шире половины),
                              число переносится под подпись, а не наезжает на неё */}
                          <dl className="space-y-1 text-xs">
                            <FunnelStat label="Вакансий">
                              {activity.published} из {activity.vacancies}
                            </FunnelStat>
                            <FunnelStat label="Откликов">
                              {activity.applications}
                              {activity.newApplications > 0 && ` (новых ${activity.newApplications})`}
                            </FunnelStat>
                            <FunnelStat label="Приглашено">{activity.invited}</FunnelStat>
                            <FunnelStat label="Принято">{activity.hired}</FunnelStat>
                          </dl>
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>Движение: {formatDate(lastMove(activity), timeZone)}</span>
                            {stage !== "CONTRACT" && isCold(activity) && <Badge variant="outline">остыл</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FunnelStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto text-right">{children}</dd>
    </div>
  );
}
