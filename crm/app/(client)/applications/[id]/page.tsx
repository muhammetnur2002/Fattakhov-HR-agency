import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateProfile } from "@/components/applications/candidate-profile";
import { DecisionPanel } from "@/components/applications/decision-panel";
import { PrintProfileButton } from "@/components/applications/print-profile-button";
import { UndoRejectButton } from "@/components/applications/undo-reject-button";
import { CommentThread } from "@/components/comments/comment-thread";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canDo } from "@/lib/access";
import { requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  APPLICATION_OUTCOME_LABELS,
  REJECTION_REASON_LABELS,
} from "@/lib/labels";
import { getApplication } from "@/lib/services/applications";
import { listApplicationComments } from "@/lib/services/comments";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireClientActor();
  const application = await getApplication(actor, id);
  return { title: application?.candidate.fullName ?? "Кандидат" };
}

export default async function ClientApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireClientActor();

  // getApplication фильтрует по BR-3: непредставленный кандидат
  // не найдётся и превратится в 404
  const application = await getApplication(actor, id);
  if (!application) notFound();

  const closed =
    application.outcome === "REJECTED" || application.outcome === "WITHDRAWN";

  const subject = {
    clientId: application.vacancy.clientId,
    hiringManagerId: application.vacancy.hiringManagerId,
  };

  const comments = await listApplicationComments(actor, application.id);
  const canDecide = canDo(actor, "application.decide", subject);

  // BR-14: если решение внесло агентство со слов клиента, он должен
  // об этом узнать, а не обнаружить чужое решение в своей карточке
  const onBehalfBy = application.submittedOnBehalfById
    ? await prisma.user.findFirst({
        where: { id: application.submittedOnBehalfById },
        select: { fullName: true },
      })
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-start justify-between gap-2">
          {/* min-w-0 + truncate: длинное название вакансии на телефоне
              обрезалось не само, а выталкивало кнопку печати за экран */}
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 min-w-0 print:hidden">
            <Link href={`/vacancies/${application.vacancy.id}`} className="min-w-0">
              <span className="truncate">
                ← №{application.vacancy.number} {application.vacancy.title}
              </span>
            </Link>
          </Button>
          {/* Печать/PDF отдаёт только профиль и краткое обоснование —
              внутреннее решение и переписку с рекрутером наружу не отдаём
              (см. print:hidden ниже на этих блоках) */}
          <PrintProfileButton />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {application.candidate.fullName}
          </h1>
          <Badge>{application.stage.name}</Badge>
          {closed && (
            <Badge variant="secondary">
              {APPLICATION_OUTCOME_LABELS[application.outcome]}
            </Badge>
          )}
        </div>
      </div>

      {/* Первое, что должен прочитать клиент — почему ему показали
          этого человека (ТЗ 7.2.5) */}
      {application.presentationSummary && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Почему подходит</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm">
            {application.presentationSummary}
          </CardContent>
        </Card>
      )}

      {closed && application.rejectionReason && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">Кандидат выбыл</CardTitle>
            <CardDescription>
              {REJECTION_REASON_LABELS[application.rejectionReason]}
            </CardDescription>
          </CardHeader>
          {/* Отменить можно только своё решение — отказ, занесённый через
              панель решения. Уход кандидата (WITHDRAWN своей волей через
              отдельную форму агентства) отменить нельзя, это не ошибка клика */}
          {canDecide && application.clientDecision === "REJECT" && (
            <CardContent>
              <UndoRejectButton applicationId={application.id} />
            </CardContent>
          )}
        </Card>
      )}

      {onBehalfBy && application.clientDecisionAt && (
        <Alert>
          <AlertDescription>
            Решение по кандидату внёс {onBehalfBy.fullName} со стороны
            агентства {formatDateTime(application.clientDecisionAt)} — со
            слов вашей команды. Если это ошибка, напишите в обсуждении ниже.
          </AlertDescription>
        </Alert>
      )}

      {canDecide && !closed && (
        <Card className="border-primary/40 print:hidden">
          <CardHeader>
            <CardTitle className="text-base">Ваше решение</CardTitle>
            <CardDescription>
              {application.clientDecision
                ? "Решение принято, но его можно изменить."
                : "Рекрутер ждёт вашей реакции, чтобы двигаться дальше."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DecisionPanel
              applicationId={application.id}
              onBehalf={false}
              currentDecision={application.clientDecision}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Профиль</CardTitle>
        </CardHeader>
        <CardContent>
          <CandidateProfile
            candidate={application.candidate}
            attachments={application.attachments}
            // Контакты кандидата клиенту не отдаём: это и есть работа,
            // за которую он платит
            showContacts={false}
          />
        </CardContent>
      </Card>

      <Card id="discussion" className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Обсуждение</CardTitle>
          <CardDescription>
            Вопросы рекрутеру по этому кандидату. Он видит их сразу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={comments ?? []}
            applicationId={application.id}
            canWrite={canDo(actor, "comment.writeShared", subject)}
            canWriteInternal={false}
            canDeleteAny={canDo(actor, "comment.deleteAny")}
            currentUserId={actor.id}
            emptyText="Пока тихо. Спросите, если что-то непонятно по кандидату."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
