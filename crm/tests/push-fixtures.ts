/**
 * Ключи для тестов пуша: настоящие по форме, одноразовые по сути.
 *
 * Не *.test.ts — Vitest его не запускает, только импортируют тесты.
 * Ключи считаются здесь же, через node:crypto, а не через web-push:
 * в тестах web-push подменён, и генератор пропал бы вместе с ним.
 */
import { createECDH, randomBytes } from "node:crypto";

/** Пара VAPID — как от scripts/generate-vapid.ts. */
export function vapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  let privateKey = ecdh.getPrivateKey();
  if (privateKey.length < 32) {
    privateKey = Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]);
  }
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: privateKey.toString("base64url"),
  };
}

/** Подписка в том виде, в каком её отдаёт браузер (PushSubscription.toJSON()). */
export function browserSubscription(endpoint: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

/** Общий префикс адресов тестовых подписок — по нему тесты убирают за собой. */
export const TEST_ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-push-";

/** Ошибка, как её бросает web-push на ответ службы уведомлений не из 2xx. */
export function pushServiceError(statusCode: number): Error {
  return Object.assign(new Error("Received unexpected response code"), {
    name: "WebPushError",
    statusCode,
  });
}
