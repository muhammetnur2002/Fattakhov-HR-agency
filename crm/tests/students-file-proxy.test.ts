/**
 * Прокси файлов студенческой платформы для проверяющих: со служебным секретом на сервере
 * он отдаёт ровно один файл. Свободный путь позволил бы дойти до любого маршрута платформы.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  actor: { id: "usr_owner", organizationId: "org_fattakhov", role: "OWNER", clientId: null } as unknown,
}));
const proxied = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("@/lib/auth/session", () => ({ requireActor: async () => session.actor }));
vi.mock("@/lib/students-service", () => ({
  fetchStudentsFile: async (path: string) => {
    proxied.paths.push(path);
    return new Response("file", { headers: { "content-type": "image/png" } });
  },
}));

const ID = "123e4567-e89b-12d3-a456-426614174000";

async function call(path: string) {
  const { GET } = await import("@/app/api/students-file/route");
  return GET(new NextRequest(`http://localhost/api/students-file?path=${encodeURIComponent(path)}`));
}

beforeEach(() => {
  proxied.paths.length = 0;
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
});
