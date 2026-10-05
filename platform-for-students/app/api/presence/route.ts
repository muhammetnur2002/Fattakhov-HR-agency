import { handle, ok, tooManyRequests } from '@/lib/api';
import { getStore } from '@/lib/db';
import { recordPulse } from '@/lib/presence-pulse';
import { assertSameOrigin, requireRoleWithAccount } from '@/lib/security/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Пульс «я на платформе».
 *
 * Шлётся с открытой вкладки раз в минуту и сразу при возврате к ней.
 * Отметка пишется не чаще раза в минуту на учётную запись: иначе десять
 * вкладок дали бы десять записей в минуту на человека, а показывается
 * всё равно минутная точность. Лимит запросов считается только на
 * настоящие записи — см. lib/presence-pulse.ts.
 *
 * В журнал аудита не пишется намеренно: это фоновое событие, которое
 * происходит тысячи раз в день, и в журнале оно похоронило бы всё
 * остальное — а разбирают журнал именно ради остального.
 *
 * Администратору пульс не нужен: сотрудник агентства не собеседник
 * студенту, и его статус нигде не показывается.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    // Учётная запись прочитана один раз — при проверке сессии, второй SELECT не нужен
    const { account } = await requireRoleWithAccount('STUDENT', 'EMPLOYER');

    const result = await recordPulse(await getStore(), account);
    if ('limited' in result) return tooManyRequests(result.retryAfter);
    return ok({ written: result.written });
  });
}
