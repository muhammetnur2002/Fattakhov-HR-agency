import { z } from 'zod';
import { NEXT_STEP_STATUSES, track } from '@/lib/analytics';
import { fail, handle, ok } from '@/lib/api';
import { notifyApplicationStatus } from '@/lib/notify';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { buildEmployerBoard } from '@/lib/services';
import { applicationStatusSchema, applicationViewSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const scopeSchema = z.object({
  crmClientId: z.string().trim().min(1),
  actor: z.string().trim().min(1).max(200),
});

/**
 * Отклики на вакансии клиента CRM — служебный аналог /api/employer/applications.
 * Студенту отдаём то же, что видит работодатель в своём кабинете (контакты
 * раскрыты: он сам откликнулся), но без фото и резюме — это защищённые
 * файлы платформы, а CRM их пока не проксирует.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { employer } = await requireServiceEmployer(crmClientId);
    const board = await buildEmployerBoard(employer.id);
    return ok({
      vacancies: board.vacancies,
      applications: board.applications.map((a) => ({
        id: a.id,
        status: a.status,
        createdAt: a.createdAt,
        statusChangedAt: a.statusChangedAt,
        employerNote: a.employerNote,
        vacancyId: a.vacancyId,
        vacancyTitle: a.vacancyTitle,
        student: {
          fullName: a.student.fullName,
          email: a.student.email,
          phone: a.student.phone,
          age: a.student.age,
          university: a.student.university,
          speciality: a.student.speciality,
          studyYear: a.student.studyYear,
          studyVerified: a.student.studyVerified,
          city: a.student.city,
          workDays: a.student.workDays,
          hoursPerWeek: a.student.hoursPerWeek,
          skills: a.student.skills,
          about: a.student.about,
        },
      })),
    });
  });
}

/** Смена статуса отклика. */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const body: unknown = await request.json();
    const { crmClientId, actor } = scopeSchema.parse(body);
    const { applicationId, status, note } = applicationStatusSchema.parse(body);
    const { employer, store } = await requireServiceEmployer(crmClientId);

    const application = await store.applications.findById(applicationId);
    if (!application) return fail(404, 'Отклик не найден', 'NOT_FOUND');
    const vacancy = await store.vacancies.findById(application.vacancyId);
    if (!vacancy || vacancy.employerId !== employer.id) return fail(404, 'Отклик не найден', 'NOT_FOUND');

    const updated = await store.applications.setStatus(applicationId, status, note ?? undefined);
    if (status === 'HIRED') await store.students.setStatus(application.studentId, 'PLACED');

    if (NEXT_STEP_STATUSES.includes(status) && application.status !== status) {
      await track('application.next_step', {
        studentId: application.studentId,
        employerId: employer.id,
        vacancyId: vacancy.id,
        applicationId,
      });
    }

    await auditService(
      actor,
      { action: 'application.status', entity: 'Application', entityId: applicationId, meta: { status } },
      request.headers,
    );
    if (application.status !== status) await notifyApplicationStatus(application, status);

    return ok({ id: applicationId, status: updated?.status ?? status });
  });
}

/** Работодатель открыл карточку: новый отклик становится «просмотренным». */
export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const body: unknown = await request.json();
    const { crmClientId, actor } = scopeSchema.parse(body);
    const { applicationId } = applicationViewSchema.parse(body);
    const { employer, store } = await requireServiceEmployer(crmClientId);

    const application = await store.applications.findById(applicationId);
    if (!application) return fail(404, 'Отклик не найден', 'NOT_FOUND');
    const vacancy = await store.vacancies.findById(application.vacancyId);
    if (!vacancy || vacancy.employerId !== employer.id) return fail(404, 'Отклик не найден', 'NOT_FOUND');

    if (application.status !== 'NEW') return ok({ id: application.id, status: application.status });

    const updated = await store.applications.setStatus(applicationId, 'VIEWED');
    await auditService(
      actor,
      { action: 'application.status', entity: 'Application', entityId: applicationId, meta: { status: 'VIEWED', auto: true } },
      request.headers,
    );
    await track('profile.viewed', {
      studentId: application.studentId,
      employerId: employer.id,
      vacancyId: vacancy.id,
      applicationId,
    });
    await notifyApplicationStatus(application, 'VIEWED');

    return ok({ id: applicationId, status: updated?.status ?? 'VIEWED' });
  });
}
