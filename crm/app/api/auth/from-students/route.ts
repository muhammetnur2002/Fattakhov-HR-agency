import { AuthError, CredentialsSignin } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

import { signIn } from "@/auth";

/**
 * Вход из студенческой платформы: компания, которую сотрудник CRM уже
 * объединил с профилем там, переходит по ссылке с билетом и оказывается
 * в своём кабинете без второго пароля — см. auth.ts, провайдер
 * "students-entry", и lib/students-entry.ts (проверка билета).
 */
export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket") ?? "";

  try {
    await signIn("students-entry", { ticket, redirectTo: "/dashboard" });
    // signIn() при успехе сам бросает редирект (перехватывается ниже
    // как исключение) — сюда управление не доходит
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return NextResponse.redirect(new URL("/login?error=students_entry", request.url));
    }
    if (error instanceof AuthError) {
      return NextResponse.redirect(new URL("/login?error=students_entry", request.url));
    }
    throw error;
  }
}
