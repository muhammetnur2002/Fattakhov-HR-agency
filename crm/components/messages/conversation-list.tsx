import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ConversationSummary } from "@/lib/services/comments";

/**
 * Список переписок — по кандидатам и по вакансиям вперемешку, одной
 * лентой по свежести последнего сообщения. Раньше единственным способом
 * узнать, есть ли что-то новое, было открыть обсуждение на каждой
 * карточке кандидата и вакансии по очереди.
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
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-2">
      {conversations.map((c) => (
        <Link key={`${c.type}:${c.id}`} href={hrefFor(c)} className="block min-w-0">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 p-4">
              {c.unreadCount > 0 && (
                <span className="size-2 shrink-0 rounded-full bg-primary" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatWhen(c.lastMessage.createdAt)}
                  </div>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.subtitle}
                </div>
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  <span className="text-foreground">{c.lastMessage.authorName}:</span>{" "}
                  {c.lastMessage.body}
                </div>
              </div>
              {c.unreadCount > 0 && (
                <Badge variant="secondary" className="shrink-0">
                  {c.unreadCount}
                </Badge>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
