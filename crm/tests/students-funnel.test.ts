import { describe, expect, it } from "vitest";

import { funnelStage, isCold, nudgeFor, type FunnelActivity } from "@/lib/students-funnel";

const base: FunnelActivity = {
  vacancies: 0,
  published: 0,
  applications: 0,
  newApplications: 0,
  invited: 0,
  hired: 0,
  lastActivityAt: null,
  registeredAt: "2026-09-01T10:00:00.000Z",
};

describe("воронка студенческой платформы", () => {
  it("клиент с действующим договором — в последнем этапе, что бы ни было на платформе", () => {
    expect(funnelStage(true, null)).toBe("CONTRACT");
    expect(funnelStage(true, { ...base, applications: 9 })).toBe("CONTRACT");
  });

  it("без активности — зарегистрировался", () => {
    expect(funnelStage(false, null)).toBe("REGISTERED");
    expect(funnelStage(false, base)).toBe("REGISTERED");
  });

  it("вакансия без откликов — этап «есть вакансия»", () => {
    expect(funnelStage(false, { ...base, vacancies: 1 })).toBe("VACANCY");
  });

  it("первые отклики — «получает отклики», пять и больше — «пора предложить»", () => {
    expect(funnelStage(false, { ...base, vacancies: 1, applications: 4 })).toBe("APPLICATIONS");
    expect(funnelStage(false, { ...base, vacancies: 1, applications: 5 })).toBe("READY");
  });

  it("приглашение или найм сразу делают клиента готовым к предложению", () => {
    expect(funnelStage(false, { ...base, vacancies: 1, applications: 1, invited: 1 })).toBe("READY");
    expect(funnelStage(false, { ...base, vacancies: 1, applications: 1, hired: 1 })).toBe("READY");
  });

  it("остывшим считается клиент без движения две недели", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    expect(isCold({ ...base, lastActivityAt: "2026-09-20T00:00:00.000Z" }, now)).toBe(false);
    expect(isCold({ ...base, lastActivityAt: "2026-09-10T00:00:00.000Z" }, now)).toBe(true);
    // Нет ни одного отклика — отсчёт от регистрации
    expect(isCold(base, now)).toBe(true);
  });
});

describe("подсказка «подберём сами»", () => {
  it("клиенту с договором и без данных не показывается", () => {
    expect(nudgeFor(true, { applications: 20, hired: 3 })).toBe("none");
    expect(nudgeFor(false, null)).toBe("none");
  });

  it("пока откликов нет — рано", () => {
    expect(nudgeFor(false, { applications: 0, invited: 0, hired: 0 })).toBe("none");
  });

  it("первые отклики — мягкая подсказка, пять и больше — основная", () => {
    expect(nudgeFor(false, { applications: 1 })).toBe("responses");
    expect(nudgeFor(false, { applications: 4 })).toBe("responses");
    expect(nudgeFor(false, { applications: 5 })).toBe("ready");
  });

  it("приглашение или найм — сразу основная подсказка", () => {
    expect(nudgeFor(false, { applications: 1, invited: 1 })).toBe("ready");
    expect(nudgeFor(false, { applications: 1, hired: 1 })).toBe("ready");
  });
});
