import { fail, handle, ok, tooManyRequests } from '@/lib/api';
import { AgencyChatError, getStudentThread, postStudentMessage } from '@/lib/agency-chat';
import { notifyCrmStudentReply } from '@/lib/notify';
import { assertSameOrigin, audit, getSession } from '@/lib/security/guards';
import { rateLimit } from '@/lib/security/rate-limit';
import { getStore } from '@/lib/db';
import { messageSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Студент по сессии → его профиль. null — не студент или профиль пропал. */
async function currentStudentId() {
  const session = await getSession();
  if (!session || session.role !== 'STUDENT') return { session, studentId: null };
  const student = await (await getStore()).students.findByAccountId(session.accountId);
  return { session, studentId: student?.id ?? null };
}

/** Переписка студента с агентством. Открытие прочитывает сообщения агентства. */
export async function GET() {
  return handle(async () => {
    const { studentId } = await currentStudentId();
    if (!studentId) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');
    return ok({ thread: await getStudentThread(studentId, { markRead: true }) });
  });
}

/** Ответ студента агентству. Только в беседу, которую агентство уже начало. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session, studentId } = await currentStudentId();
    if (!session || !studentId) return fail(401, 'Требуется вход в систему', 'UNAUTHORIZED');

    const limit = await rateLimit('message', `AGENCY:${studentId}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { body } = messageSchema.parse(await request.json());

    try {
      const message = await postStudentMessage(studentId, body);
      await notifyCrmStudentReply(studentId);
      // В журнал — факт и длина, текст не дублируем
      await audit(
        session,
        { action: 'agency.message.sent', entity: 'Student', entityId: studentId, meta: { length: body.length } },
        request.headers,
      );
      return ok({ message }, { status: 201 });
    } catch (err) {
      if (err instanceof AgencyChatError) return fail(403, err.message, 'THREAD_LOCKED');
      throw err;
    }
  });
}
