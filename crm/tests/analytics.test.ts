/**
 * Аналитика.
 *
 * Критерий Этапа 8: цифры сходятся с ручным подсчётом по данным seed.
 * Поэтому ожидания здесь считаются независимо — прямыми запросами,
 * а не той же функцией, которую проверяем.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  average,
  buildFunnel,
  conversion,
  daysBetween,
  median,
  presentationQuality,
} from "@/lib/services/analytics/metrics";
import {
  agencyAnalytics,
  clientAnalytics,
  defaultPeriod,
} from "@/lib/services/analytics/queries";

const ORG = "org_fattakhov";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
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

describe("арифметика метрик", () => {
  it("конверсия считается в процентах", () => {
    expect(conversion(25, 13)).toBe(52);
    expect(conversion(10, 10)).toBe(100);
    expect(conversion(10, 0)).toBe(0);
  });

  it("пустой знаменатель даёт null, а не ноль", () => {
    // «Конверсия 0%» и «считать не из чего» — разные вещи
    expect(conversion(0, 0)).toBeNull();
    expect(conversion(-1, 5)).toBeNull();
  });

  it("медиана устойчива к выбросам, среднее нет", () => {
    // Одна вакансия, закрывавшаяся полгода, не должна описывать все
    const values = [10, 12, 14, 180];
    expect(median(values)).toBe(13);
    expect(average(values)).toBe(54);
  });

  it("медиана нечётного набора — середина", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("медиана пустого набора — null", () => {
    expect(median([])).toBeNull();
    expect(average([])).toBeNull();
  });

  it("дни считаются вниз до целого", () => {
    const from = new Date("2026-08-01T10:00:00Z");
    const to = new Date("2026-08-04T09:00:00Z");
    expect(daysBetween(from, to)).toBe(2);
  });

  it("качество представлений — доля дошедших до интервью", () => {
    expect(presentationQuality(13, 7)).toBe(54);
    expect(presentationQuality(0, 0)).toBeNull();
  });
});

describe("построение воронки", () => {
  const steps = [
    { code: "LONGLIST", name: "Лонг-лист", order: 1 },
    { code: "PRESENTED", name: "Представлен", order: 3 },
    { code: "OFFER", name: "Оффер", order: 6 },
  ];

  it("первый шаг без конверсии, остальные считаются от предыдущего", () => {
    const funnel = buildFunnel(
      steps,
      new Map([
        ["LONGLIST", 100],
        ["PRESENTED", 50],
        ["OFFER", 10],
      ]),
    );

    expect(funnel[0].conversionFromPrevious).toBeNull();
    expect(funnel[1].conversionFromPrevious).toBe(50);
    expect(funnel[2].conversionFromPrevious).toBe(20);
  });

  it("шаги упорядочиваются, даже если пришли вперемешку", () => {
    const funnel = buildFunnel([...steps].reverse(), new Map());
    expect(funnel.map((s) => s.code)).toEqual([
      "LONGLIST",
      "PRESENTED",
      "OFFER",
    ]);
  });

  it("отсутствующий этап считается нулём, а не пропускается", () => {
    const funnel = buildFunnel(steps, new Map([["LONGLIST", 5]]));
    expect(funnel).toHaveLength(3);
    expect(funnel[1].reached).toBe(0);
  });
});

describe("воронка на данных seed", () => {
  /** Независимый подсчёт: сколько заявок дошло до каждого этапа. */
  async function manualReachCount(): Promise<Map<string, number>> {
    const transitions = await db.stageTransition.findMany({
      select: { applicationId: true, toStageId: true },
    });
    const stages = await db.pipelineStage.findMany({
      select: { id: true, code: true },
    });
    const codeById = new Map(stages.map((s) => [s.id, s.code]));

    const perApplication = new Map<string, Set<string>>();
    for (const t of transitions) {
      const code = codeById.get(t.toStageId);
      if (!code) continue;
      const set = perApplication.get(t.applicationId) ?? new Set();
      set.add(code);
      perApplication.set(t.applicationId, set);
    }

    const counts = new Map<string, number>();
    for (const set of perApplication.values()) {
      for (const code of set) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }

  it("агентство видит все семь этапов", async () => {
    const analytics = await agencyAnalytics(recruiter, defaultPeriod(365));
    expect(analytics.funnel).toHaveLength(7);
    expect(analytics.funnel[0].code).toBe("LONGLIST");
  });

  it("числа воронки совпадают с ручным подсчётом", async () => {
    const manual = await manualReachCount();
    const analytics = await agencyAnalytics(recruiter, defaultPeriod(365));

    for (const step of analytics.funnel) {
      expect(step.reached, `этап ${step.code}`).toBe(manual.get(step.code) ?? 0);
    }
  });

  it("воронка сужается, а не расширяется", async () => {
    // Кандидатов на каждом следующем этапе не может быть больше
    const analytics = await agencyAnalytics(recruiter, defaultPeriod(365));

    for (let i = 1; i < analytics.funnel.length; i++) {
      expect(
        analytics.funnel[i].reached,
        `${analytics.funnel[i].code} после ${analytics.funnel[i - 1].code}`,
      ).toBeLessThanOrEqual(analytics.funnel[i - 1].reached);
    }
  });

  it("клиенту внутренние этапы в аналитике не показываются (BR-3)", async () => {
    const analytics = await clientAnalytics(clientAdmin, defaultPeriod(365));
    const codes = analytics.funnel.map((s) => s.code);

    expect(codes).not.toContain("LONGLIST");
    expect(codes).not.toContain("SCREENING");
    expect(codes[0]).toBe("PRESENTED");
  });

  it("число представленных совпадает с прямым подсчётом", async () => {
    const manual = await db.application.count({
      where: {
        vacancy: { clientId: "cl_starfish" },
        presentedAt: { not: null },
      },
    });

    const analytics = await clientAnalytics(clientAdmin, defaultPeriod(365));
    const presented = analytics.funnel.find((s) => s.code === "PRESENTED");

    expect(presented?.reached).toBe(manual);
  });
});

