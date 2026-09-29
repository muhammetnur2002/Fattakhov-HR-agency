import { z } from 'zod';
import { fail, handle, ok } from '@/lib/api';
import { isInnExistsError } from '@/lib/db';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { companyFileUrlSchema } from '@/lib/company';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const bodySchema = z.object({
  crmClientId: z.string().trim().min(1),
  actor: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  inn: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{12})$/, 'ИНН — 10 цифр у компании или 12 у ИП')
    .nullable()
    .optional(),
  about: optional(4000),
  website: optional(300),
  city: optional(120),
  /** Логотип, уже загруженный на платформу (см. /api/service/employer/upload); undefined — не менять */
  logoUrl: companyFileUrlSchema.nullable().optional(),
});

/**
 * Профиль компании клиента CRM: название, ИНН, «о компании», сайт, город, логотип.
 * Клиент ведёт его у себя в CRM, а сюда он приходит, чтобы агентство при проверке
 * вакансии видело реквизиты и лицо компании, а студент — логотип на карточке.
 * ИНН уникален на платформе: если он уже занят другой компанией — 409.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const input = bodySchema.parse(await request.json());
    const { employer, store } = await requireServiceEmployer(input.crmClientId);

    try {
      await store.employers.updateProfile(employer.id, {
        companyName: input.companyName,
        contactName: employer.contactName,
        logoUrl: input.logoUrl === undefined ? employer.logoUrl : input.logoUrl,
        about: input.about ?? null,
        website: input.website ?? null,
        city: input.city ?? null,
        socials: employer.socials,
        photos: employer.photos,
        videoUrl: employer.videoUrl,
        ...(input.inn ? { inn: input.inn } : {}),
      });
    } catch (err) {
      if (isInnExistsError(err)) {
        return fail(409, 'Этот ИНН уже указан у другой компании на студенческой платформе', 'INN_EXISTS');
      }
      throw err;
    }

    await auditService(
      input.actor,
      { action: 'employer.profile.synced', entity: 'Employer', entityId: employer.id, meta: { crmClientId: input.crmClientId } },
      request.headers,
    );
    return ok({ synced: true });
  });
}
