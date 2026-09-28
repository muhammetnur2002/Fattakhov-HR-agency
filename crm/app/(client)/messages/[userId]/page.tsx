import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { describeUser } from "@/components/messages/direct-conversation-list";
import { MessageThread } from "@/components/messages/message-thread";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireClientActor } from "@/lib/auth/session";
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
  const actor = await requireClientActor();
  const user = await getCorrespondent(actor, userId);
  return { title: user?.fullName ?? "Переписка" };
}

export default async function ClientMessageThreadPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const actor = await requireClientActor();

  // Сотрудник другого клиента сюда не пройдёт: getCorrespondent
  // вернёт null, и страница станет 404 (см. lib/services/messages)
  const [user, messages] = await Promise.all([
    getCorrespondent(actor, userId),
    listDirectMessages(actor, userId),
  ]);
  if (!user || !messages) notFound();

  const hasUnread = messages.some((m) => !m.fromMe && m.readAt === null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b p-3.5">
        <Button asChild variant="ghost" size="icon" className="-ml-1 shrink-0 md:hidden">
          <Link href="/messages" aria-label="К списку диалогов">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Avatar>
          <AvatarImage src={user.clientLogoUrl ?? user.avatarUrl ?? undefined} />
          <AvatarFallback>{user.fullName.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {describeUser(user.role as UserRole, user.clientName)}
            {user.position ? ` · ${user.position}` : ""}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MessageThread messages={messages} recipientId={user.id} hasUnread={hasUnread} />
      </div>
    </div>
  );
}
