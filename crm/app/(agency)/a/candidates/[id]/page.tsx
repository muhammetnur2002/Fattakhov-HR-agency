import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateProfile } from "@/components/applications/candidate-profile";
import { CandidateCommentsCard, type FeedRow } from "@/components/candidates/candidate-comments";
import { CandidateFilesCard, type CandidateFileRow } from "@/components/candidates/candidate-files";
import { CandidateStatusSelect } from "@/components/candidates/candidate-status";
import { SeatInVacancy } from "@/components/candidates/seat-in-vacancy";
import { SourcingPanel } from "@/components/candidates/sourcing-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EraseButton } from "@/components/pdn/erase-button";
import { OfferWorkCard, StudentChatCard } from "@/components/students/student-candidate-panel";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { APPLICATION_OUTCOME_LABELS, CANDIDATE_SOURCE_LABELS } from "@/lib/labels";
import { getCandidate } from "@/lib/services/candidates";
import { listCandidateFeed } from "@/lib/services/candidate-notes";
import { buildSignedUrl } from "@/lib/storage/signing";
import { LINK_TTL_DAYS } from "@/lib/services/consent";
import {
  canPickStudents,
  listOfferableVacancies,
  loadStudentChat,
} from "@/lib/services/student-candidates";
import {
  isSourcingLead,
  SOURCING_FILES_MESSAGE,
  SOURCING_LEAD_TTL_DAYS,
  sourcingDaysLeft,
  sourcingDeadline,
} from "@/lib/sourcing";
import { BackLink } from "@/components/ui/back-link";
import { PageTitle } from "@/components/ui/page-title";

/**
 * Даты сорсинг-лида — без года: сроки здесь в пределах недель, а полная
 * дата кончается на «г.», и точка после неё превращалась в «г..».
 */
