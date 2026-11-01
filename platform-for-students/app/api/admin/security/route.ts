import { z } from 'zod';
import { handle, ok, tooManyRequests } from '@/lib/api';
import { assertSameOrigin } from '@/lib/security/origin';
import { decideSecurityIncident, deliverSecurityAlerts, requireSecurityAccess } from '@/lib/security/incidents';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
const schema = z.union([
  z.object({ action: z.literal('retry-mail') }).strict(),
  z.object({ action: z.enum(['reviewed', 'suspend', 'restore']), incidentId: z.string().cuid(), reason: z.string().trim().min(10).max(1000) }).strict(),
]);

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { session } = await requireSecurityAccess();
    const limit = await rateLimit('message', `security:${session.accountId}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const input = schema.parse(await request.json());
    if (input.action === 'retry-mail') return ok(await deliverSecurityAlerts());
    return ok(await decideSecurityIncident(input.incidentId, input.action, input.reason));
  });
}
