"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  markAllReadAction,
  markReadAction,
} from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type BellNotification = {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: Date;
};

/**
 * Колокольчик уведомлений.
 *
 * Показывает и прочитанные тоже: список нужен не только чтобы отметить
 * новое, но и чтобы вспомнить, что было вчера. Непрочитанные выделены.
 */
export function NotificationBell({
  notifications,
  unreadCount,
  historyHref,
}: {
  notifications: BellNotification[];
  unreadCount: number;
  historyHref: string;
}) {
  const [items, setItems] = useState(notifications);
  const [unread, setUnread] = useState(unreadCount);

  async function handleOpen(open: boolean) {
    if (!open) return;
    const fresh = items.filter((n) => !n.isRead).map((n) => n.id);
    if (fresh.length === 0) return;

    // Открыли список — считаем прочитанным. Отмечаем оптимистично:
    // ждать ответа ради снятия счётчика незачем
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await markReadAction(fresh);
  }

  return (
    <DropdownMenu onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-11 md:size-7"
          aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      {/* w-96 фиксированный вылезал за край экрана на телефонах уже 375px —
          ограничиваем шириной вьюпорта с отступами */}
      <DropdownMenuContent
        align="end"
        className="w-[calc(100vw-2rem)] max-w-96 p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Уведомления</span>
          {items.some((n) => !n.isRead) && (
            <button
              type="button"
              onClick={async () => {
                setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
                setUnread(0);
                await markAllReadAction();
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Прочитать все
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Пока ничего не произошло.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Item notification={n} />
              </li>
            ))}
          </ul>
        )}

        <Link
          href={historyHref}
          className="block border-t px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Все уведомления
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({ notification }: { notification: BellNotification }) {
  const content = (
    <div
      className={cn(
        "border-b px-3 py-2.5 last:border-0",
        !notification.isRead && "bg-muted/50",
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.isRead && (
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{notification.title}</div>
          {notification.body && (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {notification.body}
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {formatWhen(notification.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );

  if (!notification.linkUrl) return content;

  return (
    <Link href={notification.linkUrl} className="block hover:bg-muted/70">
      {content}
    </Link>
  );
}

/** Свежие показываем относительно: «12 минут назад» читается легче даты. */
function formatWhen(date: Date): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} ч назад`;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
