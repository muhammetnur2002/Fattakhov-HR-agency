import { z } from 'zod';

/**
 * Пуш-подписка браузера — то, что отдаёт PushSubscription.toJSON().
 *
 * Проверяем строже, чем требует сама отправка, и вот почему. Адрес
 * подписки (endpoint) — это адрес, на который НАШ сервер потом будет
 * слать запросы при каждом уведомлении. Подписаться может любой вошедший.
 * Принимай мы что угодно, через подписку можно было бы заставить сервер
 * стучаться во внутреннюю сеть облака. Поэтому здесь отсекается всё, что
 * не похоже на службу уведомлений: не https, адрес-число вместо имени,
 * localhost и внутренние имена, нестандартный порт. Второй рубеж — при
 * соединении (lib/push/send.ts): имя, которое на деле ведёт во внутреннюю
 * сеть, отсюда не разглядеть.
 *
 * Ключи проверяются по длине: p256dh — открытый ключ P-256 (65 байт,
 * начинается с 0x04), auth — секрет 16 байт (RFC 8291). Мусор здесь
 * означал бы исключение при каждой отправке вместо одного отказа сейчас.
 */

/** Длиннее у служб уведомлений не бывает; длинная строка в уникальном индексе — нет. */
const MAX_ENDPOINT_LENGTH = 2048;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Сколько байт в строке base64url; -1 — это не base64url. */
export function base64UrlByteLength(value: string): number {
  if (!BASE64URL.test(value)) return -1;
  return Math.floor((value.replace(/=+$/, '').length * 3) / 4);
}

/**
 * Имена, которые снаружи не разрешаются: служба уведомлений там жить
 * не может, а запрос туда — запрос во внутреннюю сеть.
 */
const INTERNAL_SUFFIX = /\.(local|localhost|localdomain|internal|intranet|lan|home|corp|invalid|test|example)$/;

/** Похоже ли на адрес службы уведомлений, а не на что-то внутри сети. */
export function isAcceptablePushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  // Службы уведомлений отвечают на стандартном порту; другой — признак
  // попытки достучаться до чего-то своего
  if (url.port && url.port !== '443') return false;

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Адрес-число (IPv4 или IPv6 в скобках) — служба уведомлений всегда
  // под именем, а число нужно, только чтобы обойти проверку имени
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return false;
  // Имя без точки — localhost и короткие имена внутренней сети
  if (!host.includes('.')) return false;
  if (INTERNAL_SUFFIX.test(host)) return false;
  return true;
}

const endpoint = z
  .string()
  .trim()
  .min(1, 'Нет адреса подписки')
  .max(MAX_ENDPOINT_LENGTH, 'Слишком длинный адрес подписки');

export const pushSubscriptionSchema = z.object({
  endpoint: endpoint.refine(isAcceptablePushEndpoint, 'Адрес подписки не похож на службу уведомлений браузера'),
  keys: z.object({
    p256dh: z
      .string()
      .trim()
      .refine((v) => base64UrlByteLength(v) === 65 && v.startsWith('B'), 'Неверный ключ шифрования подписки')
      // Храним без выравнивания «=»: web-push принимает ключи только так
      .transform((v) => v.replace(/=+$/, '')),
    auth: z
      .string()
      .trim()
      .refine((v) => base64UrlByteLength(v) === 16, 'Неверный секрет подписки')
      .transform((v) => v.replace(/=+$/, '')),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Отписка: достаточно адреса — подписка ищется только среди своих. */
export const pushEndpointSchema = z.object({ endpoint });

/** «Отключить на остальных устройствах»: это устройство — если оно подписано. */
export const keepEndpointSchema = z.object({ keepEndpoint: endpoint.optional() });
