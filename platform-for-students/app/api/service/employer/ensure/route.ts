import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  crmClientId: z.string().trim().min(1),
  companyName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().email().max(320),
  active: z.boolean(),
  actor: z.string().trim().min(1).max(200),
});

/**
 * Завести компанию клиента CRM на платформе, если её ещё нет, и обновить
 * статус договора. Раньше компания появлялась только при первом входе клиента
 * на платформу билетом; теперь клиент работает из CRM и туда не заходит,
 * поэтому CRM заводит её сама перед первым обращением. Повторный вызов
 * безопасен: имя и контакт не перезаписываются, обновляется только договор.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const input = bodySchema.parse(await request.json());
    const store = await getStore();

    const existing = await store.employers.findByCrmClientId(input.crmClientId);
    try {
      const employer = await store.employers.ensureForCrmClient(input);
      if (!existing) {
        await auditService(
          input.actor,
          { action: 'employer.provisioned', entity: 'Employer', entityId: employer.id, meta: { crmClientId: input.crmClientId } },
          request.headers,
        );
      }
      return ok({ employerId: employer.id, created: !existing });
    } catch {
      // Почта контакта уже занята другой учётной записью на платформе
      return fail(
        409,
        'Почта клиента уже занята другой учётной записью студенческой платформы — свяжите компании вручную',
        'EMAIL_TAKEN',
      );
    }
  });
}
