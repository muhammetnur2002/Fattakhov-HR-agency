import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateProfile } from "@/components/applications/candidate-profile";
import { SourcingPanel } from "@/components/candidates/sourcing-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EraseButton } from "@/components/pdn/erase-button";
import { canDo } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { APPLICATION_OUTCOME_LABELS, CANDIDATE_SOURCE_LABELS } from "@/lib/labels";
import { getCandidate } from "@/lib/services/candidates";
import { LINK_TTL_DAYS } from "@/lib/services/consent";
import {
  isSourcingLead,
  SOURCING_LEAD_TTL_DAYS,
  sourcingDaysLeft,
  sourcingDeadline,
} from "@/lib/sourcing";

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

  // Удалять данные кандидата может только владелец (BR-35)
  const canErase = canDo(actor, "pdn.auditLog");

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
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/a/candidates">← Кандидаты</Link>
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{candidate.fullName}</h1>
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
      </div>

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
          <CandidateProfile
            candidate={candidate}
            attachments={candidate.attachments}
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
                    className="font-medium outline-none group-hover:underline after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
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
