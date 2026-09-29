import { z } from 'zod';
import { track } from '@/lib/analytics';
import { fail, handle, ok } from '@/lib/api';
import { notifyCrm } from '@/lib/notify-crm';
import { assertCompanyProfileComplete, assertEmailVerified, auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { listEmployerVacancies } from '@/lib/services';
import { skipsModeration, VACANCY_LIMITS, vacancyInputSchema, vacancySaveSchema } from '@/lib/vacancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Вакансии клиента CRM — служебный аналог /api/employer/vacancies, без
 * захода клиента на эту платформу (см. lib/security/service-employer.ts).
 * Бизнес-правила те же: лимит на компанию, автопубликация по договору.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { employer } = await requireServiceEmployer(crmClientId);
    return ok({ vacancies: await listEmployerVacancies(employer.id) });
  });
}

const actorSchema = z.object({ actor: z.string().trim().min(1).max(200) });

export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const body: unknown = await request.json();
    const { crmClientId } = z.object({ crmClientId: z.string().trim().min(1) }).parse(body);
    const { employer, store } = await requireServiceEmployer(crmClientId);
    const { actor } = actorSchema.parse(body);

    const { submit } = vacancySaveSchema.parse(body);
    const input = vacancyInputSchema.parse(body);
    if (submit) {
      await assertEmailVerified(employer.accountId);
      assertCompanyProfileComplete(employer);
    }

    const existing = await store.vacancies.listByEmployer(employer.id);
    if (existing.length >= VACANCY_LIMITS.perEmployer) {
      return fail(
        409,
        `В кабинете уже ${VACANCY_LIMITS.perEmployer} вакансий — напишите в агентство, поможем разобрать`,
        'TOO_MANY_VACANCIES',
      );
    }

    const autoPublish = submit && skipsModeration(employer);
    const vacancy = await store.vacancies.create({
      ...input,
      employerId: employer.id,
      status: submit ? (autoPublish ? 'PUBLISHED' : 'PENDING') : 'DRAFT',
      isActive: autoPublish,
      submittedAt: submit ? new Date() : null,
    });

    await auditService(
      actor,
      { action: submit ? 'vacancy.submitted' : 'vacancy.drafted', entity: 'Vacancy', entityId: vacancy.id },
      request.headers,
    );

    if (submit && !autoPublish) {
      await notifyCrm('vacancy', `Новая вакансия: ${employer.companyName}`, vacancy.title, vacancy.id);
    }
    if (autoPublish) {
      await track('vacancy.published', { vacancyId: vacancy.id, employerId: employer.id });
    }

    return ok({ id: vacancy.id, status: vacancy.status }, { status: 201 });
  });
}
