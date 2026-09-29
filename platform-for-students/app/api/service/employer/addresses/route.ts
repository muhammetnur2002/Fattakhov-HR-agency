import { handle, ok } from '@/lib/api';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { listEmployerAddresses } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Адреса, где клиент уже нанимал, — чтобы форма вакансии в CRM подсказывала их. */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { employer } = await requireServiceEmployer(crmClientId);
    return ok({ addresses: await listEmployerAddresses(employer.id) });
  });
}
