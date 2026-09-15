import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateProfile } from "@/components/applications/candidate-profile";
import { DecisionPanel } from "@/components/applications/decision-panel";
import {
  PresentForm,
  RejectForm,
} from "@/components/applications/present-form";
import { CommentThread } from "@/components/comments/comment-thread";
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
import { requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  APPLICATION_OUTCOME_LABELS,
  REJECTION_REASON_LABELS,
  REJECTION_SIDE_LABELS,
} from "@/lib/labels";
import { getApplication } from "@/lib/services/applications";
import { consentIsValid } from "@/lib/services/consent";
import { InterviewSection } from "@/components/interviews/interview-section";
import { listApplicationComments } from "@/lib/services/comments";
import { listApplicationInterviews } from "@/lib/services/interviews";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  const application = await getApplication(actor, id);
  return { title: application?.candidate.fullName ?? "Кандидат" };
}

export default async function AgencyApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();

  const application = await getApplication(actor, id);
  if (!application) notFound();

  const stageNames = new Map(
    application.vacancy.stages.map((s) => [s.id, s.name]),
  );
  const actorIds = [...new Set(application.transitions.map((t) => t.actorId))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, fullName: true },
  });
  const actorNames = new Map(actors.map((u) => [u.id, u.fullName]));

  const comments = await listApplicationComments(actor, application.id);
  const interviews = await listApplicationInterviews(actor, application.id);

  // На встречу зовут и людей клиента, и команду агентства
  const interviewParticipants = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      isActive: true,
      OR: [
        { clientId: application.vacancy.clientId },
        { clientId: null, role: { in: ["RECRUITER", "HEAD", "OWNER"] } },
      ],
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  const hasResume = application.attachments.some((a) => a.kind === "RESUME");
  // Тот же consentIsValid, что и в presentToClient (BR-33/34): статус
  // GIVEN сам по себе не значит "можно представлять" — фоновая задача
  // проставляет EXPIRED не мгновенно, и подсказка здесь не должна
  // молчать об истёкшем сроке в это окно
  const hasConsent = consentIsValid(
    application.candidate.consentStatus,
    application.candidate.consentExpiresAt,
  );
  const canPresent = canDo(actor, "application.present");
  const alreadyPresented = application.presentedAt !== null;
  const closed =
    application.outcome === "REJECTED" || application.outcome === "WITHDRAWN";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={`/a/vacancies/${application.vacancy.id}`}>
            ← №{application.vacancy.number} {application.vacancy.title}
          </Link>
        </Button>

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

        <p className="mt-1 text-sm text-muted-foreground">
          {application.vacancy.client.name}
          {alreadyPresented && " · представлен клиенту"}
        </p>
      </div>

      {closed && application.rejectionReason && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {application.rejectedBy
                ? REJECTION_SIDE_LABELS[application.rejectedBy]
                : "Отказ"}
            </CardTitle>
            <CardDescription>
              {REJECTION_REASON_LABELS[application.rejectionReason]}
              {application.rejectionComment
                ? `. ${application.rejectionComment}`
                : ""}
            </CardDescription>
          </CardHeader>
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
            showContacts
          />
        </CardContent>
      </Card>

      {/* Внутреннее саммари: клиенту не показывается никогда */}
      {application.candidate.summary && (
        <Card className="border-dashed bg-muted/40">
          <CardHeader>
            <CardTitle className="text-base">Заметки рекрутера</CardTitle>
            <CardDescription>Клиент этого не видит</CardDescription>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm">
            {application.candidate.summary}
          </CardContent>
        </Card>
      )}

      {alreadyPresented && application.presentationSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Что видит клиент</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm">
            {application.presentationSummary}
          </CardContent>
        </Card>
      )}

      {!alreadyPresented && !closed && canPresent && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Представить клиенту</CardTitle>
            <CardDescription>
              После этого карточка станет видна клиенту — до этого момента
              он о кандидате не знает.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PresentForm
              applicationId={application.id}
              candidateId={application.candidateId}
              hasResume={hasResume}
              hasConsent={hasConsent}
              defaultSalary={
                application.candidate.salaryExpectation != null
                  ? Number(application.candidate.salaryExpectation)
                  : null
              }
            />
          </CardContent>
        </Card>
      )}

      {!closed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Отказ</CardTitle>
          </CardHeader>
          <CardContent>
            <RejectForm applicationId={application.id} />
          </CardContent>
        </Card>
      )}

      {alreadyPresented && !closed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Решение клиента</CardTitle>
            <CardDescription>
              {application.clientDecision
                ? "Решение уже есть — можно изменить, если клиент передумал."
                : "Клиент ещё не отреагировал. Если он сказал голосом — внесите здесь."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DecisionPanel
              applicationId={application.id}
              onBehalf
              currentDecision={application.clientDecision}
            />
          </CardContent>
        </Card>
      )}

      {/* Якорь: из календаря ведёт кнопка «Предложить время» */}
      <Card id="interviews">
        <CardHeader>
          <CardTitle className="text-base">Встречи</CardTitle>
          <CardDescription>
            Предложите два-пять вариантов времени — кандидат выберет сам
            по ссылке, без переписки.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InterviewSection
            applicationId={application.id}
            canManage={canDo(actor, "interview.proposeSlots")}
            participants={interviewParticipants}
            interviews={interviews.map((i) => ({
              id: i.id,
              type: i.type,
              status: i.status,
              format: i.format,
              scheduledAt: i.scheduledAt?.toISOString() ?? null,
              durationMinutes: i.durationMinutes,
              timezone: i.timezone,
              meetingUrl: i.meetingUrl,
              address: i.address,
              feedbackRating: i.feedbackRating,
              feedbackNote: i.feedbackNote,
              slots: i.slots.map((s) => ({
                id: s.id,
                startsAt: s.startsAt.toISOString(),
                isSelected: s.isSelected,
              })),
            }))}
          />
        </CardContent>
      </Card>

      <Card id="discussion">
        <CardHeader>
          <CardTitle className="text-base">Обсуждение</CardTitle>
          <CardDescription>
            Общие комментарии видит клиент. Внутренние — только агентство.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={comments ?? []}
            applicationId={application.id}
            canWrite={canDo(actor, "comment.writeShared")}
            canWriteInternal={canDo(actor, "comment.writeInternal")}
            canDeleteAny={canDo(actor, "comment.deleteAny")}
            currentUserId={actor.id}
            emptyText="Обсуждения пока нет."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">История</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {application.transitions.map((t) => (
              <li key={t.id} className="flex flex-wrap gap-x-2 border-b pb-3 last:border-0 last:pb-0">
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(t.createdAt)}
                </span>
                <span>
                  {t.fromStageId && t.fromStageId !== t.toStageId
                    ? `${stageNames.get(t.fromStageId) ?? "—"} → ${stageNames.get(t.toStageId) ?? "—"}`
                    : (stageNames.get(t.toStageId) ?? "—")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {actorNames.get(t.actorId) ?? ""}
                </span>
                {t.comment && (
                  <span className="w-full text-xs text-muted-foreground">
                    {t.comment}
                  </span>
                )}
              </li>
            ))}
          </ol>
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