describe("сроки и объём работы", () => {
  it("объём работы агентства больше числа представленных", async () => {
    // Тот самый блок, который показывает невидимую работу: скрининг
    // всегда шире представлений
    const analytics = await clientAnalytics(clientAdmin, defaultPeriod(365));

    expect(analytics.agencyWork.screened).toBeGreaterThan(
      analytics.agencyWork.presented,
    );
  });

  it("время до первого кандидата и до найма — неотрицательные", async () => {
    const analytics = await clientAnalytics(clientAdmin, defaultPeriod(365));

    if (analytics.daysToFirstCandidate !== null) {
      expect(analytics.daysToFirstCandidate).toBeGreaterThanOrEqual(0);
    }
    if (analytics.timeToHire !== null) {
      expect(analytics.timeToHire).toBeGreaterThanOrEqual(0);
    }
  });

  it("причины отказа отсортированы по частоте", async () => {
    const analytics = await clientAnalytics(clientAdmin, defaultPeriod(365));

    for (let i = 1; i < analytics.rejections.length; i++) {
      expect(analytics.rejections[i].count).toBeLessThanOrEqual(
        analytics.rejections[i - 1].count,
      );
    }
  });
});

describe("аналитика агентства", () => {
  it("загрузка считается по каждому рекрутеру", async () => {
    const analytics = await agencyAnalytics(recruiter, defaultPeriod(365));
    expect(analytics.load.length).toBeGreaterThan(0);

    for (const item of analytics.load) {
      expect(item.activeVacancies).toBeGreaterThanOrEqual(0);
      expect(item.activeCandidates).toBeGreaterThanOrEqual(0);
    }
  });

  it("вакансии в риске имеют причину", async () => {
    const analytics = await agencyAnalytics(recruiter, defaultPeriod(365));

    for (const vacancy of analytics.vacanciesAtRisk) {
      expect(vacancy.reason.length).toBeGreaterThan(5);
      expect(vacancy.daysActive).toBeGreaterThanOrEqual(0);
    }
  });

  it("клиенту эта аналитика недоступна по правам", async () => {
    // Проверка прав живёт на странице; здесь фиксируем, что данные
    // по всей организации не ограничены клиентом и потому опасны
    const analytics = await agencyAnalytics(recruiter, defaultPeriod(365));
    const clientView = await clientAnalytics(clientAdmin, defaultPeriod(365));

    expect(analytics.funnel.length).toBeGreaterThan(clientView.funnel.length);
  });
});
