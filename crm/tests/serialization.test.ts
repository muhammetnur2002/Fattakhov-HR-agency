/**
 * Что сервисы отдают страницам — должно пересекать границу
 * «сервер → браузер».
 *
 * Prisma отдаёт деньги как Decimal, а даты как Date. Date React
 * сериализовать умеет, Decimal — нет: он объект с методами. В режиме
 * разработки это предупреждение в логе, которое легко пролистать,
 * а в собранном приложении — падение страницы целиком.
 *
 * Ловится только так: типы тут не помогают. В сигнатурах Prisma эти
 * поля объявлены как Decimal, и TypeScript совершенно доволен, пока
 * значение не поедет в браузер.
 *
 * Найдено на боевом прогоне: карточка клиента с абонентским договором
 * роняла страницу на subscriptionAmount.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getApplication, listPipeline } from "@/lib/services/applications";
import { getCandidate, searchCandidates } from "@/lib/services/candidates";
import { getClient, listClients } from "@/lib/services/clients";
import { listInterviews } from "@/lib/services/interviews";
import { listInvoices } from "@/lib/services/invoices";
import { getVacancy, listVacancies } from "@/lib/services/vacancies";

const ORG = "org_fattakhov";

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

afterAll(async () => {
  await db.$disconnect();
});

/**
 * Значение, которое React не сможет передать клиентскому компоненту.
 *
 * Проверяем по устройству объекта, а не по `instanceof`: Decimal
 * приезжает из сгенерированного клиента Prisma, и сравнение с классом
 * ломается при смене способа генерации. Достаточный признак — обычный
 * объект с методами.
 */
function isUnserializable(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (value instanceof Date) return false;
  if (Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype) return false;

  // Осталось что-то со своим прототипом: Decimal, Buffer, класс
  return true;
}

function findUnserializable(value: unknown, path = "$"): string[] {
  if (isUnserializable(value)) {
    const name = Object.getPrototypeOf(value)?.constructor?.name ?? "объект";
    return [`${path} (${name})`];
  }

  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findUnserializable(item, `${path}[${i}]`));
  }

  return Object.entries(value).flatMap(([k, v]) =>
    findUnserializable(v, `${path}.${k}`),
  );
}

async function expectSerializable(name: string, load: () => Promise<unknown>) {
  const result = await load();
  const bad = findUnserializable(result);
  expect(bad, `${name}: не пройдёт в браузер — ${bad.join(", ")}`).toEqual([]);
}

describe("кабинет агентства", () => {
  it("список клиентов", async () => {
    await expectSerializable("listClients", () => listClients(owner));
  });

  it("карточка клиента со ставками договора", async () => {
    // Именно здесь прогон и упёрся: ставки договора — Decimal
    await expectSerializable("getClient", () => getClient(owner, "cl_starfish"));
  });

  it("карточка клиента при каждой модели тарификации", async () => {
    const clients = await db.client.findMany({ select: { id: true } });
    for (const client of clients) {
      await expectSerializable(`getClient(${client.id})`, () =>
        getClient(owner, client.id),
      );
    }
  });

  it("вакансии и воронка", async () => {
    await expectSerializable("listVacancies", () => listVacancies(owner));
    await expectSerializable("getVacancy", () => getVacancy(owner, "vac_1"));
    await expectSerializable("listPipeline", () => listPipeline(owner, "vac_1"));
  });

  it("база кандидатов и карточка", async () => {
    await expectSerializable("searchCandidates", () =>
      searchCandidates(owner, {}),
    );

    const candidate = await db.candidate.findFirst({
      where: { salaryExpectation: { not: null } },
      select: { id: true },
    });
    await expectSerializable("getCandidate", () =>
      getCandidate(owner, candidate!.id),
    );
  });

  it("счета", async () => {
    await expectSerializable("listInvoices", () => listInvoices(owner));
  });
});

describe("кабинет клиента", () => {
  it("вакансии и воронка", async () => {
    await expectSerializable("listVacancies", () => listVacancies(clientAdmin));
    await expectSerializable("getVacancy", () => getVacancy(clientAdmin, "vac_1"));
    await expectSerializable("listPipeline", () =>
      listPipeline(clientAdmin, "vac_1"),
    );
  });

  it("карточка кандидата", async () => {
    const application = await db.application.findFirst({
      where: { presentedAt: { not: null }, vacancy: { clientId: "cl_starfish" } },
      select: { id: true },
    });

    await expectSerializable("getApplication", () =>
      getApplication(clientAdmin, application!.id),
    );
  });

  it("календарь и счета", async () => {
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const to = new Date();
    to.setDate(to.getDate() + 90);

    await expectSerializable("listInterviews", () =>
      listInterviews(clientAdmin, { from, to }),
    );
    await expectSerializable("listInvoices", () => listInvoices(clientAdmin));
  });
});

describe("сам сторож", () => {
  it("отличает Decimal от обычных данных", async () => {
    const withDecimal = await db.agreement.findFirst({
      where: { subscriptionAmount: { not: null } },
      select: { subscriptionAmount: true },
    });

    // Если в seed нет абонентского договора, проверять нечего —
    // но тогда и уверенности в стороже нет, поэтому это должно быть
    expect(withDecimal, "в seed нет договора с абонентской платой").not.toBeNull();
    expect(findUnserializable(withDecimal)).toHaveLength(1);

    expect(
      findUnserializable({ a: 1, b: "два", c: new Date(), d: [1, 2], e: null }),
    ).toEqual([]);
  });
});
