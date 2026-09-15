import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateProfile } from "@/components/applications/candidate-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { APPLICATION_OUTCOME_LABELS, CANDIDATE_SOURCE_LABELS } from "@/lib/labels";
import { getCandidate } from "@/lib/services/candidates";

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

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/a/candidates">← Кандидаты</Link>
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{candidate.fullName}</h1>
          {candidate.consentStatus !== "GIVEN" && (
            <Badge variant="outline">нет согласия на обработку ПДн</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {CANDIDATE_SOURCE_LABELS[candidate.source]}
          {candidate.sourceDetails ? ` · ${candidate.sourceDetails}` : ""}
        </p>
      </div>

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
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 last:border-0 last:pb-0"
                >
                  <Link
                    href={`/a/applications/${a.id}`}
                    className="font-medium hover:underline"
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
    </div>
  );
}
