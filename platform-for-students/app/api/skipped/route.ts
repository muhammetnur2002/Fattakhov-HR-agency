import { handle, ok } from '@/lib/api';
import { requireStudent } from '@/lib/security/guards';
import { listSkipped } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const { student } = await requireStudent();
    return ok({ skipped: await listSkipped(student.id) });
  });
}
