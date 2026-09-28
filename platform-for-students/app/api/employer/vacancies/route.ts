import { track } from '@/lib/analytics';
import { fail, handle, ok } from '@/lib/api';
import { notifyCrm } from '@/lib/notify-crm';
import { assertCompanyProfileComplete, assertEmailVerified, assertSameOrigin, audit, requireEmployer } from '@/lib/security/guards';
import { listEmployerVacancies } from '@/lib/services';
import { skipsModeration, VACANCY_LIMITS, vacancyInputSchema, vacancySaveSchema } from '@/lib/vacancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Вакансии своей компании — все статусы. */
export async function GET() {
  return handle(async () => {
    const { employer } = await requireEmployer();
    return ok({ vacancies: await listEmployerVacancies(employer.id) });
  });
}

/**
 * Новая вакансия из кабинета.
 *
 * В ленту она сразу не попадает никогда, кроме одного случая: клиент CRM
 * с действующим договором (skipsModeration) публикуется сразу же, как и
 * вакансия, заведённая агентством в CRM напрямую. У остальных — либо
 * черновик, либо на проверку агентству. Статус выставляет сервер по флагу
 * submit — «опубликована» в теле запроса прислать нельзя, такого поля
 * схема не знает и отбрасывает.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store } = await requireEmployer();

    const body: unknown = await request.json();
    const { submit } = vacancySaveSchema.parse(body);
    const input = vacancyInputSchema.parse(body);
    // На проверку — только с подтверждённой почтой и дозаполненной
    // компанией; черновик можно и без них
    if (submit) {
      await assertEmailVerified(session.accountId);
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

    // moderatedAt и publishedAt остаются на значениях по умолчанию схемы —
    // так же, как и у вакансий, которые агентство синкает из CRM напрямую
    // (syncFromCrm): человек решения не принимал, отмечать нечего
    const autoPublish = submit && skipsModeration(employer);
    const vacancy = await store.vacancies.create({
      ...input,
      employerId: employer.id,
      status: submit ? (autoPublish ? 'PUBLISHED' : 'PENDING') : 'DRAFT',
      isActive: autoPublish,
      submittedAt: submit ? new Date() : null,
    });

    await audit(
      session,
      { action: submit ? 'vacancy.submitted' : 'vacancy.drafted', entity: 'Vacancy', entityId: vacancy.id },
      request.headers,
    );

    if (submit && !autoPublish) {
      await notifyCrm(
        'vacancy',
        `Новая вакансия: ${employer.companyName}`,
        vacancy.title,
        vacancy.id,
      );
    }
    if (autoPublish) {
      await track('vacancy.published', { vacancyId: vacancy.id, employerId: employer.id });
    }

    return ok({ id: vacancy.id, status: vacancy.status }, { status: 201 });
  });
}
