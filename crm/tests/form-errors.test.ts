/**
 * Ответ действия на непройденную проверку: ошибки по полям, а не одна строка.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CHECK_FIELDS_MESSAGE } from "@/lib/form-state";
import { fieldErrorsOf, invalidForm } from "@/lib/validation/form-errors";
import { createStaffSchema } from "@/lib/validation/staff";
import { createClientUserSchema, inviteUserSchema } from "@/lib/validation/client";
import { changePasswordSchema } from "@/lib/validation/password";
import { profileSchema } from "@/lib/validation/auth";

const schema = z
  .object({
    email: z.email("Проверьте адрес почты"),
    name: z.string().min(2, "Укажите имя"),
    tags: z.array(z.string().min(1, "Пустая метка")),
    password: z.string(),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Пароли не совпадают", path: ["confirm"] });

describe("fieldErrorsOf / invalidForm", () => {
  it("каждое неверное поле получает свой текст, по имени поля", () => {
    const parsed = schema.safeParse({ email: "x", name: "", tags: [], password: "a", confirm: "b" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const { fields } = fieldErrorsOf(parsed.error);
    expect(fields).toMatchObject({ email: "Проверьте адрес почты", name: "Укажите имя" });
  });

  it("если по полю несколько замечаний, берётся первое", () => {
    const strict = z.object({ pw: z.string().min(10, "Не короче 10 символов").regex(/\d/, "Нужна цифра") });
    const parsed = strict.safeParse({ pw: "abc" });
    if (parsed.success) throw new Error("ожидалась ошибка");
    expect(fieldErrorsOf(parsed.error).fields.pw).toBe("Не короче 10 символов");
  });

  it("вложенный путь относится к полю верхнего уровня (grants.1 → grants)", () => {
    const parsed = schema.safeParse({ email: "a@b.ru", name: "Ян", tags: ["ok", ""], password: "a", confirm: "a" });
    if (parsed.success) throw new Error("ожидалась ошибка");
    expect(fieldErrorsOf(parsed.error).fields.tags).toBe("Пустая метка");
  });

  it("invalidForm: ошибки полей + краткая сводка", () => {
    const parsed = schema.safeParse({ email: "x", name: "", tags: [], password: "a", confirm: "b" });
    if (parsed.success) throw new Error("ожидалась ошибка");
    const state = invalidForm(parsed.error);
    expect(state.error).toBe(CHECK_FIELDS_MESSAGE);
    expect(Object.keys(state.fields ?? {})).toEqual(expect.arrayContaining(["email", "name"]));
  });

  it("проверка без поля (path: []) идёт общим сообщением, без fields", () => {
    const whole = z.object({ a: z.string() }).refine(() => false, { message: "Общая беда формы" });
    const parsed = whole.safeParse({ a: "x" });
    if (parsed.success) throw new Error("ожидалась ошибка");
    expect(invalidForm(parsed.error)).toEqual({ error: "Общая беда формы" });
  });
});

describe("схемы форм отдают ошибки по именам полей формы", () => {
  const names = (result: { success: boolean; error?: z.ZodError }) =>
    result.success || !result.error ? [] : Object.keys(fieldErrorsOf(result.error).fields);

  it("создание сотрудника: почта, имя, пароль, подтверждение, роль", () => {
    const result = createStaffSchema.safeParse({
      email: "не-почта",
      fullName: "",
      password: "короткий",
      passwordConfirm: "другой",
      role: "",
    });
    expect(names(result)).toEqual(expect.arrayContaining(["email", "fullName", "password", "role"]));
  });

  it("пароли не совпадают — ошибка у поля «ещё раз»", () => {
    const result = createClientUserSchema.safeParse({
      email: "hr@client.ru",
      fullName: "Иван Петров",
      password: "длинная-фраза-для-пароля-77",
      passwordConfirm: "другая-фраза",
      role: "CLIENT_ADMIN",
    });
    if (result.success) throw new Error("ожидалась ошибка");
    expect(fieldErrorsOf(result.error).fields.passwordConfirm).toBe("Пароли не совпадают");
  });

  it("приглашение клиента: почта и роль", () => {
    const result = inviteUserSchema.safeParse({ email: "x", role: "" });
    expect(names(result)).toEqual(expect.arrayContaining(["email", "role"]));
  });

  it("смена пароля: текущий, новый, повтор", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "", newPassword: "x", newPasswordConfirm: "y" });
    expect(names(result)).toEqual(expect.arrayContaining(["currentPassword", "newPassword"]));
  });

  it("профиль: имя", () => {
    const result = profileSchema.safeParse({ fullName: "", phone: "", position: "" });
    expect(names(result)).toContain("fullName");
  });
});
