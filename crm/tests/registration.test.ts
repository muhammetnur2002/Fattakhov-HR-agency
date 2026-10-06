/**
 * Самостоятельная регистрация компании и анкета после входа.
 *
 * Регистрация — только способ входа: по почте (пароль и код из письма),
 * или по телефону (его путь — tests/quick-registration.test.ts).
 * Компания, контакт и вакансия спрашиваются анкетой после входа
 * (completeRegistrationBrief), одинаковой для обоих способов.
 *
 * Проверяется то, на чём держится анкета: она нужна только тем, кто
 * зарегистрировался сам, проходит один раз, ничего не удваивает при
 * повторе, не меняет проверенную почту и не делает рабочей почту,
 * которую назвали, но не подтвердили.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/access";
import { maskPhone } from "@/lib/auth/phone";
import { prismaRaw as db } from "@/lib/db/prisma";
import { REGISTRATION_CONSENT_VERSION } from "@/lib/legal/registration-consent";
import { getEmailTransport } from "@/lib/notifications/channels";
import { resolveQuickSignIn } from "@/lib/services/quick-registration";
import {
  BriefError,
  COMPANY_NAME_PLACEHOLDER,
  completeRegistrationBrief,
  confirmCompanyRegistration,
  CONTACT_NAME_PLACEHOLDER,
  isPlaceholderName,
  needsBrief,
  requestCompanyRegistration,
} from "@/lib/services/registration";
import type { BriefInput } from "@/lib/validation/registration";

const MARK = "test-register";
const COMPANY = "ООО Тест Регистрация";
const QUICK_PHONE = "+79990000303";
const REGISTRATION_PHONE = "+79001112233";

function brief(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    company: COMPANY,
    name: "Мария Тестова",
    position: "HR-директор",
    phone: undefined,
    email: undefined,
    vacancyTitle: "Руководитель отдела продаж",
    city: "Казань",
    salaryFrom: 150_000,
    salaryTo: 200_000,
    ...overrides,
  };
}

async function cleanup() {
  const users = await db.user.findMany({
    where: {
      OR: [{ email: { startsWith: MARK } }, { email: "phone-79990000303@users.invalid" }],
    },
    select: { id: true, clientId: true },
  });
  const userIds = users.map((u) => u.id);
  const clients = await db.client.findMany({
    where: {
      id: { in: users.flatMap((u) => (u.clientId ? [u.clientId] : [])) },
      selfRegisteredAt: { not: null },
    },
    select: { id: true },
  });
  const ids = clients.map((c) => c.id);
  const vacancies = await db.vacancy.findMany({
    where: { clientId: { in: ids } },
    select: { id: true },
  });
  await db.pipelineStage.deleteMany({
    where: { vacancyId: { in: vacancies.map((v) => v.id) } },
  });
  await db.vacancy.deleteMany({ where: { clientId: { in: ids } } });
  await db.notification.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { title: { contains: COMPANY } }] },
  });
  await db.activityLog.deleteMany({ where: { entityId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.lead.deleteMany({
    where: { OR: [{ clientId: { in: ids } }, { contact: { startsWith: MARK } }] },
  });
  await db.client.deleteMany({ where: { id: { in: ids } } });
  await db.pendingClientRegistration.deleteMany({ where: { email: { startsWith: MARK } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/** Регистрация по почте целиком: первый экран, код из письма, подтверждение. */
async function registerByEmail(): Promise<Actor & { email: string }> {
  const email = `${MARK}+${Math.random().toString(36).slice(2, 8)}@example.com`;
  const send = vi.spyOn(getEmailTransport(), "send");
  let code = "";
  try {
    await requestCompanyRegistration({
      email,
      phone: REGISTRATION_PHONE,
      password: "длинный-пароль-1",
      ip: "203.0.113.9",
    });
    code = send.mock.calls.at(-1)?.[0].text.match(/\b\d{6}\b/)?.[0] ?? "";
  } finally {
    send.mockRestore();
  }
  await confirmCompanyRegistration({ email, code });
  return db.user.findFirstOrThrow({
    where: { email },
    select: { id: true, organizationId: true, role: true, clientId: true, email: true },
  });
}

async function registerByPhone() {
  return resolveQuickSignIn(
    { kind: "phone", phone: QUICK_PHONE },
    { consent: true, secondFactorCode: "" },
  );
}

describe("регистрация по почте", () => {
  it("заводит компанию под анкету и администратора клиента", async () => {
    const actor = await registerByEmail();
    expect(actor.role).toBe("CLIENT_ADMIN");

    const client = await db.client.findUniqueOrThrow({
      where: { id: actor.clientId! },
      select: { status: true, name: true, selfRegisteredAt: true, briefCompletedAt: true },
    });
    expect(client.status).toBe("LEAD");
    expect(client.name).toBe(COMPANY_NAME_PLACEHOLDER);
    expect(needsBrief(client)).toBe(true);

    const user = await db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { fullName: true, phone: true, phoneVerified: true },
    });
    expect(user.phone).toBe(REGISTRATION_PHONE);
    expect(user.fullName).toBe(CONTACT_NAME_PLACEHOLDER);
    expect(isPlaceholderName(user)).toBe(true);
  });

  it("заявка — с согласием первого экрана, агентство оповещается после анкеты", async () => {
    const actor = await registerByEmail();
    const pending = await db.pendingClientRegistration.findFirstOrThrow({
      where: { email: actor.email },
      select: { consentAt: true },
    });

    const lead = await db.lead.findFirstOrThrow({
      where: { clientId: actor.clientId },
      select: { consentVersion: true, consentAt: true, ip: true, contact: true },
    });
    expect(lead.consentVersion).toBe(REGISTRATION_CONSENT_VERSION);
    // Момент галочки, а не подтверждения кода
    expect(lead.consentAt).toEqual(pending.consentAt);
    expect(lead.ip).toBe("203.0.113.9");
    expect(lead.contact).toContain(actor.email);
    expect(
      await db.notification.count({
        where: { eventCode: "LEAD_RECEIVED", title: { contains: actor.email } },
      }),
    ).toBe(0);
  });
});

