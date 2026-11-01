import { z } from 'zod';
import { handle, ok, fail } from '@/lib/api';
import { getStore } from '@/lib/db';
import { countUnread } from '@/lib/chat';
import { getSession, assertSameOrigin } from '@/lib/security/guards';
import { listWaitingSwipes } from '@/lib/services';

export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    const observedAt = new Date().toISOString();
    const session = await getSession();
    if (!session?.profileId || !['STUDENT', 'EMPLOYER'].includes(session.role)) return fail(401, 'Требуется вход', 'UNAUTHORIZED');
    const store = await getStore();
    const markers = await store.markers.list(session.accountId);
    const badges: Record<string, number> = {};
    if (session.role === 'STUDENT') {
      const [student, applications, skipped, waiting] = await Promise.all([
        store.students.findById(session.profileId), store.applications.listByStudent(session.profileId),
        store.swipes.listByStudent(session.profileId, 'LEFT'), listWaitingSwipes(session.profileId),
      ]);
      const seen = markers.applications ?? student?.applicationsViewedAt;
      badges['/applications'] = applications.filter(a => !seen || a.createdAt > seen || a.statusChangedAt > seen).length
        + waiting.filter(a => !seen || a.createdAt > seen).length;
      badges['/skipped'] = skipped.filter(a => !markers.skipped || a.createdAt > markers.skipped).length;
      badges['/messages'] = await countUnread({ role: 'STUDENT', profileId: session.profileId });
    } else {
      const vacancies = await store.vacancies.listByEmployer(session.profileId);
      badges['/employer'] = (await store.applications.listByVacancyIds(vacancies.map(v => v.id))).filter(a => a.status === 'NEW').length;
      badges['/employer/messages'] = await countUnread({ role: 'EMPLOYER', profileId: session.profileId });
    }
    return ok({ badges, observedAt });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await getSession();
    if (session?.role !== 'STUDENT') return fail(401, 'Требуется вход студента', 'UNAUTHORIZED');
    const input = z.object({ section: z.enum(['applications', 'skipped']), observedAt: z.string().datetime() }).parse(await request.json());
    const at = new Date(input.observedAt);
    if (at.getTime() > Date.now() || at.getTime() < Date.now() - 60_000) return fail(400, 'Обновите страницу', 'STALE_VIEW');
    await (await getStore()).markers.set(session.accountId, input.section, at);
    return ok({ viewed: true });
  });
}
