import { handle, ok } from '@/lib/api';
import { assertSameOrigin, requireStudent } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Сколько уведомлений держим в списке колокольчика. Старше — не нужны: письма остаются в почте. */
const BELL_LIMIT = 30;

/** Колокольчик студента: последние уведомления и число непрочитанных. */
export async function GET() {
  return handle(async () => {
    const { student, store } = await requireStudent();
    const [items, unread] = await Promise.all([
      store.studentNotifications.listByStudent(student.id, BELL_LIMIT),
      store.studentNotifications.countUnread(student.id),
    ]);
    return ok({
      unread,
      notifications: items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        href: n.href,
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
      })),
    });
  });
}

/** Открыли колокольчик — всё увиденное прочитано. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { student, store } = await requireStudent();
    await store.studentNotifications.markAllRead(student.id);
    return ok({ unread: 0 });
  });
}
