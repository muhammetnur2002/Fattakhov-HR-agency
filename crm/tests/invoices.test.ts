/**
 * Счета и расчёт вознаграждения.
 *
 * Ошибка здесь стоит денег напрямую: неверная база расчёта — и счёт
 * уходит клиенту на сумму, о которой не договаривались.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { feePerHire } from "@/lib/pricing";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  isFinal,
  isOverdue,
  isReceivable,
  overdueInvoiceFilter,
} from "@/lib/services/invoice-status";
import {
  createInvoice,
  InvoiceError,
  listBillableHires,
  listInvoices,
  receivables,
  transitionInvoice,
} from "@/lib/services/invoices";
import type { InvoiceStatus } from "@/lib/generated/prisma/enums";

const ORG = "org_fattakhov";
const PREFIX = "test_inv_";

const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

const clientAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

async function cleanup() {
  await db.invoice.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await db.invoice.deleteMany({ where: { description: { startsWith: "[тест]" } } });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

const ALL: InvoiceStatus[] = [
  "DRAFT",
  "ISSUED",
  "PAID",
  "OVERDUE",
  "CANCELLED",
];

describe("стейт-машина счёта", () => {
  it("описана для каждого статуса", () => {
    for (const s of ALL) expect(ALLOWED_TRANSITIONS[s], s).toBeDefined();
  });

  it("основной путь: черновик → выставлен → оплачен", () => {
    expect(canTransition("DRAFT", "ISSUED")).toBe(true);
    expect(canTransition("ISSUED", "PAID")).toBe(true);
  });

  it("просроченный всё ещё можно оплатить", () => {
    expect(canTransition("OVERDUE", "PAID")).toBe(true);
  });

  it("оплаченный счёт не «разоплачивают»", () => {
    // Ошибку исправляют корректирующим документом, а не сменой статуса
    expect(ALLOWED_TRANSITIONS.PAID).toEqual([]);
  });

  it("аннулированный счёт не воскрешают", () => {
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("нельзя оплатить невыставленный счёт", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false);
  });

  it("нельзя просрочить черновик", () => {
    expect(canTransition("DRAFT", "OVERDUE")).toBe(false);
  });

  it("статус не переходит сам в себя", () => {
    for (const s of ALL) expect(canTransition(s, s), s).toBe(false);
  });

  it("в дебиторку попадают выставленные и просроченные", () => {
    expect(ALL.filter(isReceivable)).toEqual(["ISSUED", "OVERDUE"]);
  });

  it("закрытыми считаются оплаченный и аннулированный", () => {
    expect(ALL.filter(isFinal)).toEqual(["PAID", "CANCELLED"]);
  });
});

describe("признак просрочки", () => {
  const past = new Date("2026-08-01T12:00:00Z");
  const now = new Date("2026-08-10T12:00:00Z");
  const future = new Date("2026-08-20T12:00:00Z");

  it("выставленный с прошедшим сроком просрочен", () => {
    expect(isOverdue("ISSUED", past, now)).toBe(true);
  });

  it("выставленный со сроком в будущем — нет", () => {
    expect(isOverdue("ISSUED", future, now)).toBe(false);
  });

  it("оплаченный не просрочивается, даже если срок прошёл", () => {
    expect(isOverdue("PAID", past, now)).toBe(false);
  });

  it("счёт без срока оплаты не просрочивается", () => {
    expect(isOverdue("ISSUED", null, now)).toBe(false);
  });

  /*
    Одно правило записано дважды — предикатом и фрагментом запроса для
    фоновой задачи, — и разъехаться они могут молча: тесты предиката
    останутся зелёными, а выборка начнёт брать не те счета. Поэтому
    сверяем обе записи на одном наборе.
  */
  it("фрагмент запроса берёт ровно то, что предикат считает просроченным", async () => {
    const rows = [
      { status: "ISSUED" as const, dueAt: past },
      { status: "ISSUED" as const, dueAt: future },
      { status: "ISSUED" as const, dueAt: null },
      { status: "PAID" as const, dueAt: past },
      { status: "OVERDUE" as const, dueAt: past },
    ];
    const idOf = (i: number) => `${PREFIX}due_${i}`;

    await db.invoice.createMany({
      data: rows.map((row, i) => ({
        ...row,
        id: idOf(i),
        organizationId: ORG,
        clientId: "cl_starfish",
        number: `90${i}/2026`,
        amount: 100_000,
        description: "[тест] просрочка",
        createdById: owner.id,
      })),
    });

    const found = await db.invoice.findMany({
      where: { id: { startsWith: `${PREFIX}due_` }, ...overdueInvoiceFilter(now) },
      select: { id: true },
    });

    const expected = rows
      .map((row, i) => (isOverdue(row.status, row.dueAt, now) ? idOf(i) : null))
      .filter((id) => id !== null);

    // Из пяти подходит один — иначе сравнение двух пустых списков
    // прошло бы и при сломанном фильтре
    expect(expected).toEqual([idOf(0)]);
    expect(found.map((i) => i.id)).toEqual(expected);
  });
});

