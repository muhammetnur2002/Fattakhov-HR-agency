"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccessDeniedError } from "@/lib/access";
import { authorizeOrThrow, requireAgencyActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { setLeadStatus, type LeadView } from "@/lib/services/leads";

export type LeadActionState = { error?: string; ok?: string };

const LABELS: Record<LeadView["status"], string> = {
  NEW: "Возвращена в новые",
  IN_PROGRESS: "Взята в работу",
  CONVERTED: "Отмечена как клиент",
  REJECTED: "Отклонена",
  SPAM: "Помечена спамом",
};

export async function setLeadStatusAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const actor = await requireAgencyActor();
  const leadId = String(formData.get("leadId") || "");
  const status = String(formData.get("status") || "") as LeadView["status"];

  if (!(status in LABELS)) return { error: "Неизвестный статус" };

  try {
    // Заявки разбирает тот же круг, что принимает заявки на подбор
    authorizeOrThrow(actor, "client.manage", { clientId: null });

    const user = await prisma.user.findFirst({
      where: { id: actor.id },
      select: { fullName: true },
    });

    await setLeadStatus({
      leadId,
      status,
      actorName: user?.fullName ?? "неизвестно",
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    throw error;
  }

  revalidatePath("/a/leads");

  /*
    «Стал клиентом» раньше только меняло статус: имя, компанию и контакт
    заявки всё равно приходилось перепечатывать в форму нового клиента
    вручную — заявка сама по себе никак не была связана с тем, что из
    неё завели. Отправляем прямо туда, с готовыми данными.
  */
  if (status === "CONVERTED") {
    redirect(`/a/clients/new?leadId=${encodeURIComponent(leadId)}`);
  }

  return { ok: LABELS[status] };
}
