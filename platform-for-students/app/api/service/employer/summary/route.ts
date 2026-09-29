import { handle, ok } from '@/lib/api';
import { countUnread } from '@/lib/chat';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Счётчики для значков в CRM (новые отклики, непрочитанные сообщения) и общая
 * активность клиента для подсказки «подберём сами».
 * Один лёгкий запрос вместо загрузки всех откликов и диалогов.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { employer, store } = await requireServiceEmployer(crmClientId);

    const vacancies = await store.vacancies.listByEmployer(employer.id);
    const applications = await store.applications.listByVacancyIds(vacancies.map((v) => v.id));

    return ok({
      newApplications: applications.filter((a) => a.status === 'NEW').length,
      unreadMessages: await countUnread({ role: 'EMPLOYER', profileId: employer.id }),
      // Для подсказки клиенту без договора: сколько у него уже всего происходит
      vacancies: vacancies.length,
      published: vacancies.filter((v) => v.status === 'PUBLISHED').length,
      applications: applications.length,
      invited: applications.filter((a) => a.status === 'INVITED' || a.status === 'INTERVIEW').length,
      hired: applications.filter((a) => a.status === 'HIRED').length,
    });
  });
}