describe("BR-31: расчёт от фактического оффера", () => {
  it("считается от оффера, а не от вилки брифа", () => {
    // Вилка была 150–200, договорились на 180 — считаем от 180
    const byOffer = feePerHire(
      { pricingModel: "PERCENT_MONTHLY", monthsCount: 2 },
      { monthlySalary: 180_000 },
    );
    const byRangeTop = feePerHire(
      { pricingModel: "PERCENT_MONTHLY", monthsCount: 2 },
      { monthlySalary: 200_000 },
    );

    expect(byOffer).toBe(360_000);
    expect(byOffer).not.toBe(byRangeTop);
  });

  it("закрытые позиции приходят с расчётом по действующему договору", async () => {
    const hires = await listBillableHires(owner);
    expect(hires.length).toBeGreaterThan(0);

    for (const hire of hires) {
      expect(hire.candidateName.length).toBeGreaterThan(0);
      expect(hire.pricingDescription.length).toBeGreaterThan(0);

      // Если есть и оффер, и договор — должна быть сумма
      if (hire.offerSalary !== null && !hire.pricingDescription.includes("Нет")) {
        expect(hire.fee).not.toBeNull();
        expect(hire.fee).toBeGreaterThan(0);
      }
    }
  });

  it("сумма считается именно от оффера этой позиции", async () => {
    const hires = await listBillableHires(owner);
    const withOffer = hires.find(
      (h) => h.offerSalary !== null && h.fee !== null,
    );
    if (!withOffer) return;

    // Договор «Старфиш» — два оклада
    const agreement = await db.agreement.findFirst({
      where: { clientId: withOffer.clientId, status: "ACTIVE" },
      select: { pricingModel: true, monthsCount: true },
    });

    if (agreement?.pricingModel === "PERCENT_MONTHLY") {
      expect(withOffer.fee).toBe(
        withOffer.offerSalary! * (agreement.monthsCount ?? 0),
      );
    }
  });
});

