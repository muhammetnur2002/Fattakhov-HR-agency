"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import {
  createStaffAccount,
  resetStaffPassword,
  setStaffActive,
  StaffError,
  updateStaff,
} from "@/lib/services/staff";
import {
  createStaffSchema,
  resetStaffPasswordSchema,
  updateStaffSchema,
} from "@/lib/validation/staff";

export type TeamFormState = { error?: string; ok?: string };

/** Поля формы. Доступы — несколько значений под одним именем. */
function readForm(formData: FormData) {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
  };
  return {
    userId: text("userId"),
    email: text("email"),
    fullName: text("fullName"),
    password: text("password"),
    passwordConfirm: text("passwordConfirm"),
    role: text("role"),
    position: text("position"),
    grants: formData.getAll("grants").map(String),
  };
}

function explain(error: unknown): TeamFormState | null {
  if (error instanceof AccessDeniedError) {
    return {
      error:
        "Недостаточно прав: назначать можно роли не выше своей и только те доступы, что есть у вас.",
    };
  }
  if (error instanceof StaffError) {
    return { error: error.message };
  }
  return null;
}

/**
 * Учётка сотрудника с паролем, который задал владелец (или тот, кому
 * доверено управление командой). Сообщать его человеку — отдельно и лично.
 */
export async function createStaffAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const actor = await requireAgencyActor();
  const parsed = createStaffSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    await createStaffAccount(actor, parsed.data);
  } catch (error) {
    const known = explain(error);
    if (known) return known;
    throw error;
  }

  revalidatePath("/a/team");
  return {
    ok: `Аккаунт для ${parsed.data.email} создан — сообщите почту и пароль лично`,
  };
}

export async function resetStaffPasswordAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const actor = await requireAgencyActor();
  const parsed = resetStaffPasswordSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    await resetStaffPassword(actor, parsed.data.userId, parsed.data.password);
  } catch (error) {
    const known = explain(error);
    if (known) return known;
    throw error;
  }

  revalidatePath("/a/team");
  return { ok: "Пароль обновлён — сообщите его сотруднику лично" };
}

export async function updateStaffAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const actor = await requireAgencyActor();
  const parsed = updateStaffSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  try {
    await updateStaff(actor, parsed.data);
  } catch (error) {
    const known = explain(error);
    if (known) return known;
    throw error;
  }

  revalidatePath("/a/team");
  return { ok: "Сохранено" };
}

export async function setStaffActiveAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const actor = await requireAgencyActor();
  const userId = String(formData.get("userId") || "");
  const active = formData.get("active") === "true";

  try {
    await setStaffActive(actor, userId, active);
  } catch (error) {
    const known = explain(error);
    if (known) return known;
    throw error;
  }

  revalidatePath("/a/team");
  return { ok: active ? "Доступ возвращён" : "Доступ отключён" };
}
