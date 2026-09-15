/**
 * Команда агентства и вход в студенческую платформу — права.
 *
 * Отдельно от матрицы ТЗ 3.2 (access.test.ts): здесь доступы, которые
 * выдаёт владелец, а не роль. Главное — чтобы доверенное право нельзя было
 * превратить в большее, чем выдал владелец.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canAssignStaff,
  canDo,
  canManageStaffMember,
  effectiveGrants,
  STAFF_GRANTS,
  type Actor,
} from "@/lib/access";
import type { UserRole } from "@/lib/generated/prisma/enums";
import {
  issueClientTicket,
  issueStudentsTicket,
  STUDENTS_TICKET_TTL_SECONDS,
  studentsPermissions,
} from "@/lib/students-sso";

function actor(role: UserRole, grants: string[] = [], id = `usr_${role.toLowerCase()}`): Actor {
  return {
    id,
    organizationId: "org_1",
    role,
    clientId: role.startsWith("CLIENT_") ? "client_a" : null,
    grants,
  };
}

describe("команда агентства", () => {
  it("по умолчанию командой и студенческой платформой распоряжается только владелец", () => {
    for (const role of ["HEAD", "RECRUITER", "ACCOUNT", "CLIENT_ADMIN"] as UserRole[]) {
      expect(canDo(actor(role), "staff.manage"), role).toBe(false);
      expect(canDo(actor(role), "students.enter"), role).toBe(false);
    }
    expect(canDo(actor("OWNER"), "staff.manage")).toBe(true);
    expect(canDo(actor("OWNER"), "students.enter")).toBe(true);
  });

  it("выданный доступ открывает право сотруднику агентства", () => {
    expect(canDo(actor("RECRUITER", ["staff.manage"]), "staff.manage")).toBe(true);
    expect(canDo(actor("ACCOUNT", ["students.study"]), "students.enter")).toBe(true);
    expect(canDo(actor("HEAD", ["staff.manage"]), "students.enter")).toBe(false);
  });

  it("клиентской роли доступы не действуют, даже если записаны", () => {
    const client = actor("CLIENT_ADMIN", [...STAFF_GRANTS]);
    expect(canDo(client, "staff.manage")).toBe(false);
    expect(canDo(client, "students.enter")).toBe(false);
    expect(effectiveGrants(client)).toEqual([]);
  });

  it("у владельца все доступы, у сотрудника — только выданные и известные", () => {
    expect(effectiveGrants(actor("OWNER"))).toEqual([...STAFF_GRANTS]);
    expect(effectiveGrants(actor("HEAD", ["students.pilot", "что-то старое"]))).toEqual(["students.pilot"]);
  });

  it("владельца не меняет никто, себя — тоже", () => {
    const owner = actor("OWNER");
    expect(canManageStaffMember(owner, { id: "usr_other_owner", role: "OWNER" })).toBe(false);
    expect(canManageStaffMember(owner, { id: owner.id, role: "OWNER" })).toBe(false);
    expect(canManageStaffMember(owner, { id: "usr_head_2", role: "HEAD" })).toBe(true);

    const head = actor("HEAD", ["staff.manage"]);
    expect(canManageStaffMember(head, { id: head.id, role: "HEAD" })).toBe(false);
  });

  it("доверенный управляет своей ролью и младшими, но не старшими", () => {
    const head = actor("HEAD", ["staff.manage"]);
    expect(canManageStaffMember(head, { id: "a", role: "RECRUITER" })).toBe(true);
    expect(canManageStaffMember(head, { id: "b", role: "ACCOUNT" })).toBe(true);
    expect(canManageStaffMember(head, { id: "c", role: "HEAD" })).toBe(true);

    const recruiter = actor("RECRUITER", ["staff.manage"]);
    expect(canManageStaffMember(recruiter, { id: "d", role: "RECRUITER" })).toBe(true);
    expect(canManageStaffMember(recruiter, { id: "e", role: "HEAD" })).toBe(false);
    expect(canManageStaffMember(recruiter, { id: "f", role: "ACCOUNT" })).toBe(false);
  });

  it("раздать можно только свои доступы", () => {
    const head = actor("HEAD", ["staff.manage", "students.study"]);
    expect(canAssignStaff(head, { role: "RECRUITER" }, ["students.study"])).toBe(true);
    expect(canAssignStaff(head, { role: "RECRUITER" }, ["students.moderation"])).toBe(false);
    expect(canAssignStaff(actor("OWNER"), { role: "HEAD" }, [...STAFF_GRANTS])).toBe(true);
  });

  it("без права управления назначать нельзя вовсе", () => {
    expect(canAssignStaff(actor("HEAD"), { role: "RECRUITER" }, [])).toBe(false);
  });

  it("на студенческую платформу от имени компании входят администратор и нанимающий менеджер клиента, но не смотрящий", () => {
    expect(canDo(actor("CLIENT_ADMIN"), "students.enterAsClient")).toBe(true);
    expect(canDo(actor("CLIENT_HIRING"), "students.enterAsClient")).toBe(true);
    expect(canDo(actor("CLIENT_VIEWER"), "students.enterAsClient")).toBe(false);
    expect(canDo(actor("HEAD", ["staff.manage"]), "students.enterAsClient")).toBe(false);
  });
});

describe("билет входа в студенческую платформу", () => {
  const secret = "s".repeat(40);

  it("разделы CRM переводятся в разделы студенческой платформы", () => {
    expect(studentsPermissions(["staff.manage", "students.study", "students.pilot"])).toEqual([
      "students",
      "pilot",
    ]);
    expect(studentsPermissions(["staff.manage"])).toEqual([]);
  });

  it("подпись сходится с тем же секретом и не сходится с другим", () => {
    const ticket = issueStudentsTicket(
      { userId: "usr_1", email: "a@b.ru", name: "Анна", position: "Администратор", permissions: ["moderation"] },
      secret,
    );
    const [body, signature] = ticket.split(".");
    expect(createHmac("sha256", secret).update(body).digest("base64url")).toBe(signature);
    expect(createHmac("sha256", "x".repeat(40)).update(body).digest("base64url")).not.toBe(signature);
  });

  it("билет адресован студенческой платформе и живёт минуту", () => {
    const now = Date.UTC(2026, 8, 15, 12, 0, 0);
    const ticket = issueStudentsTicket(
      { userId: "usr_1", email: "a@b.ru", name: "Анна", position: null, permissions: ["students"] },
      secret,
      now,
    );
    const payload = JSON.parse(Buffer.from(ticket.split(".")[0], "base64url").toString("utf8"));
    expect(payload.aud).toBe("fattakhov-students");
    expect(payload.iss).toBe("fattakhov-crm");
    expect(payload.exp - payload.iat).toBe(STUDENTS_TICKET_TTL_SECONDS);
    expect(payload.jti.length).toBeGreaterThanOrEqual(16);
    expect(payload.kind).toBe("staff");
  });

  it("билет клиента несёт crmClientId, а не список разделов", () => {
    const ticket = issueClientTicket(
      {
        userId: "usr_client_1",
        crmClientId: "client_a",
        companyName: "Кофейни «Север»",
        contactName: "Анна",
        contactEmail: "anna@sever.ru",
      },
      secret,
    );
    const [body, signature] = ticket.split(".");
    expect(createHmac("sha256", secret).update(body).digest("base64url")).toBe(signature);

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    expect(payload.kind).toBe("client");
    expect(payload.crmClientId).toBe("client_a");
    expect(payload.companyName).toBe("Кофейни «Север»");
    expect(payload.permissions).toBeUndefined();
  });
});
