/**
 * Запрос к службе уведомлений — через НАСТОЯЩИЙ web-push, без подмены.
 *
 * В остальных тестах web-push подменён: они видят, что мы отдаём службе,
 * но не то, примет ли библиотека эти параметры. Здесь запрос только
 * собирается (generateRequestDetails — шифрование и подпись VAPID, без
 * сети): недопустимый urgency, TTL или ключ бросили бы исключение, и пуш
 * молча не ушёл бы никому. Заодно проверяется, что воркер
 * (public/push-sw.js) получит именно то, что мы шифруем.
 */
import webpush from "web-push";
import { describe, expect, it } from "vitest";

import { pushPayload, pushRequestOptions, type PushMessage } from "@/lib/notifications/push";

import { browserSubscription, TEST_ENDPOINT, vapidKeys } from "./push-fixtures";

const keys = vapidKeys();
const config = { ...keys, subject: "mailto:privacy@fattakhovhr.ru" };

describe("параметры запроса принимает настоящий web-push", () => {
  it.each(["high", "normal", "low"] as const)("urgency %s", (urgency) => {
    const message: PushMessage = { title: "Личное сообщение", body: "Подробности — в кабинете", urgency };
    // Сетевые параметры (agent, timeout) в сборке запроса не участвуют
    const { vapidDetails, TTL, urgency: sent } = pushRequestOptions(message, config);

    const details = webpush.generateRequestDetails(
      browserSubscription(`${TEST_ENDPOINT}real`),
      pushPayload(message),
      { vapidDetails, TTL, urgency: sent },
    );

    expect(details.headers.Urgency).toBe(urgency);
    expect(Number(details.headers.TTL)).toBe(24 * 60 * 60);
    // Подпись VAPID — без неё Google и Apple отвечают 401/403
    expect(details.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(details.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(details.body).toBeInstanceOf(Buffer);
  });

  it("без urgency — обычная", () => {
    expect(pushRequestOptions({ title: "т" }, config).urgency).toBe("normal");
  });

  it("содержимое для воркера: строки title, body, url, tag", () => {
    expect(JSON.parse(pushPayload({ title: "Заголовок", url: "/a/settings", tag: "t" }))).toEqual({
      title: "Заголовок",
      body: "",
      url: "/a/settings",
      tag: "t",
    });
    // Без адреса — корень кабинета, без ярлыка — ключа нет
    expect(JSON.parse(pushPayload({ title: "т" }))).toEqual({ title: "т", body: "", url: "/" });
  });
});
