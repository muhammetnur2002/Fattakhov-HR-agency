"use server";

import { headers } from "next/headers";

import { effectiveGrants } from "@/lib/access";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/rate-limit";
import { guardRate, rateLimitMessage } from "@/lib/security/guard";
import { recordStudentProfileAccess } from "@/lib/services/student-profile-audit";
import { fetchPlatformStudent, StudentsServiceError } from "@/lib/students-service";

export type RevealContactsResult =
  | { contacts: { email: string; phone: string | null }; error?: undefined }
  | { error: string; contacts?: undefined };

/**
 * «Показать контакты» — отдельное явное действие, а не часть открытия анкеты.
 *
 * Порядок важен: сначала доступ и лимит, потом вызов платформы с `contacts=1`
 * (она тоже пишет у себя в журнал), и только после успешного ответа — запись в
 * журнал доступа к ПДн CRM. Не записалось — контакты не отдаём: показ без следа
 * недопустим. Контакты возвращаются только в ответе этого действия: в адрес,
 * кэш страницы и разметку они не попадают.
 */
export async function revealStudentContactsAction(studentId: string): Promise<RevealContactsResult> {
  const actor = await requireAgencyActor();
  authorize(actor, "students.enter");
  if (!effectiveGrants(actor).includes("students.search")) {
    return { error: "Недостаточно прав" };
  }
  if (!/^[\w-]{1,64}$/.test(studentId)) return { error: "Студент не найден" };

  const limit = await guardRate("studentContacts", actor.id);
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfter) };

  let profile;
  try {
    profile = await fetchPlatformStudent(studentId, { actorId: actor.id, contacts: true });
  } catch (error) {
    if (!(error instanceof StudentsServiceError)) throw error;
    return { error: error.message };
  }
  if (!profile) return { error: "Студент не найден" };
  if (!profile.contacts) return { error: "Платформа не отдала контакты" };

  try {
    await recordStudentProfileAccess(
      actor,
      studentId,
      "student_profile_contacts_view",
      clientIp(await headers()),
    );
  } catch (error) {
    console.error("[students] не записан показ контактов:", error);
    return { error: "Не удалось записать показ в журнал — контакты не показаны. Попробуйте ещё раз." };
  }

  return { contacts: profile.contacts };
}
