/**
 * Ворота обязательной 2FA в session.ts: сотрудника агентства без включённой
 * второй ступени не пускает ни одна страница, ни действие — все они берут
 * актора через requireActor, — а экран настройки пускает.
 */
import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: state.userId, issuedAt: Math.floor(Date.now() / 1000) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { hashPassword } from "@/lib/auth/password";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getActor, getGatedActor, requireActor, requireAgencyActor } from "@/lib/auth/session";
import { TWO_FACTOR_SETUP_PATH } from "@/lib/nav";

import { enableTwoFactorForTest } from "./two-factor-fixtures";

const MARK = "test-2fa-gate";
const ORG = "org_fattakhov";

async function makeUser(role: "OWNER" | "RECRUITER" | "CLIENT_ADMIN", clientId?: string) {
  const user = await db.user.create({
    data: {
      organizationId: ORG,
      email: `${MARK}-${role.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      fullName: "Тест Ворота",
      role,
      clientId,
      passwordHash: await hashPassword("kofe-s-molokom-v-pyatnitsu"),
    },
    select: { id: true },
  });
  state.userId = user.id;
  return user.id;
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("requireActor", () => {
  it("сотрудник агентства без 2FA — на экран настройки, откуда бы ни спросили", async () => {
    await makeUser("RECRUITER");
    await expect(requireActor()).rejects.toThrow(`REDIRECT:${TWO_FACTOR_SETUP_PATH}`);
    await expect(requireAgencyActor()).rejects.toThrow(`REDIRECT:${TWO_FACTOR_SETUP_PATH}`);
  });

  it("владелец — тоже", async () => {
    await makeUser("OWNER");
    await expect(requireAgencyActor()).rejects.toThrow(`REDIRECT:${TWO_FACTOR_SETUP_PATH}`);
  });

  it("сам экран настройки и его действия актора получают", async () => {
    const id = await makeUser("RECRUITER");
    const actor = await requireActor({ allowWithoutTwoFactor: true });
    expect(actor.id).toBe(id);
    expect((await requireAgencyActor({ allowWithoutTwoFactor: true })).id).toBe(id);
  });

  it("с включённой 2FA пускает как обычно", async () => {
    const id = await makeUser("RECRUITER");
    await enableTwoFactorForTest(id);
    expect((await requireAgencyActor()).id).toBe(id);
  });

  it("клиента правило не касается: 2FA у него по желанию", async () => {
    const client = await db.client.findFirstOrThrow({ select: { id: true } });
    const id = await makeUser("CLIENT_ADMIN", client.id);
    expect((await requireActor()).id).toBe(id);
  });

  it("клиенту кабинет агентства закрыт, как и раньше", async () => {
    const client = await db.client.findFirstOrThrow({ select: { id: true } });
    await makeUser("CLIENT_ADMIN", client.id);
    await expect(requireAgencyActor()).rejects.toThrow("NOT_FOUND");
  });
});

describe("getGatedActor — для маршрутов, где нет макета кабинета", () => {
  it("сотруднику агентства без 2FA — null, а голый getActor его отдаёт (поэтому маршрутам он не годится)", async () => {
    const id = await makeUser("OWNER");
    expect(await getGatedActor()).toBeNull();
    expect((await getActor())?.id).toBe(id);
  });

  it("с включённой 2FA — актор", async () => {
    const id = await makeUser("RECRUITER");
    await enableTwoFactorForTest(id);
    expect((await getGatedActor())?.id).toBe(id);
  });

  it("клиент — актор: ворота его не касаются", async () => {
    const client = await db.client.findFirstOrThrow({ select: { id: true } });
    const id = await makeUser("CLIENT_ADMIN", client.id);
    expect((await getGatedActor())?.id).toBe(id);
  });
});

describe("обхода нет", () => {
  it("ни в разработке, ни в проде ворота не зависят от окружения", async () => {
    await makeUser("OWNER");
    for (const env of ["development", "test", "production"]) {
      vi.stubEnv("NODE_ENV", env);
      await expect(requireAgencyActor(), env).rejects.toThrow(`REDIRECT:${TWO_FACTOR_SETUP_PATH}`);
    }
    vi.unstubAllEnvs();
  });

  it("в коде ворот нет переключателей по окружению", () => {
    for (const file of ["lib/auth/session.ts", "lib/services/two-factor.ts", "app/(agency)/a/layout.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/NODE_ENV|SKIP_2FA|DISABLE_2FA|BYPASS/);
    }
  });

  it("тестовые учётки seed проходят ворота включённой 2FA, а seed не запускается в проде без явного флага", () => {
    const seed = readFileSync("prisma/seed.ts", "utf8");
    // Учётки агентства — с включённой 2FA и известным секретом (prisma/dev-totp.ts)
    expect(seed).toMatch(/totpSecret: DEV_TOTP_SECRET/);
    expect(seed).toMatch(/totpEnabledAt: now/);
    // Сид стирает базу и заводит известные пароли — на проде он отказывается
    // раньше, чем заводит что-либо, а значит, известный секрет в боевую базу не попадёт
    expect(seed.indexOf("refuseOnProduction();")).toBeGreaterThan(-1);
    expect(seed.indexOf("refuseOnProduction();")).toBeLessThan(seed.indexOf("totpSecret: DEV_TOTP_SECRET"));
    expect(seed).toMatch(/process\.env\.NODE_ENV !== "production"\) return/);
  });
});
