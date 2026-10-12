/**
 * Ответ студента в переписке с агентством: платформа шлёт событие `agency-message`,
 * CRM находит кандидата по идентификатору студента и уведомляет тех, кто с ним
 * работает, ссылкой на его карточку.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";

const ORG = "org_fattakhov";
const SECRET = "test-service-secret-0123456789abcdef0123456789";
const STUDENT = "test_agwh_student";
const CANDIDATE = "test_agwh_candidate";

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
  await db.notification.deleteMany({ where: { eventCode: "STUDENTS_AGENCY_REPLY", linkUrl: `/a/candidates/${CANDIDATE}` } });
  await db.candidate.deleteMany({ where: { id: CANDIDATE } });
}

beforeAll(async () => {
  previousSecret = process.env.CRM_SERVICE_SECRET;
  process.env.CRM_SERVICE_SECRET = SECRET;
  ({ POST } = await import("@/app/api/webhooks/students-event/route"));
});

beforeEach(async () => {
  await cleanup();
  await db.candidate.create({
    data: {
      id: CANDIDATE,
      organizationId: ORG,
      fullName: "test_agwh Эльвира Гараева",
      source: "STUDENT_PLATFORM",
      studentPlatformId: STUDENT,
      createdById: "usr_rec1",
    },
  });
});

afterAll(async () => {
  await cleanup();
  if (previousSecret === undefined) delete process.env.CRM_SERVICE_SECRET;
  else process.env.CRM_SERVICE_SECRET = previousSecret;
  await db.$disconnect();
});

describe("ответ студента агентству", () => {
  it("без служебного секрета — 401", async () => {
    const response = await call({ kind: "agency-message", title: "x", studentId: STUDENT }, null);
    expect(response.status).toBe(401);
  });

  it("уведомление получает тот, кто завёл кандидата, со ссылкой на карточку", async () => {
    const response = await call({
      kind: "agency-message",
      title: "Студент ответил в переписке",
      groupKey: `agency-message:${STUDENT}`,
      studentId: STUDENT,
    });
    expect(response.status).toBe(201);

    const rows = await db.notification.findMany({
      where: { eventCode: "STUDENTS_AGENCY_REPLY", linkUrl: `/a/candidates/${CANDIDATE}` },
      select: { userId: true, title: true },
    });
    expect(rows.map((r) => r.userId)).toEqual(["usr_rec1"]);
    expect(rows[0].title).toContain("Эльвира Гараева");
  });

  it("студент, которого нет среди кандидатов, — без уведомлений и без ошибки", async () => {
    const response = await call({ kind: "agency-message", title: "x", studentId: "test_agwh_unknown" });
    expect(response.status).toBe(200);
    expect(await db.notification.count({ where: { eventCode: "STUDENTS_AGENCY_REPLY", linkUrl: `/a/candidates/${CANDIDATE}` } })).toBe(0);
  });

  it("без студента или с чужим форматом идентификатора — 400", async () => {
    expect((await call({ kind: "agency-message", title: "x" })).status).toBe(400);
    expect((await call({ kind: "agency-message", title: "x", studentId: "../../x" })).status).toBe(400);
  });
});
