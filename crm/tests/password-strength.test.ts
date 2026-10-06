/**
 * Правило слабых паролей.
 *
 * Одно на всех: регистрация, приглашение, создание учётки, смена и сброс —
 * везде пароль проходит newPasswordSchema / passwordProblem. Здесь проверяется
 * само правило; что оно подключено ко всем формам, видно из последнего блока.
 */
import { describe, expect, it } from "vitest";

import { commonPasswordCount, isCommonPassword } from "@/lib/auth/common-passwords";
import { acceptInviteSchema } from "@/lib/validation/auth";
import {
  createClientUserSchema,
  resetClientUserPasswordSchema,
} from "@/lib/validation/client";
import {
  changePasswordSchema,
  newPasswordSchema,
  passwordProblem,
  resetPasswordSchema,
} from "@/lib/validation/password";
import { companyRegisterSchema } from "@/lib/validation/registration";
import { createStaffSchema, resetStaffPasswordSchema } from "@/lib/validation/staff";

function messageOf(password: string): string | null {
  const result = newPasswordSchema.safeParse(password);
  return result.success ? null : result.error.issues[0].message;
}

describe("словарь распространённых паролей", () => {
  it("загружен целиком: тысячи записей, а не десяток слов", () => {
    expect(commonPasswordCount()).toBeGreaterThanOrEqual(5000);
  });

  it("регистр не важен", () => {
    expect(isCommonPassword("Password1")).toBe(true);
    expect(isCommonPassword("PASSWORD1")).toBe(true);
    expect(isCommonPassword("  iloveyou ")).toBe(true);
  });

  it("обычная фраза в словаре не значится", () => {
    expect(isCommonPassword("lisa-pila-drova-v-lesu")).toBe(false);
  });
});

describe("слабые пароли отклоняются понятным сообщением", () => {
  it("слово из словаря с цифрами и знаками на конце", () => {
    for (const weak of ["Password2026!", "summer2026", "Iloveyou123", "dragon1234567"]) {
      expect(messageOf(weak), weak).toMatch(/распространённ/);
    }
  });

  it("только цифры", () => {
    expect(messageOf("4815162342")).toMatch(/цифр/);
    expect(messageOf("7391846205")).toMatch(/цифр/);
  });

  it("один и тот же символ", () => {
    expect(messageOf("aaaaaaaaaaaa")).toMatch(/однообраз/);
    expect(messageOf("абабабабабаб")).toMatch(/однообраз/);
  });

  it("простые последовательности: цифры, латиница, русская раскладка", () => {
    for (const weak of [
      "12345678901",
      "qwertyuiop",
      "QWERTYUIOPAS",
      "asdfghjklzxc",
      "йцукенгшщз",
      "ЙЦУКЕНГШЩЗХ",
      "абвгдеёжзий",
      "9876543210",
      "abcdefghijkl",
      "zyxwvutsrqp",
    ]) {
      expect(messageOf(weak), weak).toMatch(/последовательност/);
    }
  });

  it("регистр не обходит словарь и последовательности", () => {
    expect(messageOf("QWERTYUIOP")).not.toBeNull();
    expect(messageOf("PaSsWoRd12345")).not.toBeNull();
  });

  it("слишком короткий — про длину, а не про словарь", () => {
    expect(messageOf("qwerty12")).toMatch(/Не короче 10/);
  });
});

describe("пароль и почта", () => {
  it("содержит локальную часть почты", () => {
    expect(passwordProblem("ivan.petrov-2026-x", { email: "ivan.petrov@company.ru" })).toMatch(/почт/);
    expect(passwordProblem("Moya-Pochta-ivanpetrov", { email: "ivan.petrov@company.ru" })).toMatch(/почт/);
  });

  it("содержит часть почты (слово от четырёх букв)", () => {
    expect(passwordProblem("Petrov-moya-krepost-1", { email: "ivan.petrov@company.ru" })).toMatch(/почт/);
  });

  it("регистр не важен", () => {
    expect(passwordProblem("IVAN.PETROV.2026!", { email: "Ivan.Petrov@Company.ru" })).toMatch(/почт/);
  });

  it("почта целиком внутри пароля", () => {
    expect(passwordProblem("ab-ivan.petrov@company.ru-ab", { email: "ivan.petrov@company.ru" })).toMatch(/почт/);
  });

  it("короткие обрывки почты не считаются: «ivan» в чужой фразе — это совпадение", () => {
    expect(passwordProblem("zelenyy-ivan-ne-pridet-1", { email: "iv@company.ru" })).toBeNull();
  });

  it("без почты в контексте проверка почты молчит", () => {
    expect(passwordProblem("ivan.petrov-lisa-pila-1")).toBeNull();
  });

  it("обычная фраза проходит", () => {
    expect(passwordProblem("lisa-pila-drova-v-lesu", { email: "ivan.petrov@company.ru" })).toBeNull();
  });
});

describe("правило подключено ко всем формам, где пароль задаётся", () => {
  const weak = "Qwerty123456";
  const good = "kofe-s-molokom-v-pyatnitsu";

  it("приглашение", () => {
    const base = { fullName: "Иван Петров", passwordConfirm: weak };
    expect(acceptInviteSchema.safeParse({ ...base, password: weak }).success).toBe(false);
    expect(
      acceptInviteSchema.safeParse({ ...base, password: good, passwordConfirm: good }).success,
    ).toBe(true);
  });

  it("смена пароля", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "x",
        newPassword: weak,
        newPasswordConfirm: weak,
      }).success,
    ).toBe(false);
  });

  it("сброс по ссылке", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "t", newPassword: weak, newPasswordConfirm: weak })
        .success,
    ).toBe(false);
  });

  it("регистрация компании: слабый пароль и пароль из почты", () => {
    const form = { email: "boss@acme.ru", phone: "+79991234567", consent: "on" };
    expect(companyRegisterSchema.safeParse({ ...form, password: weak }).success).toBe(false);
    const own = companyRegisterSchema.safeParse({ ...form, password: "Boss-acme-2026-ok" });
    expect(own.success).toBe(false);
    expect(companyRegisterSchema.safeParse({ ...form, password: good }).success).toBe(true);
  });

  it("аккаунт сотрудника и клиента, перевыдача пароля", () => {
    const staff = {
      email: "recruiter@acme.ru",
      fullName: "Рекрутер Один",
      role: "RECRUITER",
      passwordConfirm: weak,
    };
    expect(createStaffSchema.safeParse({ ...staff, password: weak }).success).toBe(false);
    expect(
      createStaffSchema.safeParse({
        ...staff,
        password: "Recruiter-acme-2026",
        passwordConfirm: "Recruiter-acme-2026",
      }).success,
    ).toBe(false);
    expect(
      createClientUserSchema.safeParse({
        email: "hr@acme.ru",
        fullName: "Ирина Клиент",
        role: "CLIENT_HIRING",
        password: weak,
        passwordConfirm: weak,
      }).success,
    ).toBe(false);
    expect(
      resetStaffPasswordSchema.safeParse({ userId: "u", password: weak, passwordConfirm: weak })
        .success,
    ).toBe(false);
    expect(
      resetClientUserPasswordSchema.safeParse({ userId: "u", password: weak, passwordConfirm: weak })
        .success,
    ).toBe(false);
  });
});
