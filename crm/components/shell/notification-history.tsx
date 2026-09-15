import Link from "next/link";

import { LoadMore } from "@/components/shell/load-more";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HistoryNotification = {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: Date;
};

/**
 * Полная история уведомлений — колокольчик обрезан тридцатью последними
 * (см. lib/notifications/notify.ts), эта страница листает дальше.
 */
export function NotificationHistory({
  items,
  hasMore,
  loadMoreHref,
}: {
  items: HistoryNotification[];
  hasMore: boolean;
  loadMoreHref: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Пока ничего не было.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {items.map((n) => (
          <li key={n.id}>
            <Item notification={n} />
          </li>
        ))}
      </ul>
      {hasMore && <LoadMore href={loadMoreHref} />}
    </div>
  );
}

function Item({ notification }: { notification: HistoryNotification }) {
  const content = (
    <div
      className={cn(
        "flex items-start gap-2 px-4 py-3",
        !notification.isRead && "bg-muted/50",
      )}
    >
      {!notification.isRead && (
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{notification.title}</div>
        {notification.body && (
          <div className="mt-0.5 text-sm text-muted-foreground">
            {notification.body}
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          {formatWhen(notification.createdAt)}
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

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
