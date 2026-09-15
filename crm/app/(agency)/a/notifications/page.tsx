import { NotificationCategoryFilter } from "@/components/shell/notification-category-filter";
import { NotificationHistory } from "@/components/shell/notification-history";
import { requireAgencyActor } from "@/lib/auth/session";
import { categoriesInUse, type EventCategory } from "@/lib/notifications/events";
import { listNotificationHistory } from "@/lib/notifications/notify";

export const metadata = { title: "Уведомления" };

const PAGE_SIZE = 30;

export default async function AgencyNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const actor = await requireAgencyActor();
  const { category, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { items, hasMore } = await listNotificationHistory(actor.id, {
    category: category as EventCategory | undefined,
    take: page * PAGE_SIZE,
  });

  const categories = categoriesInUse();

  const withQuery = (params: Record<string, string>) => {
    const merged = new URLSearchParams({ ...(category && { category }), ...params });
    const qs = merged.toString();
    return qs ? `/a/notifications?${qs}` : "/a/notifications";
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Уведомления</h1>
        <p className="text-sm text-muted-foreground">
          {items.length === 0
            ? "Пока ничего не было"
            : hasMore
              ? `Показано ${items.length}`
              : `Всего ${items.length}`}
        </p>
      </div>

      <NotificationCategoryFilter categories={categories} />

      <NotificationHistory
        items={items}
        hasMore={hasMore}
        loadMoreHref={withQuery({ page: String(page + 1) })}
      />
    </div>
  );
}
