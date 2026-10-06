/*
  Воркер пуш-уведомлений кабинета (lib/notifications/push.ts).

  Имя — push-sw.js, а не общее sw.js: у области "/" воркер может быть
  только один, и второй с общим именем (офлайн-кеш, PWA-плагин) молча
  заменил бы этот.

  Обработчика fetch здесь нет намеренно: воркер не вмешивается в загрузку
  страниц, ничего не кеширует и не может показать устаревший кабинет.
  Его работа — показать уведомление и открыть кабинет по нажатию.

  Регистрируется только из кабинетов (components/shell/push-service-worker.tsx
  и настройки уведомлений), на сайте его нет. Файл отдаётся без входа
  (proxy.ts): браузер перепроверяет воркер сам, в том числе когда сессия
  давно истекла, а редирект на /login вместо скрипта сломал бы обновление.
*/

/* global self */

// Если служба доставила пустое или испорченное сообщение — хоть что-то
const FALLBACK_TITLE = "Fattakhov HR";

self.addEventListener("install", function () {
  // Новая версия воркера встаёт сразу, а не после закрытия всех вкладок
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  // Открытые вкладки кабинета переходят под новый воркер сразу: иначе
  // нажатие на уведомление не смогло бы перевести вкладку по ссылке
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  const message = readMessage(event);

  /*
    Показываем всегда, даже если содержимое не разобралось. Подписка
    оформлена с обещанием userVisibleOnly — каждый пуш видим человеку;
    пуш без уведомления браузеры считают нарушением, и Safari после
    нескольких таких отзывает подписку.
  */
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icons/icon-192.png",
      // Значок в строке состояния Android — одноцветный силуэт
      badge: "/icons/icon-monochrome.png",
      lang: "ru",
      // Тот же ярлык заменяет прежнее уведомление, а не ложится рядом;
      // renotify — чтобы замена (сводка BR-30) снова подала сигнал
      tag: message.tag,
      renotify: Boolean(message.tag),
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(openCabinet(sameOriginUrl(data.url)));
});

/** Содержимое пуша: {title, body, url, tag} — строки, остальное отбрасывается. */
function readMessage(event) {
  let raw = {};
  try {
    raw = event.data ? event.data.json() : {};
  } catch {
    raw = {};
  }
  if (!raw || typeof raw !== "object") raw = {};

  return {
    title: text(raw.title) || FALLBACK_TITLE,
    body: text(raw.body) || "",
    url: sameOriginUrl(raw.url),
    tag: text(raw.tag) || undefined,
  };
}

function text(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Только адреса этого же кабинета. Сервер шлёт путь (/a/applications/…),
 * но воркер не доверяет и ему: уведомление, открывающее чужой сайт, —
 * готовая приманка, если однажды в текст попадёт не то.
 */
function sameOriginUrl(value) {
  const origin = self.location.origin;
  try {
    const url = new URL(typeof value === "string" && value ? value : "/", origin);
    if (url.origin === origin) return url.href;
  } catch {
    // Не адрес — откроем кабинет
  }
  return new URL("/", origin).href;
}

/**
 * Открыть кабинет по ссылке уведомления.
 *
 * Вкладка с этим самым адресом уже открыта — показываем её. Иначе
 * переводим по ссылке открытую вкладку кабинета, а не плодим новые:
 * у установленного на телефон кабинета окно одно. Вкладок нет — новое окно.
 */
async function openCabinet(target) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const exact = all.find(function (client) {
    return client.url === target;
  });
  if (exact) return exact.focus();

  // Перевести по ссылке можно только вкладку под этим воркером
  const controlled = await self.clients.matchAll({ type: "window" });
  for (const client of controlled) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    try {
      const navigated = await client.navigate(target);
      if (navigated) return navigated.focus();
    } catch {
      // Вкладка не дала себя перевести — откроем новое окно
    }
  }

  return self.clients.openWindow(target);
}
