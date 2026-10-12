/**
 * Общий суточный потолок писем незнакомцам.
 *
 * Счётчик в базе общий для всех файлов тестов, поэтому настоящий потолок
 * в 150 писем здесь не набирается: он стирал бы письма соседним тестам,
 * идущим параллельно. Вместо этого счётчик подменяется, а проверяется то,
 * что важно: потолок режет письма чужим, но не настоящему сотруднику.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/db-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/db-limit")>();
  return {
    ...actual,
    // Суточный счётчик исчерпан, остальные (по адресу, по IP) — настоящие
    reserveAttempt: (key: string, options: Parameters<typeof actual.reserveAttempt>[1]) =>
      key.startsWith("mail:day:")
        ? Promise.resolve({ allowed: false as const, reason: "window" as const, retryAfter: 3600 })
        : actual.reserveAttempt(key, options),
  };
});

import { hashPassword } from "@/lib/auth/password";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { reserveStrangerMail } from "@/lib/security/mail-limit";
import { requestPasswordReset } from "@/lib/services/passwords";

const MARK = "test-strangercap";
const ORG = "org_fattakhov";
const IP = "198.51.100.40";

async function cleanup() {
  await db.authFailure.deleteMany({ where: { key: { contains: MARK } } });
  await db.authFailure.deleteMany({ where: { key: { startsWith: "mail:ip:", endsWith: `:${IP}` } } });
  await db.passwordReset.deleteMany({ where: { user: { email: { startsWith: MARK } } } });
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("суточный потолок писем незнакомцам", () => {
  it("исчерпанный потолок отказывает, даже когда IP чист", async () => {
    expect(await reserveStrangerMail("reset", IP)).toBe(false);
    expect(await reserveStrangerMail("register", IP)).toBe(false);
  });

  it("письмо «восстановить нечего» чужому адресу не уходит", async () => {
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await requestPasswordReset({ email: `${MARK}-nobody@example.com`, ip: IP });
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });

  it("настоящему сотруднику ссылка восстановления уходит, потолок его не задевает", async () => {
    const email = `${MARK}-staff@example.com`;
    await db.user.create({
      data: {
        organizationId: ORG,
        email,
        fullName: "Настоящий Сотрудник",
        role: "CLIENT_ADMIN",
        passwordHash: await hashPassword("kofe-s-molokom-v-pyatnitsu"),
      },
    });
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await requestPasswordReset({ email, ip: IP });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
  });
});
