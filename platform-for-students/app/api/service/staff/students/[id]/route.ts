import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { rateLimit } from '@/lib/security/rate-limit';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { auditStaffProfileRead, getStaffStudentProfile, parseCrmActor } from '@/lib/staff-students';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Профиль студента для сотрудника агентства. Почта и телефон — только при
 * `?contacts=1`. Обоим видам просмотра нужен сотрудник в заголовке x-crm-actor
 * (его идентификатор, без ФИО): просмотр и раскрытие контактов пишутся в журнал
 * платформы как `student.profile.read` и `student.profile.read.contacts`
 * (не чаще раза за 10 минут на сотрудника и студента).
 */
export async function GET(request: Request, props: Params) {
  const { id } = await props.params;
  return handle(async () => {
    assertServiceAuth(request);
    const actor = parseCrmActor(request);
    if (!actor) return fail(400, 'Нужен идентификатор сотрудника (x-crm-actor)', 'ACTOR_REQUIRED');
    const contacts = new URL(request.url).searchParams.get('contacts') === '1';

    const limit = await rateLimit('staffStudents', actor);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    if (contacts) {
      const contactsLimit = await rateLimit('staffContacts', actor);
      if (!contactsLimit.ok) return tooManyRequests(contactsLimit.retryAfter);
    }

    const profile = await getStaffStudentProfile(id, { contacts });
    if (!profile) return fail(404, 'Студент не найден', 'NOT_FOUND');

    // Сначала след в журнале, потом данные: не записалось — контакты не уходят
    await auditStaffProfileRead(actor, id, { contacts }, request.headers);
    return ok(profile);
  });
}
