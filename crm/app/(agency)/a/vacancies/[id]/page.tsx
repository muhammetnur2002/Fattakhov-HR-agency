import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AgencyNotesForm,
  AssignRecruitersForm,
  VacancyIntake,
  VacancyStatusActions,
} from "@/components/vacancies/agency-vacancy-actions";
import { AddExistingCandidate } from "@/components/candidates/add-existing-candidate";
import { VacancyBrief } from "@/components/vacancies/vacancy-brief";
import { PickFromBase } from "@/components/vacancies/pick-from-base";
import { VacancyBoard } from "@/components/vacancies/vacancy-board";
import { PipelinePreview } from "@/components/vacancies/pipeline-preview";
import { VacancyStatusBadge } from "@/components/vacancies/vacancy-list";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canDo } from "@/lib/access";
import { getUserTimeZone, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CommentThread } from "@/components/comments/comment-thread";
import { listPipeline } from "@/lib/services/applications";
import { listVacancyComments } from "@/lib/services/comments";
import { getVacancy, listRecruitersWithLoad } from "@/lib/services/vacancies";
import { lastBriefEdit } from "@/lib/services/vacancy-brief-edit";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  const vacancy = await getVacancy(actor, id);
  return { title: vacancy ? `№${vacancy.number} ${vacancy.title}` : "Вакансия" };
}

