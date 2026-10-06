/**
 * Выбор роли в формах: приглашение коллеги в кабинет клиента, аккаунт
 * пользователя клиента от агентства, аккаунт сотрудника и смена его роли.
 *
 * Та же ловушка, что была в форме отказа: `z.enum()` без своего текста
 * отвечает на негодное значение перечнем допустимых, а действия
 * показывают первое сообщение разбора дословно. Человек в таком случае
 * видит не просьбу выбрать роль, а список внутренних кодов латиницей.
 *
 * Второе, что здесь проверяется, — что роль чужого кабинета не проходит
 * молча и объясняется по делу: сотрудник агентства с клиентской ролью
 * не «частично сотрудник», его фильтры видимости считают чужим.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import { CLIENT_ROLES, STAFF_ROLES } from "@/lib/access";
import { createClientUserSchema, inviteUserSchema } from "@/lib/validation/client";
import { createStaffSchema, updateStaffSchema } from "@/lib/validation/staff";

const EMAIL = "kto-to@example.com";
const PASSWORD = "длинная фраза для входа";

/** Первое сообщение разбора — ровно то, что попадает человеку на экран. */
function firstError(schema: ZodType, data: unknown): string | null {
  const result = schema.safeParse(data);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

/** Аккаунт пользователя клиента: всё заполнено верно, кроме роли. */
function clientAccount(role: unknown) {
  return {
    email: EMAIL,
    fullName: "Ирина Петрова",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    role,
  };
}

/** Аккаунт сотрудника: всё заполнено верно, кроме роли. */
function staffAccount(role: unknown) {
  return { ...clientAccount(role), grants: [] };
}

describe("приглашение коллеги в кабинет клиента", () => {
  it("роль не выбрана — просьба выбрать", () => {
    expect(firstError(inviteUserSchema, { email: EMAIL, role: "" })).toBe(
      "Выберите роль",
    );
    expect(firstError(inviteUserSchema, { email: EMAIL })).toBe("Выберите роль");
  });

  it("агентская роль отклоняется и объясняет почему", () => {
    expect(
      firstError(inviteUserSchema, { email: EMAIL, role: "RECRUITER" }),
    ).toBe("Эта роль не для кабинета клиента — выберите из списка");
  });

  it("каждая клиентская роль проходит разбор", () => {
    // Формы держат свой список ролей, схема — свой: два объявления,
    // которые могут разъехаться молча
    for (const role of CLIENT_ROLES) {
      const result = inviteUserSchema.safeParse({ email: EMAIL, role });
      expect(result.success, `${role}: не прошла разбор`).toBe(true);
    }
  });
});

describe("аккаунт пользователя клиента от агентства", () => {
  it("отвечает теми же словами — роли там те же", () => {
    expect(firstError(createClientUserSchema, clientAccount(""))).toBe(
      "Выберите роль",
    );
    expect(firstError(createClientUserSchema, clientAccount("OWNER"))).toBe(
      "Эта роль не для кабинета клиента — выберите из списка",
    );
  });

  it("каждая клиентская роль проходит разбор", () => {
    for (const role of CLIENT_ROLES) {
      const result = createClientUserSchema.safeParse(clientAccount(role));
      expect(result.success, `${role}: не прошла разбор`).toBe(true);
    }
  });
});

describe("аккаунт сотрудника агентства", () => {
  it("роль не выбрана — просьба выбрать", () => {
    expect(firstError(createStaffSchema, staffAccount(""))).toBe("Выберите роль");
    expect(firstError(createStaffSchema, staffAccount(undefined))).toBe(
      "Выберите роль",
    );
  });

  it("клиентская роль отклоняется и объясняет почему", () => {
    expect(firstError(createStaffSchema, staffAccount("CLIENT_ADMIN"))).toBe(
      "Эта роль не для сотрудников агентства — выберите из списка",
    );
  });

  it("роль владельца не выдаётся — и это сказано, а не «не для агентства»", () => {
    // Владелец — роль агентства, фраза «не для сотрудников агентства»
    // тут была бы неправдой
    expect(firstError(createStaffSchema, staffAccount("OWNER"))).toBe(
      "Роль владельца не выдаётся — выберите из списка",
    );
  });

  it("каждая роль из списка проходит разбор", () => {
    for (const role of STAFF_ROLES) {
      const result = createStaffSchema.safeParse(staffAccount(role));
      expect(result.success, `${role}: не прошла разбор`).toBe(true);
    }
  });

  it("смена роли отвечает теми же словами — список ролей там тот же", () => {
    expect(firstError(updateStaffSchema, { userId: "usr_1", role: "" })).toBe(
      "Выберите роль",
    );
    expect(
      firstError(updateStaffSchema, { userId: "usr_1", role: "CLIENT_VIEWER" }),
    ).toBe("Эта роль не для сотрудников агентства — выберите из списка");
  });
});

describe("наружу не выходят внутренние коды", () => {
  const плохиеРоли = ["", "ЧТО-ТО", "client_admin", "SUPERUSER", "OWNER"];

  it("ни в одной из четырёх форм", () => {
    for (const role of плохиеРоли) {
      for (const message of [
        firstError(inviteUserSchema, { email: EMAIL, role }),
        firstError(createClientUserSchema, clientAccount(role)),
        firstError(createStaffSchema, staffAccount(role)),
        firstError(updateStaffSchema, { userId: "usr_1", role }),
      ]) {
        expect(message).toBeTruthy();
        expect(message).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
        expect(message).not.toMatch(/Invalid option/);
      }
    }
  });

  it("проверка адреса осталась прежней", () => {
    expect(
      firstError(createStaffSchema, { ...staffAccount("RECRUITER"), email: "не-почта" }),
    ).toBe("Проверьте адрес почты");
  });
});
