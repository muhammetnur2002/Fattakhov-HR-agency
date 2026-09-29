import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { inviteCandidate, listCandidatesForVacancy } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Кандидаты на вакансию клиента — свои поиск и фильтры в CRM. Отдаём то,
 * что видит работодатель в списке «Кандидаты» (контакты закрыты до отклика),
 * без фото: файлы платформы CRM пока не проксирует.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const params = new URL(request.url).searchParams;
    const { employer } = await requireServiceEmployer(params.get('crmClientId'));
    const vacancyId = z.string().min(1).parse(params.get('vacancyId'));

    const result = await listCandidatesForVacancy(employer.id, vacancyId);
    if (!result) return fail(404, 'Вакансия не найдена', 'NOT_FOUND');

    return ok({
      vacancy: result.vacancy,
      candidates: result.candidates.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        age: c.age,
        university: c.university,
        speciality: c.speciality,
        studyYear: c.studyYear,
        studyLevel: c.studyLevel,
        city: c.city,
        workDays: c.workDays,
        hoursPerWeek: c.hoursPerWeek,
        skills: c.skills,
        about: c.about,
      })),
    });
  });
}

const inviteSchema = z.object({
  crmClientId: z.string().trim().min(1),
  actor: z.string().trim().min(1).max(200),
  vacancyId: z.string().min(1),
  studentId: z.string().min(1),
});

/** Пригласить кандидата на вакансию. */
export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const { crmClientId, actor, vacancyId, studentId } = inviteSchema.parse(await request.json());
    const { employer } = await requireServiceEmployer(crmClientId);

    const result = await inviteCandidate(employer.id, vacancyId, studentId);
    if (result === 'NOT_FOUND') return fail(404, 'Кандидат или вакансия не найдены', 'NOT_FOUND');
    if (result === 'ALREADY_DECIDED') return ok({ invited: false, reason: 'ALREADY_DECIDED' as const });

    await auditService(
      actor,
      { action: 'application.invited', entity: 'Vacancy', entityId: vacancyId, meta: { studentId } },
      request.headers,
    );
    return ok({ invited: true });
  });
}
