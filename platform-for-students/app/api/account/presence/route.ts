import { handle, ok } from '@/lib/api';
import { getStore } from '@/lib/db';
import { assertSameOrigin, audit, requireRole } from '@/lib/security/guards';
import { presenceSettingsSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Показывать ли собеседникам «в сети» и «был(а) …». */
export async function GET() {
  return handle(async () => {
    const session = await requireRole('STUDENT', 'EMPLOYER');
    const account = await (await getStore()).accounts.findById(session.accountId);
    return ok({ show: account?.showPresence ?? true });
  });
}

/**
 * Включить или выключить показ.
 *
 * Выключенный показ скрывает статус полностью, а не заменяет его на
 * «был(а) недавно»: расплывчатая формулировка всё равно сообщала бы, что
 * человек заходил, и прятаться было бы не от чего.
 *
 * Пульс при этом продолжает идти: человек может снова включить показ, и
 * тогда строка должна быть честной, а не начинаться с нуля.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const session = await requireRole('STUDENT', 'EMPLOYER');
    const { show } = presenceSettingsSchema.parse(await request.json());

    await (await getStore()).accounts.setShowPresence(session.accountId, show);
    await audit(
      session,
      { action: 'account.presence', entity: 'Account', entityId: session.accountId, meta: { show } },
      request.headers,
    );
    return ok({ show });
  });
}
