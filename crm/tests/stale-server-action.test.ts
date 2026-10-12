/**
 * «Failed to find Server Action» после выкатки — не повод будить владельца.
 *
 * 08.10.2026 после четырёх выкаток за день в ВК пришло «Сбой в платформе…
 * Failed to find Server Action». Идентификаторы действий зависят от ключа
 * сборки, поэтому открытая до выкатки вкладка ломается на следующем
 * действии. Данные не портятся; в журнал строку пишем, оповещение — нет.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { reportFailure, captureRequestError } = vi.hoisted(() => ({
  reportFailure: vi.fn(),
  captureRequestError: vi.fn(),
}));

vi.mock("@/lib/monitoring/alerts", () => ({ reportFailure }));
vi.mock("@sentry/nextjs", () => ({ captureRequestError, init: vi.fn() }));

import { onRequestError } from "@/instrumentation";
import { isStaleServerActionError } from "@/lib/monitoring/stale-action";

const STALE = 'Failed to find Server Action "40a1…". This request might be from an older or newer deployment.';

const request = (over: Record<string, unknown> = {}) =>
  ({ method: "POST", path: "/?utm=secret", headers: { "user-agent": "Mozilla/5.0 test" }, ...over }) as never;
const context = {} as never;

describe("изнанка выкатки: устаревшее серверное действие", () => {
  beforeEach(() => {
    reportFailure.mockReset();
    captureRequestError.mockReset();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
  });

  it("узнаёт сообщение с идентификатором и без него", () => {
    expect(isStaleServerActionError(new Error(STALE))).toBe(true);
    expect(isStaleServerActionError(new Error("Failed to find Server Action. This request might be from an older or newer deployment."))).toBe(true);
    expect(isStaleServerActionError(STALE)).toBe(true);
  });

  it("не принимает за него другие ошибки", () => {
    expect(isStaleServerActionError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(false);
    expect(isStaleServerActionError(null)).toBe(false);
    expect(isStaleServerActionError({ message: STALE })).toBe(false);
  });

  it("onRequestError: в журнал одной строкой, без оповещения и без Sentry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await onRequestError(new Error(STALE), request(), context);

    expect(reportFailure).not.toHaveBeenCalled();
    expect(captureRequestError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    // Только путь без строки запроса: в ней бывают токены
    expect(warn.mock.calls[0]).toEqual(["[stale-server-action]", "POST", "/", "Mozilla/5.0 test"]);
    warn.mockRestore();
  });

  it("onRequestError: настоящий сбой по-прежнему доходит до оповещения", async () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    await onRequestError(error, request(), context);

    expect(captureRequestError).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith({ where: "запрос", error, path: "/" });
  });
});
