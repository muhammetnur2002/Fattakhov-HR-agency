/**
 * Воркер пуш-уведомлений (public/push-sw.js) без браузера.
 *
 * Файл исполняется как есть, в отдельном контексте с поддельными self,
 * clients и registration, — так проверяется ровно то, что получит
 * браузер, а не пересказ. Важнее всего две вещи: уведомление
 * показывается всегда (иначе Safari отзывает подписку), и нажатие
 * открывает только адреса самого кабинета — чужую ссылку воркер
 * не откроет, даже если она окажется в содержимом.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(path.join(__dirname, "..", "public", "push-sw.js"), "utf8");
const ORIGIN = "https://my.fattakhovhr.ru";

type FakeClient = {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
};

function client(url: string, options: { navigateFails?: boolean } = {}): FakeClient {
  const fake: FakeClient = {
    url,
    focus: vi.fn(async () => fake),
    navigate: vi.fn(async (to: string) => {
      if (options.navigateFails) throw new TypeError("не под этим воркером");
      fake.url = to;
      return fake;
    }),
  };
  return fake;
}

/** Поднять воркер с заданными вкладками: controlled — под этим воркером. */
function boot(tabs: { all?: FakeClient[]; controlled?: FakeClient[] } = {}) {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => null);

  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: {
      claim: vi.fn(async () => {}),
      openWindow,
      matchAll: vi.fn(async (options: { includeUncontrolled?: boolean }) =>
        options.includeUncontrolled ? (tabs.all ?? []) : (tabs.controlled ?? []),
      ),
    },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, handler),
  };
  vm.runInNewContext(SOURCE, { self, URL, console });

  /** Отдать событие и дождаться всего, что воркер передал в waitUntil. */
  async function dispatch(type: string, event: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  return { self, dispatch, showNotification, openWindow };
}

function pushEvent(payload: unknown) {
  return {
    data: {
      json: () => (typeof payload === "string" ? JSON.parse(payload) : payload),
    },
  };
}

function clickEvent(url: unknown) {
  return { notification: { data: { url }, close: vi.fn() } };
}

describe("пуш → уведомление", () => {
  it("показывает текст, иконку кабинета и ссылку в кабинет", async () => {
    const worker = boot();
    await worker.dispatch(
      "push",
      pushEvent({
        title: "Новый комментарий в обсуждении",
        body: "Подробности — в кабинете",
        url: "/a/applications/app_13",
        tag: "NEW_COMMENT:vac_1",
      }),
    );

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = worker.showNotification.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(title).toBe("Новый комментарий в обсуждении");
    expect(options).toMatchObject({
      body: "Подробности — в кабинете",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-monochrome.png",
      tag: "NEW_COMMENT:vac_1",
      renotify: true,
      data: { url: `${ORIGIN}/a/applications/app_13` },
    });
  });

  it("испорченное содержимое — уведомление всё равно показывается", async () => {
    const worker = boot();
    await worker.dispatch("push", pushEvent("{не json"));

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = worker.showNotification.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(title).toBe("Fattakhov HR");
    // Без ярлыка повторный сигнал не нужен — и браузер его не примет
    expect(options.renotify).toBe(false);
    expect(options.data).toEqual({ url: `${ORIGIN}/` });
  });

  it("пустой пуш — тоже уведомление", async () => {
    const worker = boot();
    await worker.dispatch("push", { data: null });
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it("чужой адрес в содержимом не попадает в уведомление", async () => {
    const worker = boot();
    await worker.dispatch("push", pushEvent({ title: "т", url: "https://evil.example/login" }));
    const [, options] = worker.showNotification.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(options.data).toEqual({ url: `${ORIGIN}/` });
  });
});

describe("нажатие на уведомление", () => {
  const target = `${ORIGIN}/a/applications/app_13`;

  it("вкладка с этой страницей уже открыта — показываем её", async () => {
    const open = client(target);
    const worker = boot({ all: [open], controlled: [open] });

    await worker.dispatch("notificationclick", clickEvent("/a/applications/app_13"));

    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("открыт кабинет на другой странице — переводим вкладку, а не плодим новые", async () => {
    const tab = client(`${ORIGIN}/a`);
    const worker = boot({ all: [tab], controlled: [tab] });

    await worker.dispatch("notificationclick", clickEvent("/a/applications/app_13"));

    expect(tab.navigate).toHaveBeenCalledWith(target);
    expect(tab.focus).toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("вкладка не даёт себя перевести — новое окно", async () => {
    const stubborn = client(`${ORIGIN}/a`, { navigateFails: true });
    const worker = boot({ all: [stubborn], controlled: [stubborn] });

    await worker.dispatch("notificationclick", clickEvent("/a/applications/app_13"));

    expect(worker.openWindow).toHaveBeenCalledWith(target);
  });

  it("кабинет не открыт — новое окно по ссылке", async () => {
    const worker = boot();
    await worker.dispatch("notificationclick", clickEvent("/a/applications/app_13"));
    expect(worker.openWindow).toHaveBeenCalledWith(target);
  });

  it("чужой адрес не открывается — вместо него кабинет", async () => {
    const worker = boot();
    await worker.dispatch("notificationclick", clickEvent("https://evil.example/phish"));
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it("уведомление закрывается по нажатию", async () => {
    const worker = boot();
    const event = clickEvent("/a");
    await worker.dispatch("notificationclick", event);
    expect(event.notification.close).toHaveBeenCalled();
  });
});
