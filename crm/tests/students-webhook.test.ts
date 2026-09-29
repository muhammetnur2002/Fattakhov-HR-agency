/**
 * События клиента со студенческой платформы: новый отклик, сообщение, решение по вакансии.
 *
 * Обработчик /api/webhooks/students-event — единственное место, где отклик студента
 * превращается в уведомление у сотрудников клиента. Раньше это проверялось только по коду.
 * Здесь: чужой запрос без секрета отвергается, а уведомление получают администратор и
 * нанимающий менеджер именно этого клиента — не наблюдатель и не сотрудник другой компании.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";

const ORG = "org_fattakhov";
const SECRET = "test-service-secret-0123456789abcdef0123456789";
const CLIENT = "test_hook_client";
const OTHER = "test_hook_other";
const U_ADMIN = "test_hook_admin";
const U_HIRING = "test_hook_hiring";
const U_VIEWER = "test_hook_viewer";
const U_OTHER = "test_hook_other_admin";
const USERS = [U_ADMIN, U_HIRING, U_VIEWER, U_OTHER];

let POST: (request: NextRequest) => Promise<Response>;
let previousSecret: string | undefined;

function call(body: unknown, token: string | null = SECRET) {
  return POST(
    new NextRequest("http://localhost/api/webhooks/students-event", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

async function cleanup() {
  await db.notification.deleteMany({ where: { userId: { in: USERS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
  await db.client.deleteMany({ where: { id: { in: [CLIENT, OTHER] } } });
}

beforeAll(async () => {
  previousSecret = process.env.CRM_SERVICE_SECRET;
  process.env.CRM_SERVICE_SECRET = SECRET;
  ({ POST } = await import("@/app/api/webhooks/students-event/route"));
});

beforeEach(async () => {
  await cleanup();
  await db.client.createMany({
    data: [
      { id: CLIENT, organizationId: ORG, name: "test_hook клиент", status: "ACTIVE" },
      { id: OTHER, organizationId: ORG, name: "test_hook чужой", status: "ACTIVE" },
    ],
  });
  const user = (id: string, role: "CLIENT_ADMIN" | "CLIENT_HIRING" | "CLIENT_VIEWER", clientId: string) => ({
    id,
    organizationId: ORG,
    email: `${id}@test-hook.example`,
    fullName: `Тест ${id}`,
    role,
    clientId,
  });
  await db.user.createMany({
    data: [
      user(U_ADMIN, "CLIENT_ADMIN", CLIENT),
      user(U_HIRING, "CLIENT_HIRING", CLIENT),
      user(U_VIEWER, "CLIENT_VIEWER", CLIENT),
      user(U_OTHER, "CLIENT_ADMIN", OTHER),
    ],
  });
});

afterAll(async () => {
  await cleanup();
  if (previousSecret === undefined) delete process.env.CRM_SERVICE_SECRET;
  else process.env.CRM_SERVICE_SECRET = previousSecret;
  await db.$disconnect();
});

async function who(eventCode: string): Promise<string[]> {
  const rows = await db.notification.findMany({ where: { userId: { in: USERS }, eventCode }, select: { userId: true } });
  return rows.map((r) => r.userId).sort();
}

describe("событие клиента со студенческой платформы", () => {
  it("без служебного секрета — 401, уведомлений нет", async () => {
    const response = await call({ kind: "application", title: "Новый отклик", crmClientId: CLIENT }, null);
    expect(response.status).toBe(401);
    expect(await who("STUDENTS_APPLICATION_NEW")).toEqual([]);
  });

  it("новый отклик получают администратор и нанимающий менеджер своей компании", async () => {
    const response = await call({
      kind: "application",
      title: "Новый отклик студента",
      body: "Бариста",
      groupKey: "application:v1",
      crmClientId: CLIENT,
    });
    expect(response.status).toBe(201);
    expect(await who("STUDENTS_APPLICATION_NEW")).toEqual([U_ADMIN, U_HIRING].sort());
  });

  it("наблюдатель и сотрудники чужой компании ничего не получают", async () => {
    await call({ kind: "message", title: "Новое сообщение от студента", crmClientId: CLIENT });
    const got = await who("STUDENTS_MESSAGE_NEW");
    expect(got).not.toContain(U_VIEWER);
    expect(got).not.toContain(U_OTHER);
    expect(got).toEqual([U_ADMIN, U_HIRING].sort());
  });

  it("решение по вакансии уходит сотрудникам клиента", async () => {
    const response = await call({
      kind: "vacancy-decision",
      title: "Вакансия опубликована",
      body: "Бариста",
      groupKey: "vacancy-decision:v1",
      crmClientId: CLIENT,
    });
    expect(response.status).toBe(201);
    expect(await who("STUDENTS_VACANCY_DECISION")).toEqual([U_ADMIN, U_HIRING].sort());
  });

  it("без клиента или с неизвестным видом события — 400", async () => {
    expect((await call({ kind: "application", title: "Новый отклик" })).status).toBe(400);
    expect((await call({ kind: "something-else", title: "x", crmClientId: CLIENT })).status).toBe(400);
  });

  it("уведомление ведёт в нужный раздел", async () => {
    await call({ kind: "application", title: "Новый отклик студента", crmClientId: CLIENT });
    const row = await db.notification.findFirst({
      where: { userId: U_ADMIN, eventCode: "STUDENTS_APPLICATION_NEW" },
      select: { linkUrl: true },
    });
    expect(row?.linkUrl).toBe("/students/applications");
  });
});
