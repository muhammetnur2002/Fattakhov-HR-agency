import { track } from '@/lib/analytics';
import { fail, handle, ok } from '@/lib/api';
import { notifyCrm } from '@/lib/notify-crm';
import {
  assertCompanyProfileComplete,
  assertEmailVerified,
  assertSameOrigin,
  audit,
  HttpError,
  requireEmployer,
} from '@/lib/security/guards';
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

type Params = { params: Promise<{ id: string }> };

/**
 * Своя вакансия, заведённая в кабинете.
 *
 * Чужая и несуществующая отвечают одинаково — 404: по разнице ответов
 * можно было бы перебирать идентификаторы чужих вакансий. Вакансию из CRM
 * кабинет не меняет: следующая синхронизация молча перезаписала бы правку.
 */
async function ownVacancy(id: string) {
  const context = await requireEmployer();
  const vacancy = await context.store.vacancies.findById(id);
  if (!vacancy || vacancy.employerId !== context.employer.id) {
    throw new HttpError(404, 'Вакансия не найдена', 'NOT_FOUND');
  }
  if (vacancy.crmId) {
    throw new HttpError(409, 'Эту вакансию ведёт агентство через CRM — изменения вносит оно', 'CRM_MANAGED');
  }
  return { ...context, vacancy };
}

/** Правка вакансии. Опубликованная после правки уходит на повторную проверку. */
export async function PATCH(request: Request, props: Params) {
  const params = await props.params;
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store, vacancy } = await ownVacancy(params.id);

    const body: unknown = await request.json();
    const { submit } = vacancySaveSchema.parse(body);
    const input = vacancyInputSchema.parse(body);
    if (submit) {
      await assertEmailVerified(session.accountId);
      assertCompanyProfileComplete(employer);
    }

    const status = statusAfterEdit(vacancy.status, submit, employer);
    const changed = status !== vacancy.status;
    // У клиента с договором правка публикуется сразу — статус меняется
    // на PUBLISHED, а не на PENDING (см. statusAfterEdit/skipsModeration)
    const autoPublished = status === 'PUBLISHED' && changed;
    const now = new Date();
    const updated = await store.vacancies.update(vacancy.id, {
      ...input,
      status,
      // После правки вакансии в ленте нет, кроме случая автопубликации:
      // остальным либо ещё не публиковалась, либо ждёт повторной проверки
      isActive: autoPublished,
      submittedAt: changed ? now : vacancy.submittedAt,
      ...(autoPublished
        ? { moderationNote: null, moderatedAt: now, publishedAt: now, approvedContent: vacancyContentOf(input) }
        : {}),
      // Отправлена повторно из CLOSED — уборка её больше не касается
      ...(changed && vacancy.status === 'CLOSED'
        ? { closedAt: null, keepAfterClose: null, lastCleanupReminderAt: null }
        : {}),
    });

    await audit(
      session,
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

/** Действие над вакансией: отправить на проверку, снять или удалить. */
export async function POST(request: Request, props: Params) {
  const params = await props.params;
  return handle(async () => {
    assertSameOrigin(request);
    const { session, employer, store, vacancy } = await ownVacancy(params.id);
    const { action, keep } = vacancyActionSchema.parse(await request.json());

    if (action === 'close') {
      // Повторное нажатие — не ошибка: результат уже тот, что просили.
      // Решение сохранить/не сохранять при этом не переспрашиваем.
      if (vacancy.status === 'CLOSED') return ok({ id: vacancy.id, status: vacancy.status });
      const updated = await store.vacancies.update(vacancy.id, {
        status: 'CLOSED',
        isActive: false,
        closedAt: new Date(),
        keepAfterClose: keep === true,
        lastCleanupReminderAt: null,
      });
      await audit(
        session,
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
      await audit(session, { action: 'vacancy.deleted', entity: 'Vacancy', entityId: vacancy.id }, request.headers);
      return ok({ id: vacancy.id, deleted: true });
    }

    if (vacancy.status === 'PENDING') return ok({ id: vacancy.id, status: vacancy.status });
    if (!SUBMITTABLE_STATUSES.includes(vacancy.status)) {
      return fail(409, 'Вакансия уже опубликована', 'ALREADY_PUBLISHED');
    }
    await assertEmailVerified(session.accountId);
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
      // Возвращается в оборот — уборка её больше не касается
      closedAt: null,
      keepAfterClose: null,
      lastCleanupReminderAt: null,
    });
    await audit(session, { action: 'vacancy.submitted', entity: 'Vacancy', entityId: vacancy.id }, request.headers);
    if (autoPublish) {
      await track('vacancy.published', { vacancyId: updated.id, employerId: employer.id });
    } else {
      await notifyCrm('vacancy', `Новая вакансия: ${employer.companyName}`, updated.title, updated.id);
    }
    return ok({ id: updated.id, status: updated.status });
  });
}
