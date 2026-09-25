"use server";

import { effectiveGrants } from "@/lib/access";
import { actorDisplayName, authorize, requireAgencyActor } from "@/lib/auth/session";
import { decideModeration } from "@/lib/students-service";

/**
 * Решение по компании или вакансии со студенческой платформы. Право —
 * не отдельное действие в матрице, а StaffGrant (см. lib/access):
 * students.moderation выдаётся владельцем поштучно, поэтому проверяется
 * через effectiveGrants, а не canDo.
 */
export async function decideModerationAction(input: {
  entity: "company" | "vacancy";
  id: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
  version?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.moderation")) {
    return { error: "Недостаточно прав" };
  }

  const actorLabel = await actorDisplayName(actor);
  const result = await decideModeration({ ...input, actor: actorLabel });
  if (result.error) return { error: result.error };
  return { ok: true };
}
