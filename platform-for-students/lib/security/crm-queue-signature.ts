import crypto from 'node:crypto';

/**
 * Подпись запроса очереди проверок из CRM агентства.
 *
 * CRM раз в минуту спрашивает, что ждёт проверки (app/api/crm/review-queue),
 * и подписывает запрос тем же общим секретом, что и билеты входа
 * (STUDENTS_SSO_SECRET): HMAC-SHA256 от «review-queue:<метка времени>»,
 * base64url. Приставка отделяет эту подпись от подписи билетов — секрет
 * один, но выдать одно за другое нельзя. Формат задаёт lib/students/queue.ts
 * в CRM; менять только в обоих местах разом.
 */

/** Часы серверов расходятся; старше пяти минут запрос не принимаем. */
export const CRM_QUEUE_MAX_SKEW_SECONDS = 300;

export function crmQueueSignature(secret: string, timestamp: number): string {
  return crypto.createHmac('sha256', secret).update(`review-queue:${timestamp}`).digest('base64url');
}

export function verifyCrmQueueRequest(
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > CRM_QUEUE_MAX_SKEW_SECONDS) {
    return false;
  }
  const expected = Buffer.from(crmQueueSignature(secret, timestamp), 'base64url');
  const given = Buffer.from(signatureHeader ?? '', 'base64url');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
