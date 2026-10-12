"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/access";
import { requireAgencyActor } from "@/lib/auth/session";
import {
  addStudentsAsCandidates,
  StudentCandidateError,
  type AddStudentsResult,
} from "@/lib/services/student-candidates";

export type AddStudentsState = { error?: string; result?: AddStudentsResult };

/** «Добавить в кандидаты» для выбранных студентов. Без телефона и почты. */
export async function addStudentsAction(studentIds: string[]): Promise<AddStudentsState> {
  const actor = await requireAgencyActor();

  try {
    const result = await addStudentsAsCandidates(
      actor,
      Array.isArray(studentIds) ? studentIds.filter((id) => typeof id === "string") : [],
    );
    revalidatePath("/a/candidates");
    revalidatePath("/a/reviews/students");
    return { result };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: "Недостаточно прав" };
    if (error instanceof StudentCandidateError) return { error: error.message };
    throw error;
  }
}
