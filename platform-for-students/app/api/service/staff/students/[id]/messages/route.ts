import { z } from 'zod';

import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { AgencyChatError, getStaffThread, postStaffMessage } from '@/lib/agency-chat';
import { getStore } from '@/lib/db';
import { notifyStudentAgencyMessage } from '@/lib/notify';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { assertServiceAuth } from '@/lib/security/service-auth';
import { parseCrmActor } from '@/lib/staff-students';
import { messageSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ID = /^[\w-]{1,64}$/;

/**
 * Переписка студента с агентством для сотрудника CRM. Читать и писать может
 * только сотрудник, которого CRM назвала в x-crm-actor; работодатели сюда не
 * ходят. Чтение отмечает сообщения студента прочитанными.
 */
export async function GET(request: Request, props: Params) {
  const { id } = await props.params;
  return handle(async () => {
    assertServiceAuth(request);
    const actor = parseCrmActor(request);
    if (!actor) return fail(400, 'Нужен идентификатор сотрудника (x-crm-actor)', 'ACTOR_REQUIRED');
    if (!ID.test(id)) return fail(404, 'Студент не найден', 'NOT_FOUND');

    const limit = await rateLimit('staffStudents', actor);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const thread = await getStaffThread(id);
    if (!thread) return fail(404, 'Студент не найден', 'NOT_FOUND');
    return ok({ thread });
  });
}

const sendSchema = messageSchema.extend({
  staffName: z.string().trim().max(60).optional(),
});

/** Сообщение студенту от сотрудника. Первое сообщение открывает беседу. */
export async function POST(request: Request, props: Params) {
  const { id } = await props.params;
  return handle(async () => {
    assertServiceAuth(request);
    const actor = parseCrmActor(request);
    if (!actor) return fail(400, 'Нужен идентификатор сотрудника (x-crm-actor)', 'ACTOR_REQUIRED');
    if (!ID.test(id)) return fail(404, 'Студент не найден', 'NOT_FOUND');

    const limit = await rateLimit('staffStudents', actor);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { body, staffName } = sendSchema.parse(await request.json());

    try {
      const message = await postStaffMessage(id, staffName, body);
      if (!message) return fail(404, 'Студент не найден', 'NOT_FOUND');

      await notifyStudentAgencyMessage(id);
      const store = await getStore();
      await store.audit.log({
        accountId: null,
        actorLabel: `CRM:${actor}`,
        action: 'agency.message.sent',
        entity: 'Student',
        entityId: id,
        ip: clientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        meta: { length: body.length },
      });
      return ok({ message }, { status: 201 });
    } catch (err) {
      if (err instanceof AgencyChatError) return fail(400, err.message, 'INVALID_MESSAGE');
      throw err;
    }
  });
}
