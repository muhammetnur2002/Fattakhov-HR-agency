import { z } from 'zod';
import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { getThread, markThreadRead, postMessage, ThreadLockedError } from '@/lib/chat';
import { publishThreadEvent } from '@/lib/events';
import { notifyStudentNewMessage } from '@/lib/notify';
import { auditService } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { requireServiceEmployer } from '@/lib/security/service-employer';
import { messageSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { applicationId: string } };

const scopeSchema = z.object({
  crmClientId: z.string().trim().min(1),
  actor: z.string().trim().min(1).max(200),
});

/** Ветка целиком. Чужая и несуществующая — 404, как и на /api/messages. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const crmClientId = new URL(request.url).searchParams.get('crmClientId');
    const { employer } = await requireServiceEmployer(crmClientId);
    const thread = await getThread(params.applicationId, { role: 'EMPLOYER', profileId: employer.id });
    if (!thread) return fail(404, 'Переписка не найдена', 'NOT_FOUND');
    return ok({ thread });
  });
}

/** Сообщение студенту от имени клиента. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const raw: unknown = await request.json();
    const { crmClientId, actor } = scopeSchema.parse(raw);
    const { body } = messageSchema.parse(raw);
    const { employer } = await requireServiceEmployer(crmClientId);
    const viewer = { role: 'EMPLOYER' as const, profileId: employer.id };

    const limit = await rateLimit('message', `${viewer.role}:${viewer.profileId}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    try {
      const result = await postMessage(params.applicationId, viewer, body);
      if (!result) return fail(404, 'Переписка не найдена', 'NOT_FOUND');

      await publishThreadEvent({
        kind: 'message',
        applicationId: params.applicationId,
        recipientRole: result.recipient.role,
        recipientId: result.recipient.profileId,
      });
      await notifyStudentNewMessage(params.applicationId);
      // В журнал — факт и длина, не текст: переписка — те же ПДн
      await auditService(
        actor,
        { action: 'message.sent', entity: 'Application', entityId: params.applicationId, meta: { length: body.length } },
        request.headers,
      );
      return ok({ message: result.message }, { status: 201 });
    } catch (err) {
      if (err instanceof ThreadLockedError) return fail(403, err.message, 'THREAD_LOCKED');
      throw err;
    }
  });
}

/** Отметка «прочитано» для сообщений студента. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    assertServiceAuth(request);
    const { crmClientId } = scopeSchema.pick({ crmClientId: true }).parse(await request.json());
    const { employer } = await requireServiceEmployer(crmClientId);

    const result = await markThreadRead(params.applicationId, { role: 'EMPLOYER', profileId: employer.id });
    if (!result) return fail(404, 'Переписка не найдена', 'NOT_FOUND');

    if (result.count > 0) {
      await publishThreadEvent({
        kind: 'read',
        applicationId: params.applicationId,
        recipientRole: result.recipient.role,
        recipientId: result.recipient.profileId,
      });
    }
    return ok({ read: result.count });
  });
}
