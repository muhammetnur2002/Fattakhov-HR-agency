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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/count-badge";
import { useTimeZone } from "@/components/shell/time-zone-provider";
import { formatDayMonthTime } from "@/lib/format-date";

/** Кольцо фокуса внутри панели: наружное срезалось бы краем прокручиваемого списка. */
const FOCUS_INSET =
  "focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset";

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
 *
 * Выпадающая панель (Popover), а не меню (DropdownMenu). В меню Radix
 * по Tab не ходят: он перехватывает клавишу, а стрелками доходит только до
 * настоящих пунктов меню (menuitem). Здесь же внутри ссылки, а не пункты, —
 * с клавиатуры до уведомлений нельзя было добраться вовсе (проверка
 * 11.10.2026). В панели обычный порядок Tab: фокус уходит внутрь при
 * открытии, Tab идёт по уведомлениям, Enter открывает, Esc закрывает и
 * возвращает фокус на колокольчик.
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
  const [open, setOpen] = useState(false);
  // Переход по ссылке уведомления закрывает панель: Popover сам этого не знает
  const close = () => setOpen(false);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    const fresh = items.filter((n) => !n.isRead).map((n) => n.id);
    if (fresh.length === 0) return;

    // Открыли список — считаем прочитанным. Отмечаем оптимистично:
    // ждать ответа ради снятия счётчика незачем
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await markReadAction(fresh);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-11 md:size-7"
          aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <CountBadge
              count={unread}
              tone="alert"
              className="absolute -right-1 -top-1"
            />
          )}
        </Button>
      </PopoverTrigger>

      {/* w-96 фиксированный вылезал за край экрана на телефонах уже 375px —
          ограничиваем шириной вьюпорта с отступами. gap-0 и p-0: у заготовки
          Popover свои отступы, а разметка списка рассчитана на край в край */}
      <PopoverContent
        align="end"
        aria-label="Уведомления"
        className="flex max-h-(--radix-popover-content-available-height) w-[calc(100vw-2rem)] max-w-96 flex-col gap-0 overflow-hidden p-0"
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

        {/* Панель ограничена доступной высотой (низкий экран, телефон в горизонтали); шапка и
            ссылка «Все уведомления» остаются на месте, прокручивается только список */}
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Пока ничего не произошло.
          </p>
        ) : (
          <ul className="max-h-96 min-h-0 flex-1 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Item notification={n} onNavigate={close} />
              </li>
            ))}
          </ul>
        )}

        <Link
          href={historyHref}
          onClick={close}
          className={cn(
            "block border-t px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground",
            FOCUS_INSET,
          )}
        >
          Все уведомления
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function Item({
  notification,
  onNavigate,
}: {
  notification: BellNotification;
  onNavigate: () => void;
}) {
  const timeZone = useTimeZone();
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
            {formatWhen(notification.createdAt, timeZone)}
          </div>
        </div>
      </div>
    </div>
  );

  if (!notification.linkUrl) return content;

  return (
    <Link href={notification.linkUrl} onClick={onNavigate} className={cn("block hover:bg-muted/70", FOCUS_INSET)}>
      {content}
    </Link>
  );
}

/** Свежие показываем относительно: «12 минут назад» читается легче даты. */
function formatWhen(date: Date, timeZone: string): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} ч назад`;

  return formatDayMonthTime(date, timeZone);
}