export default async function AgencyVacancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const actor = await requireAgencyActor();
  const timeZone = await getUserTimeZone();

  const vacancy = await getVacancy(actor, id);
  if (!vacancy) notFound();

  const [recruiters, hiringManager] = await Promise.all([
    // С нагрузкой: выбирать ведущего по одному имени — значит держать
    // загрузку команды в голове
    listRecruitersWithLoad(actor),
    vacancy.hiringManagerId
      ? prisma.user.findFirst({
          where: { id: vacancy.hiringManagerId },
          select: { fullName: true },
        })
      : Promise.resolve(null),
  ]);

  const leadRecruiter = recruiters.find((r) => r.id === vacancy.leadRecruiterId);
  const canAccept = canDo(actor, "vacancy.accept", { clientId: vacancy.clientId });
  const canAssign = canDo(actor, "vacancy.assignRecruiter");
  const canMove = canDo(actor, "application.moveStage");

  const pipeline =
    vacancy.stages.length > 0 ? await listPipeline(actor, vacancy.id) : [];
  const vacancyComments = await listVacancyComments(actor, vacancy.id);
  // Внутренние сообщения команды: тот же тред, что и «Внутренний» в обсуждении,
  // только отдельным блоком внизу страницы
  const teamComments = (vacancyComments ?? []).filter((c) => c.visibility === "INTERNAL");
  const canPick = canDo(actor, "application.create");
  const canEditBrief = canDo(actor, "vacancy.editBrief");
  const briefEdit = await lastBriefEdit(vacancy.id);
  const pickableStages = vacancy.stages
    .filter((s) => !s.visibleToClient && !s.isTerminal)
    .map((s) => ({ id: s.id, name: s.name }));

  // Часы спрашиваем один раз на страницу — см. KanbanBoard
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/a/vacancies">Вакансии</BackLink>

        <div className="flex flex-wrap items-center gap-3">
          <PageTitle>
            <span className="text-muted-foreground">№{vacancy.number}</span>{" "}
            {vacancy.title}
          </PageTitle>
          <VacancyStatusBadge status={vacancy.status} />
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          <Link
            href={`/a/clients/${vacancy.client.id}`}
            className="underline underline-offset-2"
          >
            {vacancy.client.name}
          </Link>
          {" · "}
          {vacancy._count.applications} кандидатов
          {leadRecruiter ? ` · ${leadRecruiter.fullName}` : " · рекрутер не назначен"}
        </p>
      </div>

      {/* Приёмка заявки — главное действие, пока вакансия не запущена */}
      {canAccept && (
        <IntakeCard
          timeZone={timeZone}
          vacancy={vacancy}
          recruiters={recruiters}
          canAssign={canDo(actor, "vacancy.assignRecruiter")}
        />
      )}

      <Tabs
        defaultValue={
          tab === "discussion"
            ? "discussion"
            : tab === "brief"
              ? "brief"
              : vacancy.stages.length > 0
              ? "pipeline"
              : "brief"
        }
      >
        <TabsList>
          {/* Воронка видна всегда: до запуска вакансии в ней серые пустые колонки */}
          <TabsTrigger value="pipeline">Воронка</TabsTrigger>
          <TabsTrigger value="brief">Бриф</TabsTrigger>
          <TabsTrigger value="discussion">Обсуждение</TabsTrigger>
          <TabsTrigger value="team">Команда</TabsTrigger>
          <TabsTrigger value="internal">Внутреннее</TabsTrigger>
        </TabsList>

        {vacancy.stages.length === 0 && (
          <TabsContent value="pipeline" className="pt-4">
            <PipelinePreview />
          </TabsContent>
        )}

        {vacancy.stages.length > 0 && (
          <TabsContent value="pipeline" className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Перетащите карточку, чтобы сменить этап. Представление клиенту —
                через карточку кандидата: там проверяются резюме и саммари.
              </p>
              <div className="flex gap-2">
                {canPick && pickableStages.length > 0 && (
                  <PickFromBase vacancyId={vacancy.id} stages={pickableStages} />
                )}
                <AddExistingCandidate vacancyId={vacancy.id} />
                <Button asChild size="sm">
                  <Link href={`/a/candidates/new?vacancyId=${vacancy.id}`}>
                    Новый кандидат
                  </Link>
                </Button>
              </div>
            </div>

            <VacancyBoard
              vacancyId={vacancy.id}
              stages={vacancy.stages}
              cards={pipeline}
              pickableStages={canPick ? pickableStages : []}
              draggable={canMove}
              bulkEnabled={canMove}
              now={now.getTime()}
            />
          </TabsContent>
        )}

        <TabsContent value="brief" className="space-y-3 pt-4">
          {canEditBrief && !vacancy.status.startsWith("CLOSED_") && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {briefEdit
                  ? `Изменено${briefEdit.by ? `: ${briefEdit.by}` : ""}, ${formatDate(briefEdit.at, timeZone)}`
                  : "Бриф ещё не правили со стороны агентства."}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/a/vacancies/${vacancy.id}/edit`}>Редактировать бриф</Link>
              </Button>
            </div>
          )}
          <Card>
            <CardContent>
              <VacancyBrief timeZone={timeZone}
                brief={vacancy}
                hiringManagerName={hiringManager?.fullName}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discussion" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Обсуждение вакансии</CardTitle>
              <CardDescription>
                Уточнения по брифу с клиентом. Внутренние заметки по вакансии —
                во вкладке «Внутреннее».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommentThread
                comments={vacancyComments ?? []}
                vacancyId={vacancy.id}
                canWrite={canDo(actor, "comment.writeShared")}
                canWriteInternal={canDo(actor, "comment.writeInternal")}
                canDeleteAny={canDo(actor, "comment.deleteAny")}
                currentUserId={actor.id}
                emptyText="Вопросов по брифу пока не было."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Кто ведёт вакансию</CardTitle>
            </CardHeader>
            <CardContent>
              {canAssign ? (
                <AssignRecruitersForm
                  vacancyId={vacancy.id}
                  recruiters={recruiters}
                  leadRecruiterId={vacancy.leadRecruiterId}
                  recruiterIds={vacancy.recruiterIds}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {leadRecruiter
                    ? `Ведущий: ${leadRecruiter.fullName}`
                    : "Рекрутер пока не назначен"}
                  . Назначает руководитель подбора.
                </p>
              )}
            </CardContent>
          </Card>

          {vacancy.stages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Воронка</CardTitle>
                <CardDescription>
                  Этапы созданы при запуске вакансии. Скрытые от клиента
                  помечены.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {vacancy.stages.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="text-muted-foreground">{s.order}.</span>
                      <span>{s.name}</span>
                      {!s.visibleToClient && (
                        <Badge variant="secondary">не видно клиенту</Badge>
                      )}
                      {s.slaHours && (
                        <span className="text-xs text-muted-foreground">
                          норматив {s.slaHours} ч
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Статус</CardTitle>
            </CardHeader>
            <CardContent>
              <VacancyStatusActions
                vacancyId={vacancy.id}
                status={vacancy.status}
                canDelete={canDo(actor, "vacancy.delete", { clientId: vacancy.clientId })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="internal" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Внутренние заметки</CardTitle>
            </CardHeader>
            <CardContent>
              <AgencyNotesForm
                vacancyId={vacancy.id}
                notes={vacancy.agencyNotes}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Комментарии команды: только сотрудники агентства, клиент блока не видит */}
      {canDo(actor, "comment.writeInternal") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Комментарии команды</CardTitle>
            <CardDescription>
              Видят только сотрудники агентства. Клиенту этот блок не показывается.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CommentThread
              comments={teamComments}
              vacancyId={vacancy.id}
              canWrite
              canWriteInternal
              internalOnly
              canDeleteAny={canDo(actor, "comment.deleteAny")}
              currentUserId={actor.id}
              emptyText="Пока ничего нет. Напишите коллегам по этой вакансии."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IntakeCard({
  vacancy,
  recruiters,
  canAssign,
  timeZone,
}: {
  vacancy: {
    id: string;
    status: Parameters<typeof VacancyIntake>[0]["status"];
    submittedAt: Date | null;
    estimatedFirstCandidatesAt: Date | null;
  };
  recruiters: Parameters<typeof VacancyIntake>[0]["recruiters"];
  canAssign: boolean;
  timeZone: string;
}) {
  if (!["SUBMITTED", "CLARIFYING", "ESTIMATED"].includes(vacancy.status)) {
    return null;
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">
          {vacancy.status === "ESTIMATED"
            ? "Сроки отправлены — ждём подтверждения клиента"
            : vacancy.status === "CLARIFYING"
              ? "Ждём уточнений от клиента"
              : "Новая заявка"}
        </CardTitle>
        <CardDescription>
          {/* formatDate уже заканчивается на «г.» — своя точка тут даёт вторую */}
          {vacancy.submittedAt
            ? `Отправлена ${formatDate(vacancy.submittedAt, timeZone)} `
            : ""}
          {vacancy.estimatedFirstCandidatesAt
            ? `Обещали кандидатов к ${formatDate(vacancy.estimatedFirstCandidatesAt, timeZone)}.`
            : vacancy.status === "CLARIFYING"
              ? "Задали вопросы — пока клиент не ответит, заявка ждёт."
              : "Возьмите в работу или назовите сроки."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <VacancyIntake
          vacancyId={vacancy.id}
          status={vacancy.status}
          recruiters={recruiters}
          canAssign={canAssign}
        />
      </CardContent>
    </Card>
  );
}
