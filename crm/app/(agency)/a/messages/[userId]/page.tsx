import Link from "next/link";
import { notFound } from "next/navigation";

import { describeUser } from "@/components/messages/direct-conversation-list";
import { MessageThread } from "@/components/messages/message-thread";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAgencyActor } from "@/lib/auth/session";
import type { UserRole } from "@/lib/generated/prisma/enums";
import {
  getCorrespondent,
  listDirectMessages,
} from "@/lib/services/messages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const actor = await requireAgencyActor();
  const user = await getCorrespondent(actor, userId);
  return { title: user?.fullName ?? "Переписка" };
}

export default async function AgencyMessageThreadPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const actor = await requireAgencyActor();

  // getCorrespondent сам проверяет, вправе ли актор писать этому
  // человеку — недоступный собеседник превращается в 404, а не
  // в пустую переписку
  const [user, messages] = await Promise.all([
    getCorrespondent(actor, userId),
    listDirectMessages(actor, userId),
  ]);
  if (!user || !messages) notFound();

  const hasUnread = messages.some((m) => !m.fromMe && m.readAt === null);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/a/messages">← Сообщения</Link>
        </Button>
        <h1 className="text-2xl font-semibold">{user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {describeUser(user.role as UserRole, user.clientName)}
          {user.position ? ` · ${user.position}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <MessageThread
            messages={messages}
            recipientId={user.id}
            hasUnread={hasUnread}
          />
        </CardContent>
      </Card>
    </div>
  );
}
