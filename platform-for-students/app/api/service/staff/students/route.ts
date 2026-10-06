import { handle, ok, tooManyRequests } from '@/lib/api';
import { rateLimit } from '@/lib/security/rate-limit';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { parseCrmActor, parseStaffSearch, searchStaffStudents } from '@/lib/staff-students';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Список студентов для подбора — раздел «Студенты» в CRM. Служебный API: CRM
 * сама проверяет доступ сотрудника (грант students.search), здесь только общий
 * секрет и лимит на сотрудника (заголовок x-crm-actor).
 *
 * Без контактов, даты рождения, ссылок на фото и резюме: профиль и контакты
 * открываются отдельным запросом, и он остаётся в журнале.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const limit = await rateLimit('staffStudents', parseCrmActor(request) ?? 'crm');
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const query = parseStaffSearch(new URL(request.url).searchParams);
    return ok(await searchStaffStudents(query));
  });
}
