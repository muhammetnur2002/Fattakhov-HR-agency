import { fail, handle, ok } from '@/lib/api';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { storeUpload } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Обложка вакансии из формы в CRM: картинка компании (логотип, фирменное фото).
 * Клиент CRM на платформу не заходит, поэтому обычная загрузка с сессией ему
 * недоступна; CRM присылает файл своим сервером. Тот же вид `company` и те же
 * лимиты, что у загрузки из кабинета компании, — файл публичен, пока есть
 * опубликованная вакансия с ним.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const params = new URL(request.url).searchParams;
    const { employer } = await requireServiceEmployer(params.get('crmClientId'));

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail(400, 'Файл не передан', 'NO_FILE');

    const stored = await storeUpload('company', file);
    await auditService(
      String(form.get('actor') ?? 'CRM').slice(0, 200) || 'CRM',
      { action: 'file.uploaded', entity: 'Employer', entityId: employer.id, meta: { kind: 'company', size: stored.size } },
      request.headers,
    );
    return ok(stored, { status: 201 });
  });
}
