import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ConversationSummary } from "@/lib/services/comments";

/**
 * Список обсуждений по кандидатам и вакансиям — компактные строки для
 * боковой колонки. В отличие от личных сообщений, строка ведёт не в
 * панель чата, а на саму карточку кандидата/вакансии — обсуждение
 * там же, где решения по нему, а не отдельным чатом.
 */
export function ConversationList({
  conversations,
  hrefFor,
  emptyText,
}: {
  conversations: ConversationSummary[];
  hrefFor: (c: ConversationSummary) => string;
  emptyText: string;
}) {
  if (conversations.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="py-1">
      {conversations.map((c) => (
        <Link
          key={`${c.type}:${c.id}`}
          href={hrefFor(c)}
          className="flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
        >
          <Avatar className="shrink-0">
            <AvatarFallback>{c.title.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate text-[13.5px] font-medium">{c.title}</div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                {formatWhen(c.lastMessage.createdAt)}
              </div>
            </div>
            <div className="truncate text-xs text-muted-foreground">{c.subtitle}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                <span className="text-foreground">{c.lastMessage.authorName}:</span> {c.lastMessage.body}
              </div>
              {c.unreadCount > 0 && (
                <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                  {c.unreadCount > 9 ? "9+" : c.unreadCount}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Сегодня — только время, раньше — короткая дата: как в любом мессенджере. */
function formatWhen(value: Date): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}
