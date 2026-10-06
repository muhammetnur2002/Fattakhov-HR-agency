// @vitest-environment jsdom
/**
 * «Уведомления на это устройство» — что видит человек.
 *
 * Состояние узнаётся в браузере: умеет ли он пуши вообще, установлен ли
 * кабинет на экран «Домой» (на iPhone без этого пушей нет), не запрещены
 * ли уведомления, есть ли подписка — и знает ли о ней сервер именно за
 * этим человеком. Каждому состоянию — своя подсказка и своя кнопка;
 * «включено» без подписки на сервере было бы неправдой.
 *
 * Браузерные API подменены: jsdom не умеет ни воркеры, ни пуши.
 */
import { createHash } from "node:crypto";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
  removeOtherPushDevicesAction: vi.fn(),
  sendTestPushAction: vi.fn(),
}));
vi.mock("@/app/actions/push", () => actions);

import { PushDevice } from "@/components/settings/push-device";
import { inAppBrowser } from "@/lib/notifications/push-client";

/** Открытый ключ сервера: 65 байт, как у настоящего P-256. */
const PUBLIC_KEY = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => i)]).toString(
  "base64url",
);
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/this-device";

/** Строки браузеров — как их присылают настоящие устройства. */
const UA = {
  telegramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.146 Mobile Safari/537.36 Telegram-Android/11.1.3 (Samsung SM-S918B; Android 14; SDK 34; HIGH)",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 13; 2201117TY Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  androidYandex:
    "Mozilla/5.0 (Linux; arm_64; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.6.0.123 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iphoneYandex:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 YaBrowser/24.7.4.540.10 SA/3 Mobile/15E148 Safari/604.1",
  /** Встроенный браузер приложения на iPhone (WKWebView) — и кабинет с экрана «Домой». */
  iphoneWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  /** iPad называет себя Mac'ом; отличает его только сенсорный экран. */
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macWebView: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
};

function userAgent(ua: string, touchPoints = 0) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints, configurable: true });
}

/** Кабинет открыт с экрана «Домой». */
function standalone() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(display-mode: standalone)",
    media: query,
  }));
}

function hash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url");
}

type FakeSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
};

function fakeSubscription(endpoint: string): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint, keys: { p256dh: "B", auth: "A" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

/** Браузер, который умеет пуши; current — подписка, которая в нём уже есть. */
function capableBrowser(options: {
  permission?: NotificationPermission;
  current?: FakeSubscription | null;
  next?: FakeSubscription[];
}) {
  let current = options.current ?? null;
  const queue = [...(options.next ?? [])];
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = queue.shift() ?? fakeSubscription(ENDPOINT);
      return current;
    }),
  };
  const registration = { pushManager };
  const serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => registration),
  };
  const permission = { value: options.permission ?? "default" };
  const Notification = {
    get permission() {
      return permission.value;
    },
    requestPermission: vi.fn(async () => {
      permission.value = "granted";
      return "granted";
    }),
  };

  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", Notification);
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  return { pushManager, serviceWorker, Notification };
}

function renderDevice(devices: { id: string; endpointHash: string }[] = [], paused = false) {
  return render(<PushDevice publicKey={PUBLIC_KEY} devices={devices} paused={paused} />);
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // serviceWorker и maxTouchPoints задаются на сам navigator — убираем руками
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
  Object.values(actions).forEach((fn) => fn.mockReset());
});

