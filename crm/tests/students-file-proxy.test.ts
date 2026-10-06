/**
 * Прокси файлов студенческой платформы для проверяющих: со служебным секретом на сервере
 * он отдаёт ровно один файл. Свободный путь позволил бы дойти до любого маршрута платформы.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  actor: { id: "usr_owner", organizationId: "org_fattakhov", role: "OWNER", clientId: null } as unknown,
}));
const proxied = vi.hoisted(() => ({ paths: [] as string[], upstreamOk: true }));
const audit = vi.hoisted(() => ({ calls: [] as unknown[][], fail: false }));

// Журнал чтения подменён: здесь проверяется, КОГДА маршрут его вызывает; сама запись — в student-file-audit.test.ts
vi.mock("@/lib/services/student-file-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/student-file-audit")>()),
  recordStudentFileRead: (...args: unknown[]) => {
    audit.calls.push(args);
    return audit.fail ? Promise.reject(new Error("журнал недоступен")) : Promise.resolve();
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireActor: async () => session.actor }));
vi.mock("@/lib/students-service", () => ({
  fetchStudentsFile: async (path: string) => {
    proxied.paths.push(path);
    return proxied.upstreamOk
      ? new Response("file", { headers: { "content-type": "image/png" } })
      : new Response("нет", { status: 404 });
  },
}));

const ID = "123e4567-e89b-12d3-a456-426614174000";

async function call(path: string) {
  const { GET } = await import("@/app/api/students-file/route");
  return GET(new NextRequest(`http://localhost/api/students-file?path=${encodeURIComponent(path)}`));
}

beforeEach(() => {
  proxied.paths.length = 0;
  proxied.upstreamOk = true;
  audit.calls.length = 0;
  audit.fail = false;
  session.actor = { id: "usr_owner", organizationId: "org_fattakhov", role: "OWNER", clientId: null };
});

describe("прокси файлов для проверяющих", () => {
  it("отдаёт файл по точному пути", async () => {
    expect((await call(`/api/files/study/${ID}.pdf`)).status).toBe(200);
    expect((await call(`/api/files/photo/${ID}.jpg`)).status).toBe(200);
    expect(proxied.paths).toEqual([`/api/files/study/${ID}.pdf`, `/api/files/photo/${ID}.jpg`]);
  });

  it("выйти на другие маршруты служебным секретом нельзя", async () => {
    for (const path of [
      "/api/files/../service/companies",
      "/api/files/%2e%2e/service/crm-links",
      "/api/files/x/../../service/pilot",
      `/api/files/study/${ID}.pdf?x=1`,
      `/api/files/resume/${ID}.pdf`,
      "/api/service/companies",
    ]) {
      expect((await call(path)).status).toBe(400);
    }
    expect(proxied.paths).toEqual([]);
  });

  it("чтение справки и фото студента пишется в журнал: кто, какой вид файла, какой файл", async () => {
    await call(`/api/files/study/${ID}.pdf`);
    await call(`/api/files/photo/${ID}.jpg`);
    expect(audit.calls.map(([actor, input]) => [(actor as { id: string }).id, input])).toEqual([
      ["usr_owner", { kind: "study", objectId: ID }],
      ["usr_owner", { kind: "photo", objectId: ID }],
    ]);
    // Запрос передаётся для адреса, откуда открыли
    expect(audit.calls[0][2]).toBeInstanceOf(Headers);
  });

  it("картинка компании — не персональные данные, в журнал не идёт", async () => {
    expect((await call(`/api/files/company/${ID}.png`)).status).toBe(200);
    expect(audit.calls).toEqual([]);
  });

  it("отказ и ненайденный файл в журнал не попадают: ничего не прочитано", async () => {
    await call(`/api/files/study/${ID}.pdf?x=1`);
    proxied.upstreamOk = false;
    expect((await call(`/api/files/study/${ID}.pdf`)).status).toBe(404);
    session.actor = { id: "usr_viewer", organizationId: "org_fattakhov", role: "CLIENT_VIEWER", clientId: "cl_1" };
    proxied.upstreamOk = true;
    expect((await call(`/api/files/study/${ID}.pdf`)).status).toBe(403);
    expect(audit.calls).toEqual([]);
  });

  it("сбой журнала не ломает выдачу файла", async () => {
    audit.fail = true;
    const response = await call(`/api/files/study/${ID}.pdf`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("file");
  });
});