function shortDate(date: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(date),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  const candidate = await getCandidate(actor, id);
  return { title: candidate?.fullName ?? "Кандидат" };
}

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireAgencyActor();
  authorize(actor, "application.viewInternal");

  const candidate = await getCandidate(actor, id);
  if (!candidate) notFound();

  // Кандидат из студенческой платформы: «Предложить работу» и переписка со студентом
  const studentPanels =
    candidate.studentPlatformId && canPickStudents(actor)
      ? {
          chat: await loadStudentChat(actor, candidate.id),
          vacancies: await listOfferableVacancies(actor, candidate.id),
        }
      : null;

  // Удалять данные кандидата может только владелец (BR-35)
  const canErase = canDo(actor, "pdn.auditLog");

  // Файлы, комментарии команды и статус: подписанные ссылки считаются здесь,
  // клиентским компонентам отдаются готовые строки
  const files: CandidateFileRow[] = candidate.attachments.map((a) => ({
    id: a.id,
    kind: a.kind,
    fileName: a.fileName,
    fileSize: a.fileSize,
    visibility: a.visibility,
    createdAt: new Date(a.createdAt).toISOString(),
    url: buildSignedUrl(a.storageKey),
  }));
  const feed: FeedRow[] = (await listCandidateFeed(actor, candidate.id)).map((c) => ({
    id: c.id,
    body: c.body,
    visibility: c.visibility,
    createdAt: c.createdAt.toISOString(),
    author: c.author?.fullName ?? null,
    application: c.application
      ? { id: c.application.id, vacancyLabel: c.application.vacancyLabel }
      : null,
    canDelete: c.author?.id === actor.id || canDo(actor, "comment.deleteAny"),
  }));
  const commentVacancies = candidate.applications.map((a) => ({
    applicationId: a.id,
    label: `№${a.vacancy.number} ${a.vacancy.title} · ${a.vacancy.client.name}`,
  }));
  const isLead = isSourcingLead(candidate);
  // «Посадить в вакансию»: вакансии в работе, где человека ещё нет, и те, где он уже сидит
  const canSeat = candidate.erasureState === "ACTIVE" && canDo(actor, "application.create");
  const seatVacancies = canSeat ? await listOfferableVacancies(actor, candidate.id) : [];
  const seatTaken = candidate.applications.map((a) => ({
    id: a.vacancy.id,
    label: `№${a.vacancy.number} ${a.vacancy.title} · ${a.vacancy.client.name}`,
    stage: a.stage.name,
  }));

  // Сорсинг-лид: согласия ещё не было, идёт срок (lib/services/sourcing.ts).
  // Блок — пока он применим: кандидат в работе или заблокирован именно
  // по сроку сорсинга. Заблокированного по другой причине (требование
  // человека) или уже поставленного в очередь согласие не вернёт — там
  // обещание «получите согласие» было бы неправдой
  const sourcingApplies =
    candidate.erasureState === "ACTIVE" ||
    (candidate.erasureState === "BLOCKED_FOR_ERASURE" &&
      candidate.erasureReason === "SOURCING_EXPIRED");
  const sourcing =
    isSourcingLead(candidate) && candidate.sourcedAt && sourcingApplies
      ? {
          deadline: sourcingDeadline(new Date(candidate.sourcedAt)),
          daysLeft: sourcingDaysLeft(new Date(candidate.sourcedAt)),
          blocked: candidate.erasureState !== "ACTIVE",
        }
      : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <BackLink href="/a/candidates">Кандидаты</BackLink>

        <div className="flex flex-wrap items-center gap-3">
          <PageTitle>{candidate.fullName}</PageTitle>
          {candidate.source === "STUDENT_PLATFORM" && <Badge variant="secondary">🎓 Студплатформа</Badge>}
          {candidate.consentStatus !== "GIVEN" && (
            <Badge variant={sourcing && sourcing.daysLeft <= 3 ? "destructive" : "outline"}>
              {sourcing
                ? sourcing.blocked || sourcing.daysLeft <= 0
                  ? "нет согласия · срок вышел"
                  : `нет согласия · удалится ${shortDate(sourcing.deadline)}`
                : "нет согласия на обработку ПДн"}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {CANDIDATE_SOURCE_LABELS[candidate.source]}
          {candidate.sourceDetails ? ` · ${candidate.sourceDetails}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <CandidateStatusSelect candidateId={candidate.id} status={candidate.status} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/a/candidates/${candidate.id}/edit`}>Редактировать профиль</Link>
          </Button>
        </div>
      </div>

      {studentPanels && (
        <>
          <OfferWorkCard
            candidateId={candidate.id}
            studentName={candidate.fullName}
            vacancies={studentPanels.vacancies.map((v) => ({
              id: v.id,
              label: v.label,
              title: v.title,
            }))}
          />
          <StudentChatCard
            candidateId={candidate.id}
            platformError={studentPanels.chat?.error}
            messages={(studentPanels.chat?.thread?.messages ?? []).map((m) => ({
              id: m.id,
              author: m.author,
              staffName: m.staffName,
              body: m.body,
              createdAt: m.createdAt,
            }))}
          />
        </>
      )}

      {sourcing && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">
              {sourcing.blocked
                ? "Срок вышел: обработка прекращена"
                : `Нет согласия — осталось ${Math.max(sourcing.daysLeft, 0)} дн.`}
            </CardTitle>
            <CardDescription>
              {sourcing.blocked
                ? `Согласия не было ${SOURCING_LEAD_TTL_DAYS} дней, данные будут уничтожены` +
                  (candidate.erasureDueAt ? ` до ${shortDate(candidate.erasureDueAt)}` : "") +
                  ". Если кандидат ещё нужен — получите его согласие по ссылке: оно снимет блокировку."
                : `Кандидат найден без его участия. Пока нет согласия, храним только имя, ` +
                  `контакты и ссылку на профиль, а ${shortDate(sourcing.deadline)} обработка ` +
                  `прекратится и данные будут уничтожены.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SourcingPanel
              candidateId={candidate.id}
              noticeDate={candidate.sourcingNoticeAt ? shortDate(candidate.sourcingNoticeAt) : null}
              consentLinkDays={LINK_TTL_DAYS}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Профиль</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Здесь только резюме: остальные файлы и загрузка живут в блоке «Файлы» ниже */}
          <CandidateProfile
            candidate={candidate}
            attachments={candidate.attachments.filter((a) => a.kind === "RESUME")}
            showContacts
          />
        </CardContent>
      </Card>

      {candidate.summary && (
        <Card className="border-dashed bg-muted/40">
          <CardHeader>
            <CardTitle className="text-base">Заметки рекрутера</CardTitle>
            <CardDescription>Клиент этого не видит</CardDescription>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm">
            {candidate.summary}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          {canSeat && (
            <CardAction>
              <SeatInVacancy
                candidateId={candidate.id}
                candidateName={candidate.fullName}
                vacancies={seatVacancies}
                taken={seatTaken}
              />
            </CardAction>
          )}
          <CardTitle className="text-base">Участие в воронках</CardTitle>
          <CardDescription>
            Один человек может идти по нескольким вакансиям одновременно —
            видно, чтобы не представить его двум клиентам сразу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidate.applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Пока ни в одной воронке.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {candidate.applications.map((a) => (
                // Вся строка — одна ссылка: растянутый ::after у Link.
                // Раньше нажималось только название вакансии, 20px
                // в высоту, а нажатие по клиенту или этапу рядом
                // не делало ничего.
                <li
                  key={a.id}
                  className="group relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 last:border-0 last:pb-0"
                >
                  <Link
                    href={`/a/applications/${a.id}`}
                    className="font-medium outline-none group-hover:underline after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring"
                  >
                    №{a.vacancy.number} {a.vacancy.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {a.vacancy.client.name}
                  </span>
                  <Badge variant="secondary">{a.stage.name}</Badge>
                  {a.outcome !== "IN_PROGRESS" && (
                    <Badge variant="outline">
                      {APPLICATION_OUTCOME_LABELS[a.outcome]}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Файлы</CardTitle>
          <CardDescription>
            Резюме, портфолио, тестовое задание. По умолчанию файл виден только
            сотрудникам агентства.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateFilesCard
            candidateId={candidate.id}
            files={files}
            blockedReason={isLead ? SOURCING_FILES_MESSAGE : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Комментарии</CardTitle>
          <CardDescription>
            Пишут сотрудники агентства. Работодателю комментарий виден, только
            если поставить галочку и выбрать вакансию.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateCommentsCard
            candidateId={candidate.id}
            feed={feed}
            vacancies={commentVacancies}
            blockedReason={
              isLead
                ? "Пока кандидат не дал согласие, заметки о нём не сохраняются: можно хранить только имя, контакты и ссылку на профиль."
                : undefined
            }
          />
        </CardContent>
      </Card>

      {canErase && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Удаление данных</CardTitle>
            <CardDescription>
              Например, для тестовой или ошибочной записи. Контакты и профиль стираются, участие в воронках
              остаётся обезличенным.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EraseButton
              candidateId={candidate.id}
              candidateName={candidate.fullName}
              activeApplications={candidate.applications.filter((a) => a.outcome === "IN_PROGRESS").length}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
