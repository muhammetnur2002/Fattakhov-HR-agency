"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { ConversationList } from "./conversation-list";
import { DirectConversationList } from "./direct-conversation-list";
import { NewMessageDialog } from "./new-message-dialog";
import { Button } from "@/components/ui/button";
import { useKeyboardViewport } from "@/lib/hooks/use-keyboard-viewport";
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

  // Поиск и чипы-фильтры личных диалогов — на клиенте: список уже загружен
  const rootRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(rootRef);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectFilter>("all");
  const isAgency = hrefBase === "/a";
  const needle = query.trim().toLowerCase();
  const visibleDirect = direct.filter((c) => {
    if (filter === "unread" && c.unreadCount === 0) return false;
    // Клиент — собеседник со стороны клиента (есть компания), команда — сотрудник агентства
    if (filter === "clients" && !c.user.clientName) return false;
    if (filter === "team" && c.user.clientName) return false;
    if (!needle) return true;
    return (
      c.user.fullName.toLowerCase().includes(needle) ||
      (c.user.clientName ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div
      ref={rootRef}
      className="flex h-[calc(100svh-3.5rem-2rem)] overflow-hidden rounded-3xl border md:h-[calc(100svh-3.5rem-3rem)]"
    >
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

        {!workTab && direct.length > 0 && (
          <div className="space-y-2.5 px-3 pb-3">
            <div className="flex h-9 items-center gap-2 rounded-xl border bg-muted/40 px-3">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск"
                aria-label="Поиск по диалогам"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                Все
              </FilterChip>
              <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
                Непрочитанные{directUnread > 0 ? ` · ${directUnread}` : ""}
              </FilterChip>
              {isAgency && (
                <>
                  <FilterChip active={filter === "clients"} onClick={() => setFilter("clients")}>
                    Клиенты
                  </FilterChip>
                  <FilterChip active={filter === "team"} onClick={() => setFilter("team")}>
                    Команда
                  </FilterChip>
                </>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto border-t">
          {workTab ? (
            <ConversationList
              conversations={work}
              hrefFor={(c) => hrefForWork(c, hrefBase)}
              emptyText="Как только кто-то напишет в обсуждении кандидата или вакансии, переписка появится здесь."
            />
          ) : (
            <DirectConversationList
              conversations={visibleDirect}
              hrefBase={hrefBase}
              activeId={activeId}
              emptyText={
                direct.length === 0
                  ? "Личных сообщений пока нет. Нажмите «Написать», чтобы начать."
                  : "Ничего не нашлось."
              }
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

type DirectFilter = "all" | "unread" | "clients" | "team";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function hrefForWork(c: ConversationSummary, hrefBase: string): string {
  if (hrefBase === "/a") {
    return c.type === "application" ? `/a/applications/${c.id}#discussion` : `/a/vacancies/${c.id}?tab=discussion`;
  }
  return c.type === "application" ? `/applications/${c.id}#discussion` : `/vacancies/${c.id}#discussion`;
}
