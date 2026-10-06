import {
  subscribePushAction,
  unsubscribePushAction,
  type PushActionResult,
} from "@/app/actions/push";

/**
 * Пуш на стороне браузера: воркер, подписка, «это ли устройство».
 *
 * Только для клиентских компонентов кабинета. Всё, что трогает
 * navigator и window, — внутри функций: модуль импортируется и при
 * серверной отрисовке, где ни того, ни другого нет.
 */

/**
 * Имя воркера — не общее sw.js: у области "/" обработчик может быть
 * только один, и второй воркер с общим именем (офлайн-кеш, PWA-плагин)
 * молча заменил бы этот.
 */
export const PUSH_WORKER_URL = "/push-sw.js";

export type PushSupport =
  | "supported"
  /** Браузер не умеет пуши вовсе. */
  | "unsupported"
  /** Встроенный браузер приложения: ссылку открыли прямо в Telegram или ВК. */
  | "in-app"
  /** iPhone или iPad, кабинет открыт во вкладке, а не с экрана «Домой». */
  | "ios-browser"
  /** Кабинет установлен на экран «Домой», но iOS старше 16.4. */
  | "ios-outdated";

/** iPhone или iPad. iPadOS называет себя Mac'ом — его выдаёт сенсорный экран. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/** Открыт ли кабинет как приложение с экрана «Домой», а не во вкладке. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Приложение, во встроенном браузере которого открыт кабинет; null — не назвалось. */
export type InAppBrowser = { app: "Telegram" | "ВКонтакте" | null };

/**
 * Открыт ли кабинет во встроенном браузере приложения.
 *
 * Ссылку из чата открывают прямо в мессенджере, а там пушей нет: даже
 * если такой браузер и подпишется, уведомления будут жить внутри чужого
 * приложения. Telegram и ВК называют себя в строке браузера; остальных
 * выдаёт сам встроенный браузер: на Android — метка «wv» (WebView),
 * на iPhone — отсутствие «Safari/», которое есть у Safari, Chrome,
 * Firefox и Яндекс Браузера. Кабинет с экрана «Домой» тоже пишет себя
 * без «Safari/», и именно там пуши работают — его отличает isStandalone().
 */
export function inAppBrowser(): InAppBrowser | null {
  const ua = navigator.userAgent;
  if (/Telegram/i.test(ua)) return { app: "Telegram" };
  if (/VKAndroidApp|vkclient|com\.vk\./i.test(ua)) return { app: "ВКонтакте" };
  if (/Android/.test(ua) && /\bwv\)/.test(ua)) return { app: null };
  if (isIos() && !isStandalone() && !/Safari\//.test(ua)) return { app: null };
  return null;
}

/**
 * Умеет ли браузер пуши.
 *
 * Встроенный браузер приложения — первым: что бы он ни умел, человеку
 * нужен обычный браузер. На iPhone и iPad (iOS 16.4+) пуши получает
 * только кабинет, установленный на экран «Домой»; во вкладке Safari нет
 * ни PushManager, ни Notification. Это не «не поддерживается»,
 * а «сначала установите» — и человеку надо сказать именно это.
 */
export function pushSupport(): PushSupport {
  if (inAppBrowser()) return "in-app";
  const capable =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (capable) return "supported";
  if (isIos()) return isStandalone() ? "ios-outdated" : "ios-browser";
  return "unsupported";
}

/**
 * Зарегистрировать воркер (повторная регистрация того же файла ничего
 * не ломает и заодно проверяет обновление). updateViaCache: "none" —
 * новая версия воркера доходит без оглядки на кеш браузера.
 */
export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(PUSH_WORKER_URL, {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("[пуш] воркер не зарегистрирован", error);
    return null;
  }
}

/** Открытый ключ сервера (base64url) — в виде, который ждёт pushManager.subscribe. */
export function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Подписан ли браузер на нынешний ключ сервера. После смены ключей
 * старая подписка в браузере жива, но служба уведомлений отвергнет
 * всё, что подписано новым ключом, — такую надо заменить.
 */
