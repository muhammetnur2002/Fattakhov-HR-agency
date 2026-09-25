"use server";

import { effectiveGrants } from "@/lib/access";
import { actorDisplayName, authorize, requireAgencyActor } from "@/lib/auth/session";
import { decideStudyReview } from "@/lib/students-service";

export async function decideStudyReviewAction(input: {
  studentId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.study")) {
    return { error: "Недостаточно прав" };
  }

  const actorLabel = await actorDisplayName(actor);
  const result = await decideStudyReview({ ...input, actor: actorLabel });
  if (result.error) return { error: result.error };
  return { ok: true };
}
