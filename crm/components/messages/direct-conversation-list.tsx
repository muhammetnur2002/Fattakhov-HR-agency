import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/labels";
import type { DirectConversation } from "@/lib/services/messages";
import type { UserRole } from "@/lib/generated/prisma/enums";

/** Список личных переписок — по одной строке на собеседника. */
export function DirectConversationList({
  conversations,
  hrefBase,
  emptyText,
}: {
  conversations: DirectConversation[];
  /** "" для клиента (/messages), "/a" для агентства. */
  hrefBase: string;
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
        <Link
          key={c.user.id}
          href={`${hrefBase}/messages/${c.user.id}`}
          className="block min-w-0"
        >
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 p-4">
              <Avatar className="shrink-0">
                <AvatarFallback>{c.user.fullName.slice(0, 1)}</AvatarFallback>
              </Avatar>
              {c.unreadCount > 0 && (
                <span className="size-2 shrink-0 rounded-full bg-primary" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="truncate font-medium">{c.user.fullName}</div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatWhen(c.lastMessage.createdAt)}
                  </div>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {describeUser(c.user.role as UserRole, c.user.clientName)}
                </div>
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  {/* «Вы:» перед своим сообщением — иначе в списке не видно,
                      ждёт ответа собеседник или вы сами */}
                  {c.lastMessage.fromMe && (
                    <span className="text-foreground">Вы: </span>
                  )}
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

/** Кто это: сотрудник агентства или человек со стороны клиента. */
export function describeUser(role: UserRole, clientName: string | null): string {
  const roleLabel = ROLE_LABELS[role];
  return clientName ? `${roleLabel} · ${clientName}` : `${roleLabel} · агентство`;
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
