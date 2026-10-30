import { handle, ok } from '@/lib/api';
import { requireEmployer } from '@/lib/security/guards';
import { listAllCandidates } from '@/lib/services';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handle(async () => {
    const { employer } = await requireEmployer();
    return ok({ candidates: await listAllCandidates(employer.id) });
  });
}
