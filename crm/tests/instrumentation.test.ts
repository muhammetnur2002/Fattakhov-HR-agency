/**
 * Старт сервера и ошибки запросов (instrumentation.ts).
 *
 * Первое — неверный прод-конфиг обязан останавливать процесс. Next ловит
 * исключение из register(), пишет «Failed to prepare server» и живёт
 * дальше, отдавая 500 на каждый адрес: контейнер «running», restart
 * не срабатывает, причина только в логах. Поэтому register() выходит
 * сам, с кодом 1, и сначала синхронно пишет причину в stderr.
 *
 * Второе — ошибка запроса уходит и в Sentry (без DSN это пустой вызов),
 * и в сообщение о сбое; путь — без строки запроса, где бывают токены.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ configError: null as Error | null, dictionarySize: 10_000 }));

const { captureRequestError, init, writeSync, reportFailure } = vi.hoisted(() => ({
  captureRequestError: vi.fn(),
  init: vi.fn(),
  writeSync: vi.fn(),
  reportFailure: vi.fn(async () => {}),
}));

vi.mock("@sentry/nextjs", () => ({ captureRequestError, init }));
vi.mock("@/lib/config/production-check", () => ({
  assertProductionConfig: () => {
    if (state.configError) throw state.configError;
  },
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  writeSync,
}));
vi.mock("@/lib/monitoring/alerts", () => ({ reportFailure }));
vi.mock("@/lib/auth/common-passwords", () => ({ commonPasswordCount: () => state.dictionarySize }));

import { onRequestError, register } from "@/instrumentation";

let exit: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.configError = null;
  state.dictionarySize = 10_000;
  captureRequestError.mockClear();
  init.mockClear();
  writeSync.mockClear();
  reportFailure.mockClear();
  exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
});

afterEach(() => {
  exit.mockRestore();
  vi.unstubAllEnvs();
});

describe("словарь слабых паролей в проде", () => {
  it("не загружен — процесс останавливается с кодом 1 и причиной в stderr", async () => {
    vi.stubEnv("NODE_ENV", "production");
    state.dictionarySize = 12; // запасной список вместо файла

    await register();

    expect(exit).toHaveBeenCalledWith(1);
    expect(writeSync.mock.calls[0][1]).toContain("common-passwords.txt");
  });

  it("загружен целиком — старт продолжается", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await register();

    expect(exit).not.toHaveBeenCalled();
  });

  it("вне прода словарь не проверяется: в разработке и тестах он может быть урезан", async () => {
    vi.stubEnv("NODE_ENV", "development");
    state.dictionarySize = 12;

    await register();

    expect(exit).not.toHaveBeenCalled();
  });
});

describe("неверный прод-конфиг", () => {
  it("останавливает процесс с кодом 1, а не оставляет сервер с пятисотками", async () => {
    state.configError = new Error("Платформа не запущена: не заданы S3_*");

    await register();

    expect(exit).toHaveBeenCalledWith(1);
    // Причина — в stderr и синхронно: асинхронный вывод exit оборвал бы
    expect(writeSync).toHaveBeenCalledWith(2, "Платформа не запущена: не заданы S3_*\n");
  });

  it("с исправным конфигом процесс живёт", async () => {
    await register();
    expect(exit).not.toHaveBeenCalled();
  });

  it("в edge-рантайме конфиг не проверяется: там нет ни S3, ни почты", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    state.configError = new Error("не должно сработать");

    await register();

    expect(exit).not.toHaveBeenCalled();
  });
});

describe("ошибка запроса", () => {
  const request = {
    path: "/consent/секретный-токен?utm=1",
    method: "GET",
    headers: {},
  };
  const context = {
    routerKind: "App Router",
    routePath: "/consent/[token]",
    routeType: "render",
    renderSource: "react-server-components",
    revalidateReason: undefined,
  } as const;

  it("уходит в Sentry как раньше и сообщением о сбое — путь без строки запроса", async () => {
    const error = new Error("упало");

    await onRequestError(error, request, context);

    expect(captureRequestError).toHaveBeenCalledWith(error, request, context);
    expect(reportFailure).toHaveBeenCalledWith({
      where: "запрос",
      error,
      path: "/consent/секретный-токен",
    });
  });

  it("из edge сообщение о сбое не шлётся: туда не тянется база", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await onRequestError(new Error("упало"), request, context);

    expect(captureRequestError).toHaveBeenCalled();
    expect(reportFailure).not.toHaveBeenCalled();
  });
});
