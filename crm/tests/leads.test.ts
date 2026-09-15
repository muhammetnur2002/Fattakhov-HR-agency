/**
 * Заявки с лендинга.
 *
 * Единственная точка в системе, куда пишет человек без аккаунта
 * и без токена. Поэтому проверяется не только «сохранилось», но и то,
 * что снаружи нельзя ни завести клиента, ни подсунуть лишнее поле,
 * ни залить систему пустышками.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { createLead, listLeads, setLeadStatus } from "@/lib/services/leads";
import { leadSchema } from "@/lib/validation/lead";

const MARK = "[тест-лид]";

async function cleanup() {
  await db.lead.deleteMany({ where: { name: { startsWith: MARK } } });
  await db.notification.deleteMany({
    where: { eventCode: "LEAD_RECEIVED", title: { contains: MARK } },
  });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("проверка формы", () => {
  it("имя и контакт обязательны", () => {
    expect(leadSchema.safeParse({ name: "", contact: "", consent: "on" }).success).toBe(false);
    expect(leadSchema.safeParse({ name: "Аня", consent: "on", contact: "" }).success).toBe(false);
    expect(leadSchema.safeParse({ name: "", contact: "+79170000000", consent: "on" }).success).toBe(false);
  });

  it("принимает телефон, Telegram и почту одинаково", () => {
    for (const contact of [
      "+7 (937) 571-18-77",
      "@goalkeeperka",
      "profattakhov@gmail.com",
      "89375711877",
    ]) {
      expect(leadSchema.safeParse({ name: "Аня", consent: "on", contact }).success, contact).toBe(true);
    }
  });

  it("отсекает контакт без цифр и без собачки", () => {
    // «Позвоните мне» это не контакт, а пожелание
    const r = leadSchema.safeParse({ name: "Аня", consent: "on", contact: "позвоните мне" });
    expect(r.success).toBe(false);
  });

  it("пустые необязательные поля превращаются в null, а не в пустые строки", () => {
    const r = leadSchema.safeParse({
      consent: "on",
      name: "Аня",
      contact: "@anya",
      company: "",
      website: "",
      note: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.company).toBeNull();
    expect(r.data.website).toBeNull();
    expect(r.data.note).toBeNull();
    expect(r.data.vacancies).toBeNull();
  });

  it("не принимает произвольное число вакансий вне списка", () => {
    const r = leadSchema.safeParse({
      consent: "on",
      name: "Аня",
      contact: "@anya",
      vacancies: "сто вакансий",
      marketingConsent: false,
    });
    expect(r.success).toBe(false);
  });

  it("обрезает пробелы по краям", () => {
    const r = leadSchema.safeParse({
      name: "  Аня  ",
      contact: "  @anya  ",
      consent: "on",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.name).toBe("Аня");
    expect(r.data.contact).toBe("@anya");
  });
});

describe("сохранение заявки", () => {
  it("создаёт заявку и оповещает агентство", async () => {
    await createLead(
      {
        name: `${MARK} Пробный`,
        contact: "@probny",
        company: "ООО Пробы",
        website: null,
        note: null,
        vacancies: "2-3 вакансии",
      marketingConsent: false,
      },
      { ip: "203.0.113.7", userAgent: "vitest" },
    );

    const lead = await db.lead.findFirst({
      where: { name: { startsWith: MARK } },
      select: { status: true, ip: true, userAgent: true, company: true },
    });

    expect(lead?.status).toBe("NEW");
    expect(lead?.company).toBe("ООО Пробы");
    // Адрес и клиент нужны для разбора спама
    expect(lead?.ip).toBe("203.0.113.7");
    expect(lead?.userAgent).toBe("vitest");

    const notified = await db.notification.count({
      where: { eventCode: "LEAD_RECEIVED", title: { contains: MARK } },
    });
    expect(notified).toBeGreaterThan(0);
  });

  it("не создаёт ни клиента, ни договора, ни вакансии", async () => {
    const before = await Promise.all([
      db.client.count(),
      db.agreement.count(),
      db.vacancy.count(),
    ]);

    await createLead({
      name: `${MARK} Второй`,
      contact: "@vtoroy",
      company: null,
      website: null,
      note: null,
      vacancies: null,
      marketingConsent: false,
    });

    const after = await Promise.all([
      db.client.count(),
      db.agreement.count(),
      db.vacancy.count(),
    ]);

    // Заявка снаружи не должна двигать ничего в рабочем контуре
    expect(after).toEqual(before);
  });
});

describe("разбор заявки", () => {
  it("статус и след разбора записываются, возврат в новые их снимает", async () => {
    await createLead({
      name: `${MARK} Разбор`,
      contact: "@razbor",
      company: null,
      website: null,
      note: null,
      vacancies: null,
      marketingConsent: false,
    });

    const lead = await db.lead.findFirstOrThrow({
      where: { name: { startsWith: MARK } },
      select: { id: true },
    });

    await setLeadStatus({
      leadId: lead.id,
      status: "IN_PROGRESS",
      actorName: "Полина Крючкова",
    });

    let saved = await db.lead.findFirstOrThrow({
      where: { id: lead.id },
      select: { status: true, processedAt: true, processedBy: true },
    });
    expect(saved.status).toBe("IN_PROGRESS");
    expect(saved.processedAt).not.toBeNull();
    expect(saved.processedBy).toBe("Полина Крючкова");

    await setLeadStatus({
      leadId: lead.id,
      status: "NEW",
      actorName: "Полина Крючкова",
    });

    saved = await db.lead.findFirstOrThrow({
      where: { id: lead.id },
      select: { status: true, processedAt: true, processedBy: true },
    });
    // Вернули в новые - значит разбора не было, след стирается
    expect(saved.processedAt).toBeNull();
    expect(saved.processedBy).toBeNull();
  });

  it("новые заявки идут первыми", async () => {
    await createLead({
      name: `${MARK} Свежая`,
      contact: "@svezhaya",
      company: null,
      website: null,
      note: null,
      vacancies: null,
      marketingConsent: false,
    });
    await createLead({
      name: `${MARK} Старая`,
      contact: "@staraya",
      company: null,
      website: null,
      note: null,
      vacancies: null,
      marketingConsent: false,
    });

    const old = await db.lead.findFirstOrThrow({
      where: { name: { contains: "Старая" } },
      select: { id: true },
    });
    await setLeadStatus({
      leadId: old.id,
      status: "REJECTED",
      actorName: "тест",
    });

    const list = (await listLeads()).filter((l) => l.name.startsWith(MARK));
    expect(list[0]?.status).toBe("NEW");
  });
});

describe("согласие на обработку", () => {
  it("без галочки заявка не принимается", () => {
    // Требование раздела 10 юридического пакета и ст. 9 закона
    // в редакции с 01.09.2025: согласие оформляется отдельно
    const r = leadSchema.safeParse({ name: "Аня", contact: "+79170000000" });
    expect(r.success).toBe(false);
  });

  it("подделанное значение галочки не проходит", () => {
    // Браузер шлёт "on" у отмеченной галочки. Любое другое значение
    // означает, что форму заполнял не браузер
    for (const value of ["", "false", "off", "true", "1"]) {
      const r = leadSchema.safeParse({
        name: "Аня",
        contact: "+79170000000",
        consent: value,
      });
      expect(r.success, value).toBe(false);
    }
  });

  it("реклама остаётся необязательной", () => {
    // Связывать рекламное согласие с отправкой заявки нельзя:
    // ст. 18 закона о рекламе требует отдельного добровольного
    const r = leadSchema.safeParse({
      name: "Аня",
      contact: "+79170000000",
      consent: "on",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.marketingConsent).toBe(false);
  });

  it("отмеченная реклама доезжает как да", () => {
    const r = leadSchema.safeParse({
      name: "Аня",
      contact: "+79170000000",
      consent: "on",
      marketingConsent: "on",
    });
    expect(r.success && r.data.marketingConsent).toBe(true);
  });
});
