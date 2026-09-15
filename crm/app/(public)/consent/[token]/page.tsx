import { RateLimitCard } from "@/components/shared/rate-limit-card";
import { ConsentForm } from "@/components/consent/consent-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CANDIDATE_CONSENT_TEXT } from "@/lib/legal/candidate-consent";
import { guardRate } from "@/lib/security/guard";
import { getConsentRequest } from "@/lib/services/consent";

export const metadata = { title: "Согласие на обработку данных" };

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rate = await guardRate("publicToken");
  if (!rate.allowed) return <RateLimitCard retryAfter={rate.retryAfter} />;

  const request = await getConsentRequest(token);

  // Одно сообщение на все негодные случаи: по ответу нельзя понять,
  // существовала ли ссылка и есть ли такой кандидат
  if (!request) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка недействительна</CardTitle>
          <CardDescription>
            Возможно, согласие уже получено или срок ссылки истёк.
            Напишите рекрутеру — он пришлёт новую.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Согласие на обработку данных</CardTitle>
      </CardHeader>
      <CardContent>
        <ConsentForm
          token={token}
          candidateName={request.fullName}
          organizationName={request.organization.name}
          text={CANDIDATE_CONSENT_TEXT}
        />
      </CardContent>
    </Card>
  );
}
