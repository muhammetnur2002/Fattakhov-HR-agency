import { MessagesShell } from "@/components/messages/messages-shell";
import { requireClientActor } from "@/lib/auth/session";
import { listConversations } from "@/lib/services/comments";
import { listCorrespondents, listDirectConversations } from "@/lib/services/messages";

/**
 * Список диалогов живёт здесь, а не в page.tsx: layout не перерисовывается
 * при переходе между диалогами (см. components/messages/messages-shell.tsx).
 */
export default async function ClientMessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireClientActor();

  const [direct, work, correspondents] = await Promise.all([
    listDirectConversations(actor),
    listConversations(actor),
    listCorrespondents(actor),
  ]);

  return (
    <MessagesShell direct={direct} work={work} correspondents={correspondents} hrefBase="">
      {children}
    </MessagesShell>
  );
}
