/**
 * Первая партия доработок кабинета: «Новые кандидаты» на дашборде, режим «День»
 * в календаре, фильтр «Лиды / Активные» в клиентах.
 *
 * Проверяется ровно новое поведение и то, что старое не задето: счётчик не
 * считает удалённых и чужих, дата в адресе не принимает несуществующих дней,
 * фильтр не прячет паузы и архив из «Все».
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { parseDateParam, toDateParam } from "@/lib/calendar/day-range";
import {
  countClientsByStatus,
  filterClientsByStatus,
  parseClientStatusFilter,
} from "@/lib/clients/status-filter";
import { prismaRaw as db } from "@/lib/db/prisma";
import { getNewCandidatesCounts } from "@/lib/services/dashboard";

const MARK = "test-additions1";
const ORG = "org_fattakhov";
const DAY = 24 * 60 * 60 * 1000;

function actor(role: Actor["role"]): Actor {
  return { id: "usr_test", organizationId: ORG, role, clientId: null } as Actor;
}

async function cleanup() {
  await db.candidate.deleteMany({ where: { fullName: { startsWith: MARK } } });
}

async function candidate(daysAgo: number, extra: Record<string, unknown> = {}) {
  await db.candidate.create({
    data: {
      organizationId: ORG,
      fullName: `${MARK} ${daysAgo} дн.`,
      createdById: "usr_owner",
      createdAt: new Date(Date.now() - daysAgo * DAY),
      ...extra,
    },
  });
}

describe("новые кандидаты на дашборде", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("считает за 3, 7 и 10 дней нарастающим итогом", async () => {
    const before = await getNewCandidatesCounts(actor("OWNER"));
    await candidate(1); // входит во все три
    await candidate(5); // в 7 и 10
    await candidate(9); // только в 10
    await candidate(20); // ни в один

    const after = await getNewCandidatesCounts(actor("OWNER"));
    expect(after!.last3Days - before!.last3Days).toBe(1);
    expect(after!.last7Days - before!.last7Days).toBe(2);
    expect(after!.last10Days - before!.last10Days).toBe(3);
  });

  it("не считает удалённых", async () => {
    const before = await getNewCandidatesCounts(actor("OWNER"));
    await candidate(1, { deletedAt: new Date() });
    const after = await getNewCandidatesCounts(actor("OWNER"));
    expect(after!.last3Days).toBe(before!.last3Days);
  });

  it("считает только свою организацию", async () => {
    const other = await db.organization.create({ data: { name: `${MARK} чужая` } });
    try {
      const before = await getNewCandidatesCounts(actor("OWNER"));
      await db.candidate.create({
        data: { organizationId: other.id, fullName: `${MARK} чужой`, createdById: "x" },
      });
      const after = await getNewCandidatesCounts(actor("OWNER"));
      expect(after!.last3Days).toBe(before!.last3Days);
    } finally {
      await db.candidate.deleteMany({ where: { organizationId: other.id } });
      await db.organization.delete({ where: { id: other.id } });
    }
  });

  it("клиенту базу не показывает: null вместо чисел", async () => {
    const client = { ...actor("CLIENT_ADMIN"), clientId: "cl_technopark" } as Actor;
    expect(await getNewCandidatesCounts(client)).toBeNull();
  });
});

describe("режим «День» в календаре: дата в адресе", () => {
  it("читает настоящую дату как местную полночь", () => {
    const d = parseDateParam("2026-10-11")!;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 11]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it("не принимает несуществующие и кривые даты", () => {
    for (const bad of ["2026-02-31", "2026-13-01", "2026-10-1", "11.10.2026", "", "abc", undefined]) {
      expect(parseDateParam(bad)).toBeNull();
    }
  });

  it("туда и обратно без сдвига, в том числе на границах месяца и года", () => {
    for (const iso of ["2026-10-11", "2026-12-31", "2027-01-01", "2028-02-29"]) {
      expect(toDateParam(parseDateParam(iso)!)).toBe(iso);
    }
  });

  it("листание на день вперёд переходит через границу месяца", () => {
    const d = parseDateParam("2026-10-31")!;
    d.setDate(d.getDate() + 1);
    expect(toDateParam(d)).toBe("2026-11-01");
  });
});

describe("фильтр клиентов «Лиды / Активные»", () => {
  const clients = [
    { id: "1", status: "LEAD" as const },
    { id: "2", status: "ACTIVE" as const },
    { id: "3", status: "ACTIVE" as const },
    { id: "4", status: "PAUSED" as const },
    { id: "5", status: "ARCHIVED" as const },
  ];

  it("разбирает значение из адреса, незнакомое — «все»", () => {
    expect(parseClientStatusFilter("lead")).toBe("LEAD");
    expect(parseClientStatusFilter("active")).toBe("ACTIVE");
    expect(parseClientStatusFilter("paused")).toBeNull();
    expect(parseClientStatusFilter(undefined)).toBeNull();
  });

  it("лиды и активные по отдельности", () => {
    expect(filterClientsByStatus(clients, "LEAD").map((c) => c.id)).toEqual(["1"]);
    expect(filterClientsByStatus(clients, "ACTIVE").map((c) => c.id)).toEqual(["2", "3"]);
  });

  it("без фильтра остаются все, включая паузу и архив", () => {
    expect(filterClientsByStatus(clients, null)).toHaveLength(5);
  });

  it("числа на кнопках: все, лиды, активные", () => {
    expect(countClientsByStatus(clients)).toEqual({ all: 5, leads: 1, active: 2 });
  });
});
