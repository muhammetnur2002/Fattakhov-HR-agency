"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ConversationList } from "./conversation-list";
import { DirectConversationList } from "./direct-conversation-list";
import { NewMessageDialog } from "./new-message-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/services/comments";
import type { Correspondent, DirectConversation } from "@/lib/services/messages";

/**
 * Раздел «Сообщения» целиком: список диалогов слева, открытая переписка
 * справа — в одном окне, без перехода на отдельную страницу (как в
 * Telegram). Список — в layout.tsx, поэтому не перерисовывается при
 * переходе между диалогами; справа подставляется children — конкретная
 * переписка (app/.../messages/[userId]/page.tsx) или пустой экран
 * (app/.../messages/page.tsx).
 *
 * На узком экране — как и с любым сплит-видом — одновременно помещается
 * только одна панель: список или открытый диалог.
 */
export function MessagesShell({
  direct,
  work,
  correspondents,
  hrefBase,
  children,
}: {
  direct: DirectConversation[];
  work: ConversationSummary[];
  correspondents: Correspondent[];
  /** "" для клиента (/messages), "/a" для агентства. */
  hrefBase: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const listBase = `${hrefBase}/messages`;
  const activeId = pathname.startsWith(`${listBase}/`)
    ? pathname.slice(listBase.length + 1).split("/")[0]
    : null;
  const threadOpen = Boolean(activeId);
  const workTab = searchParams.get("tab") === "work";

  const directUnread = direct.filter((c) => c.unreadCount > 0).length;
  const workUnread = work.filter((c) => c.unreadCount > 0).length;

  return (
    <div className="flex h-[calc(100svh-3.5rem-2rem)] overflow-hidden rounded-3xl border md:h-[calc(100svh-3.5rem-3rem)]">
      <aside
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col md:w-[21rem] md:border-r",
          threadOpen && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <h1 className="text-lg font-semibold">Сообщения</h1>
          <NewMessageDialog correspondents={correspondents} hrefBase={hrefBase} />
        </div>

        <div className="flex gap-2 px-3 pb-3 pt-1">
          <Button asChild variant={workTab ? "outline" : "secondary"} size="sm">
            <Link href={listBase}>Личные{directUnread > 0 ? ` · ${directUnread}` : ""}</Link>
          </Button>
          <Button asChild variant={workTab ? "secondary" : "outline"} size="sm">
            <Link href={`${listBase}?tab=work`}>По работе{workUnread > 0 ? ` · ${workUnread}` : ""}</Link>
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t">
          {workTab ? (
            <ConversationList
              conversations={work}
              hrefFor={(c) => hrefForWork(c, hrefBase)}
              emptyText="Как только кто-то напишет в обсуждении кандидата или вакансии, переписка появится здесь."
            />
          ) : (
            <DirectConversationList
              conversations={direct}
              hrefBase={hrefBase}
              activeId={activeId}
              emptyText="Личных сообщений пока нет. Нажмите «Написать», чтобы начать."
            />
          )}
        </div>
      </aside>

      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !threadOpen && "hidden md:flex")}>
        {children}
      </section>
    </div>
  );
}

function hrefForWork(c: ConversationSummary, hrefBase: string): string {
  if (hrefBase === "/a") {
    return c.type === "application" ? `/a/applications/${c.id}#discussion` : `/a/vacancies/${c.id}?tab=discussion`;
  }
  return c.type === "application" ? `/applications/${c.id}#discussion` : `/vacancies/${c.id}#discussion`;
}
