import 'server-only';
import { requireRole } from './guards';
import { HttpError } from './http-error';
import { getThread, viewerFromSession } from '@/lib/chat';
import { checkChatAttachment } from './attachment-check';
import { recordSecurityIncident } from './incidents';

/** Preparation for a private quarantine worker. No route currently accepts uploads.
 * Requires a real active session and thread permission; caller cannot attribute
 * an incident to an arbitrary account. Never returns a public file URL.
 */
export async function inspectChatAttachment(threadId: string, file: File, headers: Headers) {
  const session = await requireRole('STUDENT', 'EMPLOYER');
  const viewer = viewerFromSession(session);
  const thread = viewer ? await getThread(threadId, viewer) : null;
  if (!thread) throw new HttpError(404, 'Переписка не найдена', 'NOT_FOUND');
  if (!thread.canWrite) throw new HttpError(403, 'Переписка недоступна', 'THREAD_LOCKED');
  const result = await checkChatAttachment(file);
  if (result.verdict === 'blocked' && result.reason === 'malware' && result.hash) {
    await recordSecurityIncident({ kind: 'MALWARE', accountId: session.accountId, threadId,
      contentHash: result.hash, rule: 'cloudmersive-advanced/restricted-v1', headers });
  }
  // Image moderation rejection never creates an owner alert or suspends an account.
  return { ...result, deliverable: false as const };
}
