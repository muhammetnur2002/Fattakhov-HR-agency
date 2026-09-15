import Link from "next/link";

import { InviteForm } from "./invite-form";
import { withEmailOff } from "@/components/shared/email-off";
import { RateLimitCard } from "@/components/shared/rate-limit-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/labels";
import { guardRate } from "@/lib/security/guard";
import { getInvitation } from "@/lib/services/invitations";

export const metadata = { title: "Приглашение" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rate = await guardRate("publicToken");
  if (!rate.allowed) return <RateLimitCard retryAfter={rate.retryAfter} />;

  const invite = await getInvitation(token);

  if (!invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ссылка недействительна</CardTitle>
          <CardDescription>
            Приглашение истекло или уже использовано. Попросите отправить новое.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Перейти ко входу</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const place = invite.clientName
    ? `в кабинет компании «${invite.clientName}»`
    : `в агентство «${invite.organizationName}»`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Приглашение {place}</CardTitle>
        <CardDescription>
          {invite.invitedByName
            ? `${invite.invitedByName} приглашает вас как «${ROLE_LABELS[invite.role]}».`
            : `Вас ждут в роли «${ROLE_LABELS[invite.role]}».`}{" "}
          Доступ будет привязан к {withEmailOff(invite.email, invite.email)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteForm token={invite.token} />
      </CardContent>
    </Card>
  );
}
