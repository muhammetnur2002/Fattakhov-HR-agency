import { handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertServiceAuth } from '@/lib/security/service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Активность компаний на платформе для воронки в CRM: сколько вакансий
 * опубликовано, сколько откликов и до какого шага они дошли. По одному ряду на
 * компанию, у которой есть клиент в CRM. Только числа и даты — ни имён студентов,
 * ни текста переписки.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const store = await getStore();

    const employers = (await store.employers.list()).filter((e) => e.crmClientId);
    const applications = await store.applications.listAll();

    const byVacancy = new Map<string, typeof applications>();
    for (const a of applications) {
      const list = byVacancy.get(a.vacancyId);
      if (list) list.push(a);
      else byVacancy.set(a.vacancyId, [a]);
    }

    const rows = await Promise.all(
      employers.map(async (employer) => {
        const vacancies = await store.vacancies.listByEmployer(employer.id);
        const apps = vacancies.flatMap((v) => byVacancy.get(v.id) ?? []);
        const times = apps.flatMap((a) => [a.createdAt, a.statusChangedAt, ...(a.lastMessageAt ? [a.lastMessageAt] : [])]);
        const last = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;

        return {
          crmClientId: employer.crmClientId as string,
          companyName: employer.companyName,
          registeredAt: employer.createdAt.toISOString(),
          vacancies: vacancies.length,
          published: vacancies.filter((v) => v.status === 'PUBLISHED').length,
          applications: apps.length,
          newApplications: apps.filter((a) => a.status === 'NEW').length,
          invited: apps.filter((a) => a.status === 'INVITED' || a.status === 'INTERVIEW').length,
          hired: apps.filter((a) => a.status === 'HIRED').length,
          lastActivityAt: last ? last.toISOString() : null,
        };
      }),
    );

    return ok({ companies: rows });
  });
}