describe("что умеет браузер", () => {
  it("без поддержки пушей — честно и с подсказкой, где получится", async () => {
    renderDevice();
    expect(await screen.findByText(/не умеет получать уведомления/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Включить" })).toBeNull();
  });

  it("iPhone во вкладке — сначала установить кабинет на экран «Домой»", async () => {
    userAgent(UA.iphoneSafari);
    renderDevice();
    expect(await screen.findByText(/На экран „Домой“/)).toBeInTheDocument();
    expect(screen.getByText(/iOS 16\.4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Включить" })).toBeNull();
  });

  it("уведомления запрещены в браузере — объясняем, где разрешить", async () => {
    capableBrowser({ permission: "denied" });
    renderDevice();
    expect(await screen.findByText(/запрещены в настройках браузера/)).toBeInTheDocument();
    expect(screen.queryByText(/самому браузеру/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Включить" })).toBeNull();
  });

  it("запрет на Android — ещё и про уведомления самого браузера в настройках телефона", async () => {
    userAgent(UA.androidChrome);
    capableBrowser({ permission: "denied" });
    renderDevice();
    expect(await screen.findByText(/включите уведомления самому браузеру/)).toBeInTheDocument();
  });
});

describe("встроенный браузер приложения", () => {
  it("Telegram на Android — открыть в обычном браузере, что бы встроенный ни умел", async () => {
    userAgent(UA.telegramAndroid);
    capableBrowser({});
    renderDevice();
    expect(await screen.findByText(/открыт внутри Telegram/)).toBeInTheDocument();
    expect(screen.getByText(/«Открыть в браузере»/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Включить" })).toBeNull();
  });

  it("WebView другого приложения на Android — без имени, тот же совет", async () => {
    userAgent(UA.androidWebView);
    renderDevice();
    expect(
      await screen.findByText(/во встроенном браузере приложения — там уведомления не приходят/),
    ).toBeInTheDocument();
    expect(screen.getByText(/«Открыть в браузере»/)).toBeInTheDocument();
  });

  it("встроенный браузер на iPhone — сначала в Safari, потом на экран «Домой»", async () => {
    userAgent(UA.iphoneWebView);
    renderDevice();
    expect(await screen.findByText(/«Открыть в Safari»/)).toBeInTheDocument();
  });

  it("кабинет с экрана «Домой» на iPhone — не встроенный браузер, пуши включаются", async () => {
    // Строка та же, что у встроенного браузера: «Safari/» в ней нет
    userAgent(UA.iphoneWebView);
    standalone();
    capableBrowser({});
    renderDevice();
    expect(await screen.findByRole("button", { name: "Включить" })).toBeInTheDocument();
  });

  it.each([
    ["Telegram на Android", UA.telegramAndroid, 0, { app: "Telegram" }],
    ["WebView на Android", UA.androidWebView, 0, { app: null }],
    ["WKWebView на iPhone", UA.iphoneWebView, 0, { app: null }],
    ["WKWebView на iPad", UA.macWebView, 5, { app: null }],
    ["Chrome на Android", UA.androidChrome, 0, null],
    ["Яндекс Браузер на Android", UA.androidYandex, 0, null],
    ["Samsung Internet", UA.androidSamsung, 0, null],
    ["Safari на iPhone", UA.iphoneSafari, 0, null],
    ["Chrome на iPhone", UA.iphoneChrome, 0, null],
    ["Яндекс Браузер на iPhone", UA.iphoneYandex, 0, null],
    ["Safari на iPad", UA.ipadSafari, 5, null],
    // Приложение на Mac'е — не телефон: подсказка про iPhone тут ни к чему
    ["приложение на Mac", UA.macWebView, 0, null],
  ])("%s", (_name, ua, touchPoints, expected) => {
    userAgent(ua, touchPoints);
    expect(inAppBrowser()).toEqual(expected);
  });
});

describe("это устройство", () => {
  it("не подписано — кнопка «Включить»", async () => {
    capableBrowser({});
    renderDevice();
    expect(await screen.findByRole("button", { name: "Включить" })).toBeInTheDocument();
  });

  it("подписано и сервер знает подписку за этим человеком — «Отключить»", async () => {
    // Отпечаток браузер считает через Web Crypto, а сервер прислал свой,
    // из node:crypto (hash выше — как endpointHash в push.ts): без
    // совпадения «включено» не показалось бы никогда
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    renderDevice([{ id: "1", endpointHash: hash(ENDPOINT) }]);
    expect(
      await screen.findByRole("button", { name: "Отключить на этом устройстве" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Включены на этом устройстве.")).toBeInTheDocument();
  });

  it("подписка в браузере есть, но не этого человека — не «включено»", async () => {
    // С этого устройства раньше подписывался другой
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    renderDevice([]);
    expect(await screen.findByRole("button", { name: "Включить" })).toBeInTheDocument();
  });

  it("снятая галочка — предупреждение, что сейчас не приходит ничего", async () => {
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    renderDevice([{ id: "1", endpointHash: hash(ENDPOINT) }], true);
    expect(await screen.findByText(/не приходят ни на одно устройство/)).toBeInTheDocument();
  });

  it("остальные устройства видны — и их можно отключить отсюда", async () => {
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    actions.removeOtherPushDevicesAction.mockResolvedValue({ ok: "Выключено ещё на 2 устройствах." });
    renderDevice([
      { id: "1", endpointHash: hash(ENDPOINT) },
      { id: "2", endpointHash: hash("https://web.push.apple.com/old-iphone") },
      { id: "3", endpointHash: hash("https://fcm.googleapis.com/fcm/send/old-laptop") },
    ]);

    expect(await screen.findByText(/Ещё включены на 2 устройствах/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Отключить там" }));
    expect(actions.removeOtherPushDevicesAction).toHaveBeenCalledWith({ keepEndpoint: ENDPOINT });
  });
});

describe("включение", () => {
  it("разрешение → подписка → сервер; затем «Отключить»", async () => {
    const browser = capableBrowser({});
    actions.subscribePushAction.mockResolvedValue({
      ok: "Готово: на это устройство отправлено проверочное уведомление.",
    });
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: "Включить" }));

    expect(browser.Notification.requestPermission).toHaveBeenCalled();
    expect(browser.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(actions.subscribePushAction).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT }),
    );
    expect(await screen.findByText(/проверочное уведомление/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Отключить на этом устройстве" }),
    ).toBeInTheDocument();
  });

  it("служба уведомлений не ответила на Android — подсказка про телефоны без сервисов Google", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    userAgent(UA.androidChrome);
    const browser = capableBrowser({});
    browser.pushManager.subscribe.mockRejectedValue(
      new DOMException("Registration failed - push service error", "AbortError"),
    );
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: "Включить" }));

    expect(await screen.findByText(/без сервисов Google/)).toBeInTheDocument();
    expect(actions.subscribePushAction).not.toHaveBeenCalled();
  });

  it("служба уведомлений не ответила на компьютере — позже или в другом браузере", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const browser = capableBrowser({});
    browser.pushManager.subscribe.mockRejectedValue(
      new DOMException("Registration failed - push service error", "AbortError"),
    );
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: "Включить" }));

    expect(await screen.findByText(/в другом браузере/)).toBeInTheDocument();
    expect(screen.queryByText(/без сервисов Google/)).toBeNull();
  });

  it("отказ в разрешении — подписки нет, на сервер ничего не уходит", async () => {
    const browser = capableBrowser({});
    browser.Notification.requestPermission.mockResolvedValue("denied");
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: "Включить" }));

    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(actions.subscribePushAction).not.toHaveBeenCalled();
  });

  it("служба не узнала прежнюю подписку браузера — одна попытка с новой", async () => {
    const stale = fakeSubscription("https://fcm.googleapis.com/fcm/send/stale");
    const browser = capableBrowser({
      permission: "granted",
      current: stale,
      next: [fakeSubscription(ENDPOINT)],
    });
    actions.subscribePushAction
      .mockResolvedValueOnce({ resubscribe: true, error: "не узнала" })
      .mockResolvedValueOnce({ ok: "Готово" });
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: "Включить" }));

    await waitFor(() => expect(actions.subscribePushAction).toHaveBeenCalledTimes(2));
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(browser.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(actions.subscribePushAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT }),
    );
    expect(await screen.findByText("Готово")).toBeInTheDocument();
  });
});

