import { fail, handle, ok } from '@/lib/api';
import { assertSameOrigin, audit, requireStudent } from '@/lib/security/guards';
import { undoSwipeSchema } from '@/lib/validation';
import { listSkipped } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const { student } = await requireStudent();
    return ok({ skipped: await listSkipped(student.id) });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, student, store } = await requireStudent();
    const { vacancyId } = undoSwipeSchema.parse(await request.json());
    if (!await store.swipes.dismiss(student.id, vacancyId)) return fail(409, 'Вакансия уже не находится в пропущенных');
    await audit(session, { action: 'vacancy.dismissed', entity: 'Vacancy', entityId: vacancyId }, request.headers);
    return ok({ dismissed: true });
  });
}