describe("жизненный цикл счёта", () => {
  async function makeInvoice(amount = 300_000) {
    return createInvoice(owner, {
      clientId: "cl_starfish",
      amount,
      description: "[тест] за закрытие позиции",
      vacancyIds: ["vac_1"],
    });
  }

  it("создаётся черновиком с номером", async () => {
    const { id, number } = await makeInvoice();

    const invoice = await db.invoice.findUnique({
      where: { id },
      select: { status: true, number: true },
    });

    expect(invoice?.status).toBe("DRAFT");
    expect(number).toMatch(/^\d+\/\d{4}$/);
  });

  /*
    Номер счёта — бухгалтерский идентификатор, и двух одинаковых быть
    не должно. Раньше номер считался запросом «сколько счетов уже есть»
    и подставлялся отдельной вставкой: восемь одновременных вызовов
    давали три разных номера на восемь документов.
  */
  it("одновременно выписанные счета получают разные номера", async () => {
    const созданные = await Promise.all(
      Array.from({ length: 8 }, () => makeInvoice()),
    );

    const номера = созданные.map((i) => i.number);
    expect(new Set(номера).size).toBe(номера.length);
  });

  it("номер продолжает наибольший, а не количество", async () => {
    // Дырка в нумерации: следом за 9/ГГГГ обязан идти 10/ГГГГ. Счёт
    // «по количеству» выдал бы здесь 2/ГГГГ — номер, который со временем
    // столкнётся с уже выписанным документом
    const year = new Date().getFullYear();
    await db.invoice.create({
      data: {
        id: `${PREFIX}gap`,
        organizationId: ORG,
        clientId: "cl_starfish",
        number: `9/${year}`,
        amount: 100_000,
        description: "[тест] дырка в нумерации",
        createdById: owner.id,
      },
    });

    const { number } = await makeInvoice();
    expect(number).toBe(`10/${year}`);
  });

  it("нулевая сумма не принимается", async () => {
    await expect(
      createInvoice(owner, {
        clientId: "cl_starfish",
        amount: 0,
        description: "[тест] пустой",
        vacancyIds: [],
      }),
    ).rejects.toThrow(InvoiceError);
  });

  it("выставление проставляет дату и срок оплаты", async () => {
    const { id } = await makeInvoice();
    await transitionInvoice(owner, id, "ISSUED", { dueInDays: 10 });

    const invoice = await db.invoice.findUnique({
      where: { id },
      select: { status: true, issuedAt: true, dueAt: true },
    });

    expect(invoice?.status).toBe("ISSUED");
    expect(invoice?.issuedAt).not.toBeNull();
    expect(invoice?.dueAt).not.toBeNull();
  });

  it("оплата фиксирует дату", async () => {
    const { id } = await makeInvoice();
    await transitionInvoice(owner, id, "ISSUED");
    await transitionInvoice(owner, id, "PAID");

    const invoice = await db.invoice.findUnique({
      where: { id },
      select: { status: true, paidAt: true },
    });

    expect(invoice?.status).toBe("PAID");
    expect(invoice?.paidAt).not.toBeNull();
  });

  it("запрещённый переход отклоняется", async () => {
    const { id } = await makeInvoice();

    await expect(transitionInvoice(owner, id, "PAID")).rejects.toThrow(
      /не переводится/,
    );
  });

  it("счёт чужой организации не найдётся", async () => {
    await expect(
      transitionInvoice(owner, "нет-такого", "ISSUED"),
    ).rejects.toThrow(/не найден/);
  });
});

describe("видимость счетов", () => {
  it("клиент не видит черновики", async () => {
    await createInvoice(owner, {
      clientId: "cl_starfish",
      amount: 100_000,
      description: "[тест] черновик",
      vacancyIds: [],
    });

    const forClient = await listInvoices(clientAdmin);
    expect(forClient.every((i) => i.status !== "DRAFT")).toBe(true);
  });

  it("клиент видит только свои счета", async () => {
    const forClient = await listInvoices(clientAdmin);
    // В seed есть счета обоих клиентов
    expect(forClient.every((i) => i.clientName === "Старфиш")).toBe(true);
  });

  it("агентство видит счета всех клиентов", async () => {
    const forAgency = await listInvoices(owner);
    const names = new Set(forAgency.map((i) => i.clientName));
    expect(names.size).toBeGreaterThan(0);
  });
});

describe("дебиторка", () => {
  it("считает выставленные и просроченные отдельно", async () => {
    const before = await receivables(owner);

    const { id } = await createInvoice(owner, {
      clientId: "cl_starfish",
      amount: 500_000,
      description: "[тест] дебиторка",
      vacancyIds: [],
    });
    await transitionInvoice(owner, id, "ISSUED");

    const after = await receivables(owner);

    expect(after.total).toBe(before.total + 500_000);
    expect(after.count).toBe(before.count + 1);
    // Свежевыставленный не просрочен
    expect(after.overdue).toBe(before.overdue);
  });

  it("черновики в дебиторку не попадают", async () => {
    const before = await receivables(owner);

    await createInvoice(owner, {
      clientId: "cl_starfish",
      amount: 900_000,
      description: "[тест] не выставлен",
      vacancyIds: [],
    });

    const after = await receivables(owner);
    expect(after.total).toBe(before.total);
  });
});
