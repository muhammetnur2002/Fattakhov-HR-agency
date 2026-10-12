import { fail, handle, ok } from '@/lib/api';
import { STUDENT_CONSENT_VERSION, needsConsentRenewal } from '@/lib/legal';
import { assertSameOrigin, audit, requireStudent } from '@/lib/security/guards';
import { clientIp } from '@/lib/security/rate-limit';
import { consentRenewalSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Студент принял новую редакцию согласия на обработку персональных данных.
 *
 * Идентификатор студента — из сессии, как и во всём /api/students/me. Версию присылает сам
 * клиент — ту, что показал человеку: если текст успел обновиться ещё раз, 409, и человек не
 * принимает редакцию, которой не видел. Записываются версия, время и IP (Student.consentVersion /
 * consentAt / consentIp); прежняя версия остаётся в журнале аудита рядом с новой.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();
    const { version } = consentRenewalSchema.parse(await request.json().catch(() => null));

    if (version !== STUDENT_CONSENT_VERSION) {
      return fail(409, 'Текст согласия обновился — обновите страницу и прочитайте новую редакцию', 'CONSENT_STALE');
    }
    if (!needsConsentRenewal(student)) {
      return ok({ renewed: false, version: student.consentVersion });
    }

    const updated = await store.students.acceptConsent(student.id, { version, ip: clientIp(request.headers) });
    if (!updated) return fail(404, 'Профиль не найден', 'NOT_FOUND');

    await audit(
      session,
      {
        action: 'student.consent.renewed',
        entity: 'Student',
        entityId: student.id,
        meta: { from: student.consentVersion, to: version },
      },
      request.headers,
    );
    return ok({ renewed: true, version: updated.consentVersion });
  });
}
