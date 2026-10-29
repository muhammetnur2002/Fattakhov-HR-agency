import { fail, handle } from '@/lib/api';
import { assertSameOrigin, requireEmployer } from '@/lib/security/guards';

export const runtime = 'nodejs';

/** Existing CRM identifiers remain; employer sessions no longer request CRM access. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireEmployer();
    return fail(410, 'Кабинет работодателя находится на студенческой платформе', 'CRM_LINK_RETIRED');
  });
}
