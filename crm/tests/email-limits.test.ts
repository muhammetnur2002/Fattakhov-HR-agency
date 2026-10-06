/**
 * Лимит писем на адрес: регистрация (код на почту, в том числе «ещё раз»)
 * и восстановление пароля.
 *
 * Лимит по IP форму не защищает: адрес меняется, а ящик жертвы один.
 * Счётчик по адресу живёт в базе (lib/security/db-limit.ts) — в памяти
 * процесса он обнулялся бы перезапуском и не был бы общим на два процесса.
 * Ответ при отказе одинаков для существующего и несуществующего адреса:
 * иначе лимит сам стал бы способом узнать, кто зарегистрирован.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getEmailTransport } from "@/lib/notifications/channels";
import { requestPasswordReset } from "@/lib/services/passwords";
import { RegistrationError, requestCompanyRegistration } from "@/lib/services/registration";

const MARK = "test-maillimit";
const ORG = "org_fattakhov";
const PASSWORD = "kofe-s-molokom-v-pyatnitsu";

const address = (name: string) => `${MARK}-${name}@example.com`;

async function cleanup() {
  await db.authFailure.deleteMany({ where: { key: { contains: MARK } } });
  await db.pendingClientRegistration.deleteMany({ where: { email: { startsWith: MARK } } });
  await db.passwordReset.deleteMany({ where: { user: { email: { startsWith: MARK } } } });
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/** Просим код регистрации и возвращаем, сколько писем реально ушло. */
async function register(email: string): Promise<{ sent: number; error: string | null }> {
  const send = vi.spyOn(getEmailTransport(), "send");
  try {
    await requestCompanyRegistration({ email, phone: "+79001112233", password: PASSWORD });
    return { sent: send.mock.calls.length, error: null };
  } catch (error) {
    if (error instanceof RegistrationError) {
      return { sent: send.mock.calls.length, error: error.message };
    }
    throw error;
  } finally {
    send.mockRestore();
  }
}

/** Сдвинуть записи лимита в прошлое — вместо ожидания минуты и часа. */
async function ageAttempts(email: string, ms: number) {
  const rows = await db.authFailure.findMany({ where: { key: { contains: email } } });
  for (const row of rows) {
    await db.authFailure.update({ where: { id: row.id }, data: { at: new Date(row.at.getTime() - ms) } });
  }
}

describe("код регистрации на почту", () => {
  it("второе письмо подряд на тот же адрес не уходит: нужна пауза", async () => {
    const email = address("pause");
    expect(await register(email)).toEqual({ sent: 1, error: null });

    const second = await register(email);
    expect(second.sent).toBe(0);
    expect(second.error).toMatch(/Подождите минуту/);
  });

  it("после паузы можно ещё раз, но не больше трёх в час", async () => {
    const email = address("hour");
    expect((await register(email)).sent).toBe(1);

    await ageAttempts(email, 61_000);
    expect((await register(email)).sent).toBe(1);

    await ageAttempts(email, 61_000);
    expect((await register(email)).sent).toBe(1);

    // Четвёртое — уже потолок часа, даже после паузы
    await ageAttempts(email, 61_000);
    const fourth = await register(email);
    expect(fourth.sent).toBe(0);
    expect(fourth.error).toMatch(/слишком много писем/);

    // Через час окно освободилось
    await ageAttempts(email, 3_600_000);
    expect((await register(email)).sent).toBe(1);
  });

  it("лимит у каждого адреса свой; регистр и пробелы его не обходят", async () => {
    expect((await register(address("a"))).sent).toBe(1);
    expect((await register(address("b"))).sent).toBe(1);

    const same = await register(`  ${address("a").toUpperCase()} `);
    expect(same.sent).toBe(0);
    expect(same.error).toMatch(/Подождите минуту/);
  });

  it("десять одновременных запросов на один адрес — одно письмо", async () => {
    const email = address("parallel");
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          requestCompanyRegistration({ email, phone: "+79001112233", password: PASSWORD }),
        ),
      );
      expect(send.mock.calls).toHaveLength(1);
    } finally {
      send.mockRestore();
    }
  });

  it("отказ по лимиту одинаков для занятого и свободного адреса", async () => {
    const taken = address("taken");
    await db.user.create({
      data: {
        organizationId: ORG,
        email: taken,
        fullName: "Уже Есть",
        role: "CLIENT_ADMIN",
        passwordHash: await hashPassword(PASSWORD),
      },
    });

    const free = address("free");
    await register(taken);
    await register(free);

    const takenBlocked = await register(taken);
    const freeBlocked = await register(free);
    expect(takenBlocked.error).not.toBeNull();
    expect(takenBlocked).toEqual(freeBlocked);

    await ageAttempts(taken, 61_000);
    await ageAttempts(free, 61_000);
    await register(taken);
    await register(free);
    await ageAttempts(taken, 61_000);
    await ageAttempts(free, 61_000);
    await register(taken);
    await register(free);
    await ageAttempts(taken, 61_000);
    await ageAttempts(free, 61_000);
    // Потолок часа: тоже одно и то же сообщение
    expect(await register(taken)).toEqual(await register(free));
  });
});

describe("письма восстановления пароля", () => {
  async function resetMails(email: string, times: number): Promise<number> {
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      for (let i = 0; i < times; i++) await requestPasswordReset({ email });
      return send.mock.calls.length;
    } finally {
      send.mockRestore();
    }
  }

  it("не больше трёх в час на адрес — и после «перезапуска» тоже: счётчик в базе", async () => {
    const email = address("reset");
    expect(await resetMails(email, 5)).toBe(3);

    // Перезапуск процесса обнулил бы память, но не базу
    const { resetRateLimits } = await import("@/lib/security/rate-limit");
    resetRateLimits();
    expect(await resetMails(email, 1)).toBe(0);
  });

  it("десять одновременных запросов — три письма", async () => {
    const email = address("reset-parallel");
    const send = vi.spyOn(getEmailTransport(), "send");
    try {
      await Promise.all(Array.from({ length: 10 }, () => requestPasswordReset({ email })));
      expect(send.mock.calls).toHaveLength(3);
    } finally {
      send.mockRestore();
    }
  });
});
