import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, handle } from '@/lib/api';
import { auditService } from '@/lib/security/guards';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { readStored } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  crmClientId: z.string().trim().min(1),
  applicationId: z.string().trim().min(1),
  kind: z.enum(['photo', 'resume']),
  actor: z.string().trim().min(1).max(200),
});

const FILE_URL = /^\/api\/files\/(photo|resume)\/([0-9a-f-]{36}\.[a-z0-9]{2,5})$/i;

/**
 * Фото и резюме студента, который откликнулся на вакансию клиента CRM.
 *
 * То же правило, что у кабинета компании на платформе (canRead в /api/files):
 * работодатель видит файлы только тех, кто откликнулся на его вакансию. Поэтому
 * файл отдаём по отклику, а не по адресу: чужой отклик и чужой студент — 404.
 * Каждое чтение пишется в журнал — это персональные данные.
 */
export async function GET(request: Request) {
  return handle(async () => {
    assertServiceAuth(request);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = querySchema.parse(params);
    const { employer, store } = await requireServiceEmployer(query.crmClientId);

    const application = await store.applications.findById(query.applicationId);
    if (!application) return fail(404, 'Файл не найден', 'NOT_FOUND');
    const vacancy = await store.vacancies.findById(application.vacancyId);
    if (!vacancy || vacancy.employerId !== employer.id) return fail(404, 'Файл не найден', 'NOT_FOUND');

    const student = await store.students.findById(application.studentId);
    const url = query.kind === 'photo' ? student?.photoUrl : student?.resumeUrl;
    const match = url ? FILE_URL.exec(url) : null;
    if (!match || match[1] !== query.kind) return fail(404, 'Файл не найден', 'NOT_FOUND');

    const { body, type } = await readStored(match[1], match[2]);
    await auditService(
      query.actor,
      { action: 'student.file.read', entity: 'Application', entityId: application.id, meta: { kind: query.kind } },
      request.headers,
    );
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