describe("выключение", () => {
  it("сначала сервер, потом браузер", async () => {
    const subscription = fakeSubscription(ENDPOINT);
    capableBrowser({ permission: "granted", current: subscription });
    actions.unsubscribePushAction.mockResolvedValue({ ok: "Уведомления на этом устройстве выключены." });
    renderDevice([{ id: "1", endpointHash: hash(ENDPOINT) }]);

    await userEvent.click(
      await screen.findByRole("button", { name: "Отключить на этом устройстве" }),
    );

    expect(actions.unsubscribePushAction).toHaveBeenCalledWith({ endpoint: ENDPOINT });
    await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Включить" })).toBeInTheDocument();
  });
});

describe("«Отправить проверочное уведомление»", () => {
  const BUTTON = "Отправить проверочное уведомление";

  it("кнопки нет, пока ни на одном устройстве уведомления не включены", async () => {
    capableBrowser({});
    renderDevice([]);
    await screen.findByRole("button", { name: "Включить" });
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("устройство включено — кнопка есть; результат по каждому устройству виден", async () => {
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    actions.sendTestPushAction.mockResolvedValue({
      summary: "Принято службой уведомлений: 1 из 2.",
      devices: [
        { label: "Chrome · Windows", service: "Google", state: "sent", text: "принято службой уведомлений (Google)." },
        { label: "Safari · iPhone", service: "Apple", state: "gone", text: "подписка погасла — устройство удалено." },
      ],
      note: "Галочка снята.",
    });
    renderDevice([{ id: "1", endpointHash: hash(ENDPOINT) }]);

    await userEvent.click(await screen.findByRole("button", { name: BUTTON }));

    expect(await screen.findByText("Принято службой уведомлений: 1 из 2.")).toBeInTheDocument();
    expect(screen.getByText("Chrome · Windows:")).toBeInTheDocument();
    expect(screen.getByText(/принято службой уведомлений \(Google\)/)).toBeInTheDocument();
    expect(screen.getByText("Safari · iPhone:")).toBeInTheDocument();
    expect(screen.getByText(/подписка погасла — устройство удалено/)).toBeInTheDocument();
    expect(screen.getByText("Галочка снята.")).toBeInTheDocument();
    expect(actions.sendTestPushAction).toHaveBeenCalledTimes(1);
  });

  it("устройство на сервере есть, а в этом браузере выключено — проверить всё равно можно", async () => {
    capableBrowser({});
    renderDevice([{ id: "1", endpointHash: hash("https://fcm.googleapis.com/fcm/send/other") }]);
    expect(await screen.findByRole("button", { name: BUTTON })).toBeInTheDocument();
  });

  it("отказ сервера показан ошибкой", async () => {
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    actions.sendTestPushAction.mockResolvedValue({ error: "Слишком много попыток." });
    renderDevice([{ id: "1", endpointHash: hash(ENDPOINT) }]);

    await userEvent.click(await screen.findByRole("button", { name: BUTTON }));

    expect(await screen.findByText("Слишком много попыток.")).toBeInTheDocument();
  });

  it("сбой самого вызова — человеку понятная строка, а не тишина", async () => {
    capableBrowser({ permission: "granted", current: fakeSubscription(ENDPOINT) });
    actions.sendTestPushAction.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderDevice([{ id: "1", endpointHash: hash(ENDPOINT) }]);

    await userEvent.click(await screen.findByRole("button", { name: BUTTON }));

    await waitFor(() =>
      expect(screen.getByText(/Не удалось отправить проверочное уведомление/)).toBeInTheDocument(),
    );
  });
});
