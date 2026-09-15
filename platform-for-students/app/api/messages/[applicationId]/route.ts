import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import {
  getThread,
  markThreadRead,
  postMessage,
  ThreadLockedError,
  viewerFromSession,
} from '@/lib/chat';
import { publishThreadEvent } from '@/lib/events';
import { assertSameOrigin, audit, getSession } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { messageSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { applicationId: string } };

/** Ветка целиком. 404 и «чужая ветка» намеренно неразличимы. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const viewer = viewerFromSession(await getSession());
    if (!viewer) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');

    const thread = await getThread(params.applicationId, viewer);
    if (!thread) return fail(404, 'Переписка не найдена', 'NOT_FOUND');
    return ok({ thread });
  });
}

/** Отправка сообщения. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await getSession();
    const viewer = viewerFromSession(session);
    if (!viewer) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');

    const limit = await rateLimit('message', `${viewer.role}:${viewer.profileId}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { body } = messageSchema.parse(await request.json());

    try {
      const result = await postMessage(params.applicationId, viewer, body);
      if (!result) return fail(404, 'Переписка не найдена', 'NOT_FOUND');

      // Уведомляем адресата, а не всех подряд: открытая вкладка получит
      // сообщение сама, без опроса по таймеру
      await publishThreadEvent({
        kind: 'message',
        applicationId: params.applicationId,
        recipientRole: result.recipient.role,
        recipientId: result.recipient.profileId,
      });

      // В журнал уходит факт и длина, но не текст: переписка — те же ПДн,
      // и дублировать её в лог значит хранить вторую незашифрованную копию
      await audit(
        session,
        {
          action: 'message.sent',
          entity: 'Application',
          entityId: params.applicationId,
          meta: { length: body.length },
        },
        request.headers,
      );

      return ok({ message: result.message }, { status: 201 });
    } catch (err) {
      if (err instanceof ThreadLockedError) return fail(403, err.message, 'THREAD_LOCKED');
      throw err;
    }
  });
}

/** Отметка «прочитано» для сообщений противоположной стороны. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = viewerFromSession(await getSession());
    if (!viewer) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');

    const result = await markThreadRead(params.applicationId, viewer);
    if (!result) return fail(404, 'Переписка не найдена', 'NOT_FOUND');

    // Автору есть что показать, только если что-то действительно прочли
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