describe("анкета после входа", () => {
  it("называет компанию, записывает контакт и заводит черновик вакансии", async () => {
    const actor = await registerByEmail();
    await completeRegistrationBrief(actor, brief());

    const client = await db.client.findUniqueOrThrow({
      where: { id: actor.clientId! },
      select: { name: true, city: true, briefCompletedAt: true, selfRegisteredAt: true },
    });
    expect(client.name).toBe(COMPANY);
    expect(client.city).toBe("Казань");
    expect(needsBrief(client)).toBe(false);

    const user = await db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { fullName: true, position: true, phone: true },
    });
    // Телефон с первого экрана регистрации: анкета его не спрашивала
    expect(user).toEqual({
      fullName: "Мария Тестова",
      position: "HR-директор",
      phone: REGISTRATION_PHONE,
    });

    const draft = await db.vacancy.findFirstOrThrow({
      where: { clientId: actor.clientId! },
      select: { title: true, status: true, city: true },
    });
    expect(draft).toMatchObject({
      title: "Руководитель отдела продаж",
      status: "DRAFT",
      city: "Казань",
    });
  });

  it("дописывает заявку и только теперь оповещает агентство", async () => {
    const actor = await registerByEmail();
    await completeRegistrationBrief(actor, brief());

    const lead = await db.lead.findFirstOrThrow({
      where: { clientId: actor.clientId! },
      select: { company: true, note: true, contact: true },
    });
    expect(lead.company).toBe(COMPANY);
    expect(lead.note).toContain("Руководитель отдела продаж");
    expect(lead.contact).toContain(REGISTRATION_PHONE);
    expect(
      await db.notification.count({
        where: { eventCode: "LEAD_RECEIVED", title: { contains: COMPANY } },
      }),
    ).toBeGreaterThan(0);
  });

  it("повторная отправка ничего не удваивает", async () => {
    const actor = await registerByEmail();
    await completeRegistrationBrief(actor, brief());
    await completeRegistrationBrief(actor, brief({ vacancyTitle: "Другая" }));
    expect(await db.vacancy.count({ where: { clientId: actor.clientId! } })).toBe(1);
  });

  it("без телефона не проходит — у учётки без номера его надо назвать", async () => {
    const quick = await registerByPhone();
    // Вошедшие по номеру его уже подтвердили; убираем, чтобы проверить сам запрет
    await db.user.update({ where: { id: quick.id }, data: { phone: null, phoneVerified: null } });
    await expect(completeRegistrationBrief(quick, brief())).rejects.toThrow(BriefError);

    await completeRegistrationBrief(quick, brief({ phone: "8 900 000-00-00" }));
    const user = await db.user.findUniqueOrThrow({ where: { id: quick.id }, select: { phone: true } });
    expect(user.phone).toBe("+79000000000");
  });

  it("почту, подтверждённую кодом из письма, анкета не меняет", async () => {
    const actor = await registerByEmail();
    await completeRegistrationBrief(actor, brief({ email: `${MARK}-other@example.com` }));
    const user = await db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { email: true, pendingEmail: true },
    });
    expect(user).toEqual({ email: actor.email, pendingEmail: null });
  });

  /*
    Названная в анкете почта сразу рабочей не становится: сначала ссылка
    из письма на неё. Иначе опечатка отдала бы постороннему уведомления
    о кандидатах, а через «Забыли пароль» — и кабинет.
  */
  it("почта из анкеты ждёт подтверждения, на неё уходит ссылка", async () => {
    const quick = await registerByPhone();
    const send = vi.spyOn(getEmailTransport(), "send");
    const email = `${MARK}-phone@example.com`;
    try {
      await completeRegistrationBrief(quick, brief({ phone: "+7 900 000-00-01", email }));

      const user = await db.user.findUniqueOrThrow({
        where: { id: quick.id },
        select: { email: true, pendingEmail: true },
      });
      expect(user.email).toMatch(/@users\.invalid$/);
      expect(user.pendingEmail).toBe(email);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ to: email, text: expect.stringContaining("/confirm-email/") }),
      );
    } finally {
      send.mockRestore();
    }
  });

  it("чужую почту вместо заглушки не даёт", async () => {
    const quick = await registerByPhone();
    await expect(
      completeRegistrationBrief(
        quick,
        brief({ phone: "+7 900 000-00-01", email: "owner@fattakhov.hr" }),
      ),
    ).rejects.toThrow(/уже привязан/);
  });

  it("компании, заведённой агентством, анкета не нужна", async () => {
    const agencyClient = await db.client.findUniqueOrThrow({
      where: { id: "cl_starfish" },
      select: { selfRegisteredAt: true, briefCompletedAt: true },
    });
    expect(needsBrief(agencyClient)).toBe(false);
  });
});

describe("имя-заглушка", () => {
  it("маска номера и «Представитель компании» — не имя, имя, названное самим человеком, — имя", () => {
    const phone = "+79001234567";
    expect(isPlaceholderName({ fullName: maskPhone(phone), phoneVerified: phone })).toBe(true);
    expect(isPlaceholderName({ fullName: CONTACT_NAME_PLACEHOLDER, phoneVerified: null })).toBe(true);
    expect(isPlaceholderName({ fullName: "Анна Смирнова", phoneVerified: phone })).toBe(false);
    expect(isPlaceholderName({ fullName: "Анна Смирнова", phoneVerified: null })).toBe(false);
  });
});
