import { z } from 'zod';
import { track } from '@/lib/analytics';
import { fail, handle, ok } from '@/lib/api';
import { notifyCrm } from '@/lib/notify-crm';
import { assertCompanyProfileComplete, assertEmailVerified, auditService, HttpError } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import {
  skipsModeration,
  SUBMITTABLE_STATUSES,
  statusAfterEdit,
  vacancyActionSchema,
  vacancyContentOf,
  vacancyInputSchema,
  vacancySaveSchema,
} from '@/lib/vacancy';

export const runtime = 'nodejs';

type Params = { params: { id: string } };

const actorSchema = z.object({ actor: z.string().trim().min(1).max(200) });
const crmClientIdSchema = z.object({ crmClientId: z.string().trim().min(1) });

/** Своя вакансия клиента. Чужая и несуществующая — 404, как и на /api/employer. */
async function ownVacancy(id: string, crmClientId: unknown) {
  const { employer, store } = await requireServiceEmployer(crmClientId);
  const vacancy = await store.vacancies.findById(id);
  if (!vacancy || vacancy.employerId !== employer.id) {
    throw new HttpError(404, 'Вакансия не найдена', 'NOT_FOUND');
  }
  if (vacancy.crmId) {
    throw new HttpError(409, 'Эту вакансию ведёт агентство через CRM — изменения вносит оно', 'CRM_MANAGED');
  }
  return { employer, store, vacancy };
}

/** Карточка вакансии — для формы правки в CRM. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { vacancy } = await ownVacancy(params.id, crmClientId);
    return ok({ vacancy });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const body: unknown = await request.json();
    const { crmClientId } = crmClientIdSchema.parse(body);
    const { employer, store, vacancy } = await ownVacancy(params.id, crmClientId);
    const { actor } = actorSchema.parse(body);

    const { submit } = vacancySaveSchema.parse(body);
    const input = vacancyInputSchema.parse(body);
    if (submit) {
      await assertEmailVerified(employer.accountId);
      assertCompanyProfileComplete(employer);
    }

    const status = statusAfterEdit(vacancy.status, submit, employer);
    const changed = status !== vacancy.status;
    const autoPublished = status === 'PUBLISHED' && changed;
    const now = new Date();
    const updated = await store.vacancies.update(vacancy.id, {
      ...input,
      status,
      isActive: autoPublished,
      submittedAt: changed ? now : vacancy.submittedAt,
      ...(autoPublished
        ? { moderationNote: null, moderatedAt: now, publishedAt: now, approvedContent: vacancyContentOf(input) }
        : {}),
      ...(changed && vacancy.status === 'CLOSED'
        ? { closedAt: null, keepAfterClose: null, lastCleanupReminderAt: null }
        : {}),
    });

    await auditService(
      actor,
      { action: 'vacancy.updated', entity: 'Vacancy', entityId: vacancy.id, meta: { from: vacancy.status, to: status } },
      request.headers,
    );

    if (status === 'PENDING' && changed) {
      await notifyCrm('vacancy', `Новая вакансия: ${employer.companyName}`, updated.title, updated.id);
    }
    if (autoPublished) {
      await track('vacancy.published', { vacancyId: updated.id, employerId: employer.id });
    }

    return ok({ id: updated.id, status: updated.status });
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const body: unknown = await request.json();
    const { crmClientId } = crmClientIdSchema.parse(body);
    const { employer, store, vacancy } = await ownVacancy(params.id, crmClientId);
    const { actor } = actorSchema.parse(body);
    const { action, keep } = vacancyActionSchema.parse(body);

    if (action === 'close') {
      if (vacancy.status === 'CLOSED') return ok({ id: vacancy.id, status: vacancy.status });
      const updated = await store.vacancies.update(vacancy.id, {
        status: 'CLOSED',
        isActive: false,
        closedAt: new Date(),
        keepAfterClose: keep === true,
        lastCleanupReminderAt: null,
      });
      await auditService(
        actor,
        { action: 'vacancy.closed', entity: 'Vacancy', entityId: vacancy.id, meta: { keep: keep === true } },
        request.headers,
      );
      return ok({ id: updated.id, status: updated.status });
    }

    if (action === 'delete') {
      if (vacancy.status !== 'CLOSED') {
        return fail(409, 'Удалить можно только снятую вакансию', 'NOT_CLOSED');
      }
      await store.vacancies.delete(vacancy.id);
      await auditService(actor, { action: 'vacancy.deleted', entity: 'Vacancy', entityId: vacancy.id }, request.headers);
      return ok({ id: vacancy.id, deleted: true });
    }

    if (vacancy.status === 'PENDING') return ok({ id: vacancy.id, status: vacancy.status });
    if (!SUBMITTABLE_STATUSES.includes(vacancy.status)) {
      return fail(409, 'Вакансия уже опубликована', 'ALREADY_PUBLISHED');
    }
    await assertEmailVerified(employer.accountId);
    assertCompanyProfileComplete(employer);

    const autoPublish = skipsModeration(employer);
    const now = new Date();
    const updated = await store.vacancies.update(vacancy.id, {
      status: autoPublish ? 'PUBLISHED' : 'PENDING',
      isActive: autoPublish,
      submittedAt: now,
      ...(autoPublish
        ? { moderationNote: null, moderatedAt: now, publishedAt: now, approvedContent: vacancyContentOf(vacancy) }
        : {}),
      closedAt: null,
      keepAfterClose: null,
      lastCleanupReminderAt: null,
    });
    await auditService(actor, { action: 'vacancy.submitted', entity: 'Vacancy', entityId: vacancy.id }, request.headers);
    if (autoPublish) {
      await track('vacancy.published', { vacancyId: updated.id, employerId: employer.id });
    } else {
      await notifyCrm('vacancy', `Новая вакансия: ${employer.companyName}`, updated.title, updated.id);
    }
    return ok({ id: updated.id, status: updated.status });
  });
}