export function subscribedWithKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  // Браузер ключ не сообщает — сравнить не с чем, считаем подходящим
  if (!current) return true;
  const actual = new Uint8Array(current);
  const expected = applicationServerKey(publicKey);
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
}

/** Тот же SHA-256 в base64url, что считает сервер (endpointHash в push.ts). */
export async function endpointFingerprint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Забыть это устройство при выходе из кабинета.
 *
 * Иначе следующий, кто войдёт с этого телефона или компьютера, получал
 * бы уведомления прежнего хозяина — подписка живёт в браузере, а не
 * в сессии. Вернувшемуся хозяину достаточно нажать «Включить» снова.
 *
 * Выход важнее: ни сбой, ни медленная сеть его не задерживают — на
 * ответ сервера отведено три секунды, ошибки только в журнал.
 */
export async function forgetThisDevice(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await Promise.race([
      unsubscribePushAction({ endpoint: subscription.endpoint }),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    await subscription.unsubscribe();
  } catch (error) {
    console.warn("[пуш] устройство не отписано при выходе", error);
  }
}

/**
 * Подписка не удалась уже после разрешения: браузер не достучался
 * до своей службы уведомлений. На Android это сервисы Google — на
 * телефонах без них (новые Huawei и Honor) пуш из браузера не работает.
 */
export class PushServiceUnavailable extends Error {}

/** Воркер, который так и не стал активным, не должен вешать кнопку навсегда. */
const WORKER_READY_TIMEOUT_MS = 15_000;

/**
 * Подписать браузер и сохранить подписку за вошедшим.
 *
 * Уже имеющуюся подписку браузера берём, если она на нынешний ключ:
 * адрес тот же — и сервер просто перенесёт её к этому человеку. fresh —
 * служба её не узнала: отписываемся и подписываемся заново.
 */
async function subscribeDevice(
  registration: ServiceWorkerRegistration,
  publicKey: string,
  fresh: boolean,
): Promise<{ result: PushActionResult; endpoint: string }> {
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && (fresh || !subscribedWithKey(subscription, publicKey))) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
    } catch (cause) {
      // Разрешение к этому моменту уже есть — отказала служба уведомлений
      throw new PushServiceUnavailable("служба уведомлений браузера недоступна", { cause });
    }
  }
  const result = await subscribePushAction(subscription.toJSON());
  return { result, endpoint: subscription.endpoint };
}

export function pushServiceText(): string {
  return isAndroid()
    ? "Браузер не смог подключиться к службе уведомлений телефона. Так бывает на " +
        "телефонах без сервисов Google — например, на новых Huawei и Honor: пуши " +
        "из браузера там не работают, уведомления лучше получать на почту. На других " +
        "телефонах попробуйте ещё раз позже."
    : "Браузер не смог подключиться к своей службе уведомлений. Попробуйте ещё раз " +
        "позже или в другом браузере.";
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("воркер уведомлений не запустился")),
        WORKER_READY_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Включить уведомления на этом устройстве: разрешение, воркер, подписка,
 * сохранение за вошедшим. Общий путь для настроек и плашки-предложения.
 *
 * Разрешение — первым делом, прямо из нажатия: Safari спрашивает только
 * в ответ на жест человека, и ожидание чего-то до запроса (сеть,
 * регистрация воркера) может этот жест «потерять».
 *
 * Бросает PushServiceUnavailable, если подписаться не дала служба
 * уведомлений браузера; остальные сбои — обычные исключения.
 */
export async function enableThisDevice(
  publicKey: string,
): Promise<
  | { kind: "permission"; permission: NotificationPermission }
  | { kind: "done"; result: PushActionResult; endpoint: string }
> {
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { kind: "permission", permission };

  await registerPushWorker();
  const registration = await withTimeout(navigator.serviceWorker.ready);

  let attempt = await subscribeDevice(registration, publicKey, false);
  // Браузер держал подписку, которую служба уже погасила, — одна
  // попытка с новой подпиской, без участия человека
  if (attempt.result.resubscribe) {
    attempt = await subscribeDevice(registration, publicKey, true);
  }
  return { kind: "done", ...attempt };
}
