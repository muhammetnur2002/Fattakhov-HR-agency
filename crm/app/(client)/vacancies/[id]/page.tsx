import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientVacancyActions } from "@/components/vacancies/client-vacancy-actions";
import { VacancyBrief } from "@/components/vacancies/vacancy-brief";
import { VacancyStatusBadge } from "@/components/vacancies/vacancy-list";
import { PrintButton } from "@/components/shell/print-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CommentThread } from "@/components/comments/comment-thread";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { canDo, filterVisibleStages } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format-date";
import { listPipeline } from "@/lib/services/applications";
import { listVacancyComments } from "@/lib/services/comments";
import { getVacancy } from "@/lib/services/vacancies";
import { clientCanEditBrief } from "@/lib/services/vacancy-status";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireClientActor();
  const vacancy = await getVacancy(actor, id);
  return { title: vacancy ? `№${vacancy.number} ${vacancy.title}` : "Вакансия" };
}

export default async function ClientVacancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireClientActor();

  // getVacancy уже фильтрует по видимости: чужая вакансия просто не найдётся
  // и превратится в 404, а не в 403 (BR-28)
  const vacancy = await getVacancy(actor, id);
  if (!vacancy) notFound();

  const hiringManager = vacancy.hiringManagerId
    ? await prisma.user.findFirst({
        where: { id: vacancy.hiringManagerId },
        select: { fullName: true },
      })
    : null;

  const recruiter = vacancy.leadRecruiterId
    ? await prisma.user.findFirst({
        where: { id: vacancy.leadRecruiterId },
        select: { fullName: true, position: true, email: true },
      })
    : null;

  const subject = {
    clientId: vacancy.clientId,
    hiringManagerId: vacancy.hiringManagerId,
  };
  const editable = clientCanEditBrief(vacancy.status);

  // Внутренние этапы клиенту не показываем даже пустыми колонками (BR-3)
  const stages = filterVisibleStages(actor, vacancy.stages);
  const pipeline =
    stages.length > 0 ? await listPipeline(actor, vacancy.id) : [];
  const comments = await listVacancyComments(actor, vacancy.id);

  // Часы спрашиваем один раз на страницу — см. KanbanBoard
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-2">
          {/* min-w-0 + truncate: длинное название вакансии на телефоне
              обрезалось не само, а выталкивало кнопку печати за экран */}
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 min-w-0 print:hidden">
            <Link href="/vacancies" className="min-w-0">
              <span className="truncate">← Вакансии</span>
            </Link>
          </Button>
          {/* Печать/PDF отдаёт только бриф — статус и обсуждение с
              рекрутером наружу не отдаём (см. print:hidden ниже) */}
          <PrintButton label="Скачать бриф" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            <span className="text-muted-foreground">№{vacancy.number}</span>{" "}
            {vacancy.title}
          </h1>
          <VacancyStatusBadge status={vacancy.status} />
        </div>
      </div>

      {/* Что сейчас происходит — первое, что должен понять клиент.
          Сам статус в печать не идёт: на бумаге он устареет быстрее,
          чем документ кто-то откроет повторно */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">{statusHeadline(vacancy.status)}</CardTitle>
          <CardDescription>
            {statusExplanation(vacancy, recruiter?.fullName ?? null)}
          </CardDescription>
        </CardHeader>
        {(canDo(actor, "vacancy.hold", subject) ||
          canDo(actor, "vacancy.close", subject)) && (
          <CardContent>
            <ClientVacancyActions
              vacancyId={vacancy.id}
              status={vacancy.status}
              canHold={canDo(actor, "vacancy.hold", subject)}
              canClose={canDo(actor, "vacancy.close", subject)}
            />
          </CardContent>
        )}
      </Card>

      {stages.length > 0 && (
        <div className="space-y-3 print:hidden">
          <div>
            <h2 className="text-lg font-medium">Кандидаты</h2>
            <p className="text-sm text-muted-foreground">
              {pipeline.length === 0
                ? "Пока никого не представили — как только появятся кандидаты, они будут здесь."
                : "Кандидаты, которых мы вам представили."}
            </p>
          </div>
          <KanbanBoard
            stages={stages}
            cards={pipeline}
            hrefBase="/applications"
            compareEnabled
            canDecide={canDo(actor, "application.decide", subject)}
            now={now.getTime()}
          />
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Бриф</CardTitle>
            {!editable && (
              <CardDescription>
                Заявка в работе — правки через обсуждение с рекрутером,
                чтобы поиск и оценка шли по одним требованиям.
              </CardDescription>
            )}
          </div>
          {editable && canDo(actor, "vacancy.editBrief", subject) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/vacancies/${vacancy.id}/edit`}>Изменить</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <VacancyBrief
            brief={vacancy}
            hiringManagerName={hiringManager?.fullName}
          />
        </CardContent>
      </Card>

      <Card id="discussion" className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Обсуждение вакансии</CardTitle>
          <CardDescription>
            {editable
              ? "Вопросы и уточнения по заявке."
              : "Здесь просите изменить требования — рекрутер поправит бриф и продолжит поиск по новым."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={comments ?? []}
            vacancyId={vacancy.id}
            canWrite={canDo(actor, "comment.writeShared", subject)}
            canWriteInternal={false}
            canDeleteAny={canDo(actor, "comment.deleteAny")}
            currentUserId={actor.id}
            emptyText="Пока вопросов не было."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function statusHeadline(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Черновик не отправлен";
    case "SUBMITTED":
      return "Заявка у нас, изучаем";
    case "CLARIFYING":
      return "Ждём ваших уточнений";
    case "ESTIMATED":
      return "Мы оценили сроки — подтвердите";
    case "ACTIVE":
      return "Вакансия в работе";
    case "ON_HOLD":
      return "Работа приостановлена";
    case "CLOSED_SUCCESS":
      return "Вакансия закрыта наймом";
    case "CLOSED_CANCELLED":
      return "Заявка отменена";
    default:
      return "Вакансия закрыта";
  }
}

function statusExplanation(
  vacancy: {
    status: string;
    estimatedFirstCandidatesAt: Date | null;
    activatedAt: Date | null;
    closeReason: string | null;
  },
  recruiterName: string | null,
): string {
  const parts: string[] = [];

  if (vacancy.status === "ACTIVE") {
    if (recruiterName) parts.push(`Рекрутер — ${recruiterName}.`);
    if (vacancy.estimatedFirstCandidatesAt) {
      parts.push(
        `Первые кандидаты ожидаются к ${formatDate(vacancy.estimatedFirstCandidatesAt)}.`,
      );
    }
    if (parts.length === 0) parts.push("Подбираем кандидатов.");
  } else if (vacancy.status === "SUBMITTED") {
    parts.push("Обычно отвечаем в течение рабочего дня.");
  } else if (vacancy.status === "ESTIMATED" && vacancy.estimatedFirstCandidatesAt) {
    parts.push(
      `Первые кандидаты — к ${formatDate(vacancy.estimatedFirstCandidatesAt)}.`,
    );
  } else if (vacancy.closeReason) {
    parts.push(vacancy.closeReason);
  }

  return parts.join(" ");
}
