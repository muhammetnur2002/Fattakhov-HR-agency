"use server";

import { signOut } from "@/auth";
import { requireActor } from "@/lib/auth/session";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { revokeAllSessions } from "@/lib/services/sessions";

export type SessionsState = { error?: string };

/**
 * Завершить все сессии, в том числе эту. Человек подозревает, что сессию
 * украли: пароль не меняется, но входить придётся заново везде.
 *
 * 2FA-ворота не требуются (allowWithoutTwoFactor): сотрудник, который
 * ещё не настроил второй фактор, тоже должен суметь оборвать чужой доступ.
 */
export async function revokeAllSessionsAction(): Promise<SessionsState> {
  const actor = await requireActor({ allowWithoutTwoFactor: true });

  const rate = await guardRate("login");
  if (!rate.allowed) return { error: rateLimitMessage(rate.retryAfter) };

  await revokeAllSessions(actor.id);
  // redirect внутри signOut: после него код не выполняется
  await signOut({ redirectTo: "/login?sessions=revoked" });
  return {};
}
