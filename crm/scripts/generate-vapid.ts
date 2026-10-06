/**
 * Пара ключей VAPID для пуш-уведомлений.
 *
 *   npx tsx scripts/generate-vapid.ts
 *
 * Печатает три строки для окружения сервера — их вписывают в боевые
 * настройки один раз. Ключи не меняют: браузеры подписаны на открытый
 * ключ, и с новой парой служба уведомлений отвергнет все прежние
 * подписки — уведомления придётся включать заново на каждом устройстве.
 *
 * Закрытый ключ — секрет того же уровня, что AUTH_SECRET: с ним можно
 * слать уведомления всем подписанным от имени платформы.
 *
 * В боевой образ скрипт не попадает (см. Dockerfile: из scripts/ в образ
 * tools копируется только bootstrap-owner.ts) — нужен он один раз,
 * на машине того, кто настраивает сервер.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(
  [
    "# Пуш-уведомления (lib/notifications/push-config.ts)",
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    // Контакт для служб уведомлений (Google, Apple, Mozilla) — на случай,
    // если им понадобится связаться с отправителем. mailto: или https:
    "VAPID_SUBJECT=mailto:privacy@fattakhovhr.ru",
  ].join("\n"),
);
