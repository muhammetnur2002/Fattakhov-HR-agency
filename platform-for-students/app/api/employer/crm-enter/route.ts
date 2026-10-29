import { fail, handle } from '@/lib/api';
import { requireEmployer } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Employer sessions no longer grant access to the separate CRM client portal. */
export async function GET() {
  return handle(async () => {
    await requireEmployer();
    return fail(410, 'Кабинет работодателя находится на студенческой платформе', 'CRM_ENTRY_RETIRED');
  });
}
