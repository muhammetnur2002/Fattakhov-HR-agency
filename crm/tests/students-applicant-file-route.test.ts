/**
 * Фото и резюме откликнувшегося студента, которые клиент открывает в CRM,
 * тоже читаются через сервер CRM — и тоже пишутся в журнал доступа к ПДн.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  actor: { id: "usr_client", organizationId: "org_fattakhov", role: "CLIENT_ADMIN", clientId: "cl_1" } as unknown,
}));
const upstream = vi.hoisted(() => ({ ok: true }));
const audit = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("@/lib/auth/session", () => ({
  requireClientActor: async () => session.actor,
  authorize: () => {},
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findFirst: async () => ({ fullName: "Клиент" }) } },
}));
vi.mock("@/lib/students-service", () => ({
  fetchApplicantFile: async () =>
    upstream.ok ? new Response("file", { headers: { "content-type": "image/jpeg" } }) : new Response("нет", { status: 404 }),
}));
vi.mock("@/lib/services/student-file-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/student-file-audit")>()),
  recordStudentFileRead: (...args: unknown[]) => {
    audit.calls.push(args);
    return Promise.resolve();
  },
}));

async function call(query: string) {
  const { GET } = await import("@/app/api/students-applicant-file/route");
  return GET(new NextRequest(`http://localhost/api/students-applicant-file?${query}`));
}

beforeEach(() => {
  upstream.ok = true;
  audit.calls.length = 0;
});

describe("файлы откликнувшихся студентов и журнал", () => {
  it("фото и резюме пишутся в журнал с id отклика", async () => {
    expect((await call("applicationId=app_1&kind=photo")).status).toBe(200);
    expect((await call("applicationId=app_1&kind=resume")).status).toBe(200);
    expect(audit.calls.map(([, input]) => input)).toEqual([
      { kind: "applicant_photo", objectId: "app_1" },
      { kind: "applicant_resume", objectId: "app_1" },
    ]);
  });

  it("неверный запрос и ненайденный файл в журнал не идут", async () => {
    expect((await call("applicationId=app_1&kind=passport")).status).toBe(400);
    upstream.ok = false;
    expect((await call("applicationId=app_1&kind=photo")).status).toBe(404);
    expect(audit.calls).toEqual([]);
  });
});
