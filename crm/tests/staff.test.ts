/**
 * Команда агентства на реальной базе: создание аккаунта сразу переносит
 * должность, доступы и пароль в учётку, доверенный сотрудник не раздаёт
 * и не снимает то, чего нет у него самого.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AccessDeniedError, type Actor } from "@/lib/access";
import { verifyPassword } from "@/lib/auth/password";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  createStaffAccount,
  listStaff,
  resetStaffPassword,
  setStaffActive,
  updateStaff,
} from "@/lib/services/staff";

const ORG = "org_fattakhov";
const MARK = "test-staff";
const email = (suffix: string) => `${MARK}+${suffix}@example.com`;

const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const head = (grants: string[] = []): Actor => ({
  id: "usr_head",
  organizationId: ORG,
  role: "HEAD",
  clientId: null,
  grants,
});

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
  await db.user.update({
    where: { id: "usr_rec1" },
    data: { grants: [], isActive: true, role: "RECRUITER", position: "Ведущий рекрутер" },
  });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("создание аккаунта сотрудника", () => {
  it("должность, доступы и пароль сразу в учётной записи", async () => {
    const address = email("admin");
    const { id } = await createStaffAccount(owner, {
      email: address,
      fullName: "Проверочный Сотрудник",
      password: "Test12345!",
      role: "RECRUITER",
      position: "Администратор",
      grants: ["staff.manage", "students.study"],
    });

    const user = await db.user.findFirst({ where: { id } });
    expect(user?.email).toBe(address);
    expect(user?.role).toBe("RECRUITER");
    expect(user?.position).toBe("Администратор");
    expect(user?.grants.sort()).toEqual(["staff.manage", "students.study"]);
    expect(user?.isActive).toBe(true);
    expect(await verifyPassword(user!.passwordHash!, "Test12345!")).toBe(true);
  });

  it("без права управления создать аккаунт нельзя", async () => {
    await expect(
      createStaffAccount(head(), {
        email: email("nope"),
        fullName: "Некто",
        password: "Test12345!",
        role: "RECRUITER",
        grants: [],
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("доверенный не выдаёт доступ, которого нет у него самого", async () => {
    await expect(
      createStaffAccount(head(["staff.manage"]), {
        email: email("escalate"),
        fullName: "Некто",
        password: "Test12345!",
        role: "RECRUITER",
        grants: ["students.moderation"],
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("занятая почта — понятная ошибка, а не второй пользователь", async () => {
    const address = email("dup");
    await createStaffAccount(owner, {
      email: address,
      fullName: "Первый",
      password: "Test12345!",
      role: "RECRUITER",
      grants: [],
    });

    await expect(
      createStaffAccount(owner, {
        email: address,
        fullName: "Второй",
        password: "Test12345!",
        role: "RECRUITER",
        grants: [],
      }),
    ).rejects.toThrow(/уже занят/);
  });
});

describe("перевыдача пароля", () => {
  it("владелец задаёт сотруднику новый пароль", async () => {
    await resetStaffPassword(owner, "usr_rec1", "NewPass12345!");
    const user = await db.user.findFirst({ where: { id: "usr_rec1" } });
    expect(await verifyPassword(user!.passwordHash!, "NewPass12345!")).toBe(true);
    expect(user?.passwordChangedAt).not.toBeNull();
  });

  it("себя и владельца не перевыдать через это действие", async () => {
    await expect(resetStaffPassword(owner, "usr_owner", "NewPass12345!")).rejects.toThrow(
      AccessDeniedError,
    );
  });
});

describe("изменение сотрудника", () => {
  it("доверенный не снимает доступы, которых сам не видит", async () => {
    await db.user.update({ where: { id: "usr_rec1" }, data: { grants: ["students.pilot"] } });

    await updateStaff(head(["staff.manage", "students.study"]), {
      userId: "usr_rec1",
      role: "RECRUITER",
      position: "Рекрутер студенческих вакансий",
      grants: ["students.study"],
    });

    const user = await db.user.findFirst({ where: { id: "usr_rec1" } });
    expect(user?.grants.sort()).toEqual(["students.pilot", "students.study"]);
    expect(user?.position).toBe("Рекрутер студенческих вакансий");
  });

  it("владельца и себя изменить нельзя", async () => {
    await expect(
      updateStaff(owner, { userId: "usr_owner", role: "HEAD", grants: [] }),
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      updateStaff(head(["staff.manage"]), { userId: "usr_head", role: "HEAD", grants: ["staff.manage"] }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("отключённый сотрудник виден в списке как отключённый", async () => {
    await setStaffActive(owner, "usr_rec1", false);
    const { members } = await listStaff(owner);
    const rec1 = members.find((m) => m.id === "usr_rec1");
    expect(rec1?.isActive).toBe(false);
    expect(rec1?.manageable).toBe(true);
    expect(members.find((m) => m.id === "usr_owner")?.manageable).toBe(false);
  });
});
