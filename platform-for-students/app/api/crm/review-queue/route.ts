import { NextResponse } from 'next/server';
import { buildCrmReviewItems } from '@/lib/crm-review-queue';
import { getStore } from '@/lib/db';
import { verifyCrmQueueRequest } from '@/lib/security/crm-queue-signature';
import { staffSsoSecret } from '@/lib/security/staff-ticket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Очередь проверок для CRM агентства: компании и вакансии на модерации,
 * справки об обучении на проверке.
 *
 * Без верной подписи — 404, а не 401: снаружи этого адреса как будто нет.
 * Без STUDENTS_SSO_SECRET — тоже 404: связки с CRM нет, и спрашивать
 * некому. Подпись и сроки — lib/security/crm-queue-signature.ts, состав
 * ответа — lib/crm-review-queue.ts.
 */
export async function GET(request: Request) {
  const secret = staffSsoSecret();
  if (
    !secret ||
    !verifyCrmQueueRequest(request.headers.get('x-crm-timestamp'), request.headers.get('x-crm-signature'), secret)
  ) {
    return NextResponse.json({ error: 'Не найдено', code: 'NOT_FOUND' }, { status: 404 });
  }

  const store = await getStore();
  const [employers, pendingVacancies, students] = await Promise.all([
    store.employers.list(),
    store.vacancies.listByStatus('PENDING'),
    store.students.list(),
  ]);

  return NextResponse.json(
    { items: buildCrmReviewItems({ employers, pendingVacancies, students }) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
