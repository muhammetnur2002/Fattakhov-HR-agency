/**
 * Отметка фонового процесса: когда /api/health/worker отвечает 503.
 *
 * Ошибка здесь не видна ни в типах, ни в интерфейсе: слишком строгий порог
 * будил бы по ночам ложной тревогой при каждой выкатке, слишком мягкий —
 * молчал бы, пока письма клиентам не уходят. Чистая функция, без базы.
 */
import { describe, expect, it } from "vitest";

import {
  WORKER_STALE_AFTER_MS,
  workerHealth,
} from "@/lib/monitoring/worker-heartbeat";

const now = new Date("2026-10-04T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;

describe("workerHealth", () => {
  it("свежий удачный проход — в порядке", () => {
    const h = workerHealth({ lastTickAt: ago(MIN), lastOkAt: ago(MIN) }, now);
    expect(h).toEqual({ ok: true, minutesSinceOk: 1 });
  });

  it("перезапуск при выкатке (несколько минут без прохода) — ещё в порядке", () => {
    const h = workerHealth(
      { lastTickAt: ago(4 * MIN), lastOkAt: ago(4 * MIN) },
      now,
    );
    expect(h.ok).toBe(true);
  });

  it("ровно на пороге — ещё в порядке, сразу за ним — нет", () => {
    expect(
      workerHealth(
        { lastTickAt: ago(WORKER_STALE_AFTER_MS), lastOkAt: ago(WORKER_STALE_AFTER_MS) },
        now,
      ).ok,
    ).toBe(true);
    expect(
      workerHealth(
        {
          lastTickAt: ago(WORKER_STALE_AFTER_MS + 1),
          lastOkAt: ago(WORKER_STALE_AFTER_MS + 1),
        },
        now,
      ).ok,
    ).toBe(false);
  });

  it("проходов нет давно — процесс остановлен или завис", () => {
    const h = workerHealth(
      { lastTickAt: ago(30 * MIN), lastOkAt: ago(30 * MIN) },
      now,
    );
    expect(h.ok).toBe(false);
    expect(h.minutesSinceOk).toBe(30);
    expect(h.reason).toMatch(/проходов нет/);
  });

  it("проходы идут, но падают — подсказка про письма о сбое", () => {
    const h = workerHealth({ lastTickAt: ago(MIN), lastOkAt: ago(45 * MIN) }, now);
    expect(h.ok).toBe(false);
    expect(h.reason).toMatch(/падают/);
  });

  it("удачных проходов не было ни разу", () => {
    const h = workerHealth({ lastTickAt: ago(MIN), lastOkAt: null }, now);
    expect(h).toMatchObject({ ok: false, minutesSinceOk: null });
    expect(h.reason).toMatch(/падают/);
  });

  it("отметок нет вовсе — процесс не запускался", () => {
    const h = workerHealth(null, now);
    expect(h.ok).toBe(false);
    expect(h.reason).toMatch(/не запускался/);
  });
});
