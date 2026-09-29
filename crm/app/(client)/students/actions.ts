"use server";

import { redirect } from "next/navigation";

import { authorize, requireClientActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  actOnEmployerVacancy,
  createEmployerVacancy,
  updateEmployerVacancy,
  type VacancyFields,
} from "@/lib/students-service";

/** Имя сотрудника клиента — для журнала аудита на той стороне (auditService). */
async function actorLabel(userId: string): Promise<string> {
  const user = await prisma.user.findFirst({ where: { id: userId }, select: { fullName: true } });
  return user?.fullName ?? "CRM";
}

export type VacancyFormState = { error?: string; fields?: Record<string, string> };

function line(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : Number(s);
}

function parseVacancyFields(formData: FormData): VacancyFields {
  return {
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    responsibilities: line(formData.get("responsibilities")),
    requirements: line(formData.get("requirements")),
    perks: line(formData.get("perks")),
    learnings: line(formData.get("learnings")),
    team: textOrNull(formData.get("team")),
    salaryFrom: numberOrNull(formData.get("salaryFrom")),
    salaryTo: numberOrNull(formData.get("salaryTo")),
    salaryPeriod: (formData.get("salaryPeriod") as VacancyFields["salaryPeriod"]) || "MONTH",
    city: String(formData.get("city") ?? "").trim(),
    district: textOrNull(formData.get("district")),
    address: textOrNull(formData.get("address")),
    addressDetails: textOrNull(formData.get("addressDetails")),
    workFormat: (formData.get("workFormat") as VacancyFields["workFormat"]) || "ONSITE",
    employmentType: (formData.get("employmentType") as VacancyFields["employmentType"]) || "PART_TIME",
    shiftDays: formData.getAll("shiftDays") as VacancyFields["shiftDays"],
    hoursPerWeek: numberOrNull(formData.get("hoursPerWeek")),
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Фото — пока только через кабинет на самой платформе; см. обсуждение в чате
    photos: [],
    videoUrl: textOrNull(formData.get("videoUrl")),
  };
}

export async function createVacancyAction(
  _prev: VacancyFormState,
  formData: FormData,
): Promise<VacancyFormState> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const submit = formData.get("submit") === "true";
  const input = parseVacancyFields(formData);
  const label = await actorLabel(actor.id);

  const result = await createEmployerVacancy({ ...input, crmClientId: actor.clientId, actor: label, submit });
  if (result.error) {
    return { error: result.error.error ?? "Не удалось сохранить вакансию", fields: result.error.fields };
  }
  redirect("/students");
}

export async function updateVacancyAction(
  id: string,
  _prev: VacancyFormState,
  formData: FormData,
): Promise<VacancyFormState> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const submit = formData.get("submit") === "true";
  const input = parseVacancyFields(formData);
  const label = await actorLabel(actor.id);

  const result = await updateEmployerVacancy(id, { ...input, crmClientId: actor.clientId, actor: label, submit });
  if (result.error) {
    return { error: result.error.error ?? "Не удалось сохранить вакансию", fields: result.error.fields };
  }
  redirect("/students");
}

/** Отправить на проверку/опубликовать, снять с публикации или удалить снятую. */
export async function vacancyActionAction(
  id: string,
  action: "submit" | "close" | "delete",
  keep?: boolean,
): Promise<{ error?: string }> {
  const actor = await requireClientActor();
  authorize(actor, "students.enterAsClient");
  if (!actor.clientId) return { error: "Кабинет не привязан к компании" };

  const label = await actorLabel(actor.id);
  const result = await actOnEmployerVacancy(id, { crmClientId: actor.clientId, actor: label, action, keep });
  if (result.error) return { error: result.error.error ?? "Не удалось выполнить действие" };
  return {};
}
