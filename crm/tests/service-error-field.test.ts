/**
 * Отказ сервиса относится к полю, только если сервис сам его пометил (замечание проверки PR #120, 12.10.2026).
 *
 * Действия привязывали отказ к полю почты по классу ошибки: любой `StaffError`, `InviteError`, `ClientUserError` из
 * `createStaffAccount`/`inviteStaff`/`createInvitation` оказывался под полем почты, а правило проекта (AGENTS.md) требует
 * пометки, как у `PasswordError.field` и `EmailConfirmError.field`. Сегодня бросается только «адрес занят», но новый
 * отказ того же класса («Сотрудник не найден», «Ссылка недействительна») лёг бы под почту молча.
 */
import { afterAll, describe, expect, it } from "vitest";

import { serviceFailure } from "@/lib/form-state";
import { prismaRaw as db } from "@/lib/db/prisma";
import type { Actor } from "@/lib/access";
import { createClientUserAccount, ClientUserError } from "@/lib/services/clients";
import { createInvitation, InviteError, acceptInvitation } from "@/lib/services/invitations";
import { createStaffAccount, setStaffActive, StaffError } from "@/lib/services/staff";

const ORG = "org_fattakhov";
const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const MARK = "test-field-marker";

afterAll(async () => {
  await db.invitation.deleteMany({ where: { email: { startsWith: MARK } } });
  await db.$disconnect();
});

async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("ожидали отказ, а действие прошло");
}

describe("serviceFailure", () => {
  it("с пометкой — под полем, без неё — общей строкой", () => {
    expect(serviceFailure({ message: "Адрес занят", field: "email" })).toEqual({ fields: { email: "Адрес занят" } });
    expect(serviceFailure({ message: "Сотрудник не найден" })).toEqual({ error: "Сотрудник не найден" });
  });
});

describe("сервисы помечают отказ про почту", () => {
  it("StaffError: адрес занят — email", async () => {
    const error = await caught(() =>
      createStaffAccount(owner, {
        email: "owner@fattakhov.hr",
        fullName: "Дубль Владельца",
        password: "Test12345!",
        role: "RECRUITER",
        grants: [],
      }),
    );
    expect(error).toBeInstanceOf(StaffError);
    expect((error as StaffError).field).toBe("email");
  });

  it("StaffError: прочие отказы без пометки — не окажутся под полем почты", async () => {
    const error = await caught(() => setStaffActive(owner, "usr_нет_такого", false));
    expect(error).toBeInstanceOf(StaffError);
    expect((error as StaffError).field).toBeUndefined();
    expect(serviceFailure(error as StaffError)).toEqual({ error: "Сотрудник не найден" });
  });

  it("InviteError: адрес занят — email", async () => {
    const error = await caught(() =>
      createInvitation({
        organizationId: ORG,
        email: "owner@fattakhov.hr",
        role: "CLIENT_ADMIN",
        clientId: "cli_starfish",
        createdById: "usr_owner",
      }),
    );
    expect(error).toBeInstanceOf(InviteError);
    expect((error as InviteError).field).toBe("email");
  });

  it("InviteError: недействительная ссылка — без пометки", async () => {
    const error = await caught(() => acceptInvitation({ token: "нет-такой-ссылки", fullName: "Иван Иванов", password: "Test12345!" }));
    expect(error).toBeInstanceOf(InviteError);
    expect((error as InviteError).field).toBeUndefined();
  });

  it("ClientUserError: адрес занят — email", async () => {
    const client = await db.client.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const error = await caught(() =>
      createClientUserAccount({
        organizationId: ORG,
        clientId: client.id,
        email: "hrd@starfish.ru",
        fullName: "Дубль Клиента",
        password: "Test12345!",
        role: "CLIENT_ADMIN",
      }),
    );
    expect(error).toBeInstanceOf(ClientUserError);
    expect((error as ClientUserError).field).toBe("email");
  });
});
