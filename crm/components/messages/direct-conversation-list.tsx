import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DirectConversation } from "@/lib/services/messages";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Список личных переписок — компактные строки для боковой колонки
 * (см. components/messages/messages-shell.tsx), а не отдельная страница:
 * тот же список, что открывает саму переписку рядом, без перехода.
 *
 * Аватар — своя фотография у сотрудника, логотип компании у клиента
 * (обе — необязательные поля, инициалы остаются запасным вариантом).
 */
export function DirectConversationList({
  conversations,
  hrefBase,
  activeId,
  emptyText,
}: {
  conversations: DirectConversation[];
  /** "" для клиента (/messages), "/a" для агентства. */
  hrefBase: string;
  /** id открытого сейчас собеседника — подсвечивает строку. */
  activeId?: string | null;
  emptyText: string;
}) {
  if (conversations.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="py-1">
      {conversations.map((c) => (
        <Link
          key={c.user.id}
          href={`${hrefBase}/messages/${c.user.id}`}
          className={cn(
            "flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60",
            c.user.id === activeId && "bg-muted",
          )}
        >
          <Avatar className="shrink-0">
            <AvatarImage src={c.user.clientLogoUrl ?? c.user.avatarUrl ?? undefined} />
            <AvatarFallback>{c.user.fullName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate text-[13.5px] font-medium">{c.user.fullName}</div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                {formatWhen(c.lastMessage.createdAt)}
              </div>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {describeUser(c.user.role as UserRole, c.user.clientName)}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {/* «Вы:» перед своим сообщением — иначе в списке не видно,
                    ждёт ответа собеседник или вы сами */}
                {c.lastMessage.fromMe && <span className="text-foreground">Вы: </span>}
                {c.lastMessage.body}
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
