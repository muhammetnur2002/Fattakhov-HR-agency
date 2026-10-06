import { DisclosureForm } from "@/components/consent/disclosure-form";
import { RateLimitCard } from "@/components/shared/rate-limit-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DISCLOSURE_CONSENT_TEXT } from "@/lib/legal/disclosure-consent";
import { guardRate } from "@/lib/security/guard";
import { getDisclosureRequest } from "@/lib/services/disclosure-consent";

export const metadata = { title: "Передача данных работодателю" };

export default async function DisclosurePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rate = await guardRate("publicToken");
  if (!rate.allowed) return <RateLimitCard retryAfter={rate.retryAfter} />;

  const request = await getDisclosureRequest(token);

  // Одно сообщение на все негодные случаи — как на форме согласия:
  // по ответу нельзя понять, существовала ли ссылка и есть ли кандидат
  if (!request) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка недействительна</CardTitle>
          <CardDescription>
            Возможно, подтверждение уже получено или срок ссылки истёк.
            Напишите рекрутеру — он пришлёт новую.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Передача данных работодателю</CardTitle>
      </CardHeader>
      <CardContent>
        <DisclosureForm
          token={token}
          candidateName={request.candidate.fullName}
          employerName={request.employerName}
          employerInn={request.employerInn}
          vacancyTitle={request.vacancyTitle}
          text={DISCLOSURE_CONSENT_TEXT}
        />
      </CardContent>
    </Card>
  );
}
