// @vitest-environment jsdom
/**
 * Браузерный Sentry: поведение `lib/monitoring/capture-client.ts` и его подключения.
 *
 * Sentry у нас выключен намеренно: DSN пуст, отчёты за границу не отправляем (заказчица не хочет). Код при этом
 * подгружается динамически и только при заданном DSN (иначе ~165 КБ до сжатия лежали бы в первой загрузке каждой
 * страницы). Исходник эту переделку охраняет регулярками (`tests/site-speed-rule.test.ts`), но не поведение:
 * здесь проверено то, чего регулярки не видят —
 *  - DSN задан: Sentry поднимается ровно с `{ dsn, sendDefaultPii: false }`. Флаг важен для заказчицы: без него
 *    Sentry стал бы отправлять адрес и прочие персональные сведения посетителя;
 *  - DSN пуст: ни `init`, ни сам импорт чанка не происходят;
 *  - сбой загрузки чанка или самого `init` страницу не ломает (нет необработанного отказа);
 *  - `instrumentation-client.ts` действительно вызывает запуск (иначе вся цепочка тихо перестала бы работать).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  /** Сколько раз код Sentry реально загружали (фабрика подмены вызывается при импорте). */
  loads: 0,
  /** Имитация сбоя загрузки чанка: импорт отказывает. */
  failLoad: false,
}));

/**
 * Подмена Sentry. Регистрируется заново перед каждым тестом (`vi.doMock`), а не один раз на файл (`vi.mock`):
 * готовый результат фабрики Vitest запоминает и после `resetModules`, и счётчик загрузок врал бы нулём.
 */
const mockSentry = () =>
  vi.doMock("@sentry/nextjs", () => {
    sentry.loads += 1;
    if (sentry.failLoad) throw new Error("Loading chunk failed");
    return { init: sentry.init, captureException: sentry.captureException };
  });

const DSN = "https://key@sentry.example.invalid/1";

/** Запуск и отправка идут через динамический импорт: пара макрозадач, чтобы «ничего не случилось» было правдой. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

beforeEach(() => {
  vi.resetModules();
  mockSentry();
  sentry.loads = 0;
  sentry.failLoad = false;
  sentry.init.mockReset();
  sentry.captureException.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initClientSentry", () => {
  it("DSN задан: Sentry поднимается с этим DSN и sendDefaultPii: false — ничего лишнего", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    const { initClientSentry } = await import("@/lib/monitoring/capture-client");

    initClientSentry();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
    // Точное равенство, не «содержит»: добавленный без обсуждения параметр (трассировки, повтор сессии,
    // отправка персональных сведений) заказчица увидела бы только в счёте за трафик за границу
    expect(sentry.init).toHaveBeenCalledWith({ dsn: DSN, sendDefaultPii: false });
  });

  it("DSN пуст (Sentry выключен намеренно): init не вызван и сам код Sentry не загружался", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { initClientSentry } = await import("@/lib/monitoring/capture-client");

    initClientSentry();
    await settle();

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.loads, "без DSN чанк Sentry не должен запрашиваться вовсе").toBe(0);
  });

  it("DSN читается при вызове, а не при загрузке модуля: тот же модуль, DSN появился позже — Sentry поднимается", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { initClientSentry } = await import("@/lib/monitoring/capture-client");
    initClientSentry();
    await settle();
    expect(sentry.init).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    initClientSentry();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
  });

  it("чанк не загрузился (сеть, блокировщик): страницу это не ломает, необработанного отказа нет", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    sentry.failLoad = true;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { initClientSentry } = await import("@/lib/monitoring/capture-client");
      expect(() => initClientSentry()).not.toThrow();
      await settle();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    expect(sentry.loads, "загрузку чанка действительно пробовали").toBe(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("сам init бросил: так же без последствий для страницы", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    sentry.init.mockImplementation(() => {
      throw new Error("init failed");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { initClientSentry } = await import("@/lib/monitoring/capture-client");
      expect(() => initClientSentry()).not.toThrow();
      await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
      await settle();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("captureClientException", () => {
  it("DSN задан: ошибка уходит в Sentry как есть", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    const { captureClientException } = await import("@/lib/monitoring/capture-client");
    const error = new Error("boom");

    captureClientException(error);

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledWith(error));
  });

  it("DSN пуст: ничего не отправляется и код Sentry не загружается", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { captureClientException } = await import("@/lib/monitoring/capture-client");

    captureClientException(new Error("boom"));
    await settle();

    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.loads).toBe(0);
  });
});

describe("instrumentation-client.ts", () => {
  it("при заданном DSN сам запускает Sentry с sendDefaultPii: false (файл подхватывает Next, вызывать его больше некому)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);

    await import("@/instrumentation-client");

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledWith({ dsn: DSN, sendDefaultPii: false }));
  });

  it("без DSN ничего не загружает", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await import("@/instrumentation-client");
    await settle();

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.loads).toBe(0);
  });
});
