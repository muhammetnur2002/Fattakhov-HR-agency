import Link from "next/link";

import { ConversationList } from "@/components/messages/conversation-list";
import { DirectConversationList } from "@/components/messages/direct-conversation-list";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { Button } from "@/components/ui/button";
import { requireAgencyActor } from "@/lib/auth/session";
import { listConversations, type ConversationSummary } from "@/lib/services/comments";
import {
  listCorrespondents,
  listDirectConversations,
} from "@/lib/services/messages";

export const metadata = { title: "Сообщения" };

function hrefFor(c: ConversationSummary): string {
  return c.type === "application"
    ? `/a/applications/${c.id}#discussion`
    : `/a/vacancies/${c.id}?tab=discussion`;
}

export default async function AgencyMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { tab } = await searchParams;
  // Личные первыми: «Сообщения» человек читает как «мне написали»,
  // а обсуждения по кандидатам живут ещё и в самих карточках
  const workTab = tab === "work";

  const [direct, work, correspondents] = await Promise.all([
    listDirectConversations(actor),
    listConversations(actor),
    listCorrespondents(actor),
  ]);

  const directUnread = direct.filter((c) => c.unreadCount > 0).length;
  const workUnread = work.filter((c) => c.unreadCount > 0).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Сообщения</h1>
          <p className="text-sm text-muted-foreground">
            {workTab
              ? "Обсуждения по кандидатам и вакансиям"
              : "Личная переписка с коллегами и клиентами"}
          </p>
        </div>
        <NewMessageDialog correspondents={correspondents} hrefBase="/a" />
      </div>

      <div className="flex gap-2">
        <Button asChild variant={workTab ? "outline" : "secondary"} size="sm">
          <Link href="/a/messages">
            Личные{directUnread > 0 ? ` · ${directUnread}` : ""}
          </Link>
        </Button>
        <Button asChild variant={workTab ? "secondary" : "outline"} size="sm">
          <Link href="/a/messages?tab=work">
            По работе{workUnread > 0 ? ` · ${workUnread}` : ""}
          </Link>
        </Button>
      </div>

      {workTab ? (
        <ConversationList
          conversations={work}
          hrefFor={hrefFor}
          emptyText="Как только кто-то напишет в обсуждении кандидата или вакансии, переписка появится здесь."
        />
      ) : (
        <DirectConversationList
          conversations={direct}
          hrefBase="/a"
          emptyText="Личных сообщений пока нет. Нажмите «Написать», чтобы начать."
        />
      )}
    </div>
  );
}
