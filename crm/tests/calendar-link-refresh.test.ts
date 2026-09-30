/**
 * «Обновить ссылку календаря»: прежняя ссылка сразу перестаёт работать, новая работает,
 * у других людей ничего не меняется.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { calendarTokenFor } from "@/lib/calendar/ical";
import { prismaRaw as db } from "@/lib/db/prisma";

vi.mock("@/lib/security/guard", () => ({
  guardRate: async () => ({ allowed: true, retryAfter: 0 }),
  rateLimitMessage: () => "",
}));

const OWNER = "usr_owner";
const OTHER = "usr_rec1";

async function feed(token: string) {
  const { GET } = await import("@/app/api/calendar/[token]/route");
  return GET(new NextRequest(`http://localhost/api/calendar/${token}.ics`), {
    params: Promise.resolve({ token: `${token}.ics` }),
  });
}

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-calendar-link";
});

async function reset() {
  await db.user.updateMany({ where: { id: { in: [OWNER, OTHER] } }, data: { calendarTokenVersion: 0 } });
}
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.$disconnect();
});

describe("обновление ссылки календаря", () => {
  it("до обновления ссылка работает", async () => {
    expect((await feed(calendarTokenFor(OWNER))).status).toBe(200);
  });

  it("после обновления прежняя ссылка не работает, новая работает", async () => {
    const old = calendarTokenFor(OWNER, 0);
    await db.user.update({ where: { id: OWNER }, data: { calendarTokenVersion: { increment: 1 } } });
    expect((await feed(old)).status).toBe(404);
    expect((await feed(calendarTokenFor(OWNER, 1))).status).toBe(200);
    // будущую версию заранее не подобрать
    expect((await feed(calendarTokenFor(OWNER, 2))).status).toBe(404);
  });

  it("ссылка другого человека не задета", async () => {
    await db.user.update({ where: { id: OWNER }, data: { calendarTokenVersion: { increment: 1 } } });
    expect((await feed(calendarTokenFor(OTHER))).status).toBe(200);
  });
});
