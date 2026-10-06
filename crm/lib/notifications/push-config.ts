import { createECDH } from "node:crypto";

import { base64UrlByteLength } from "@/lib/validation/push";

/**
 * Настройка пуш-уведомлений (VAPID, RFC 8292).
 *
 * Три переменные, и канал есть только со всеми тремя:
 *   VAPID_PUBLIC_KEY   открытый ключ — браузер подписывается именно на него;
 *   VAPID_PRIVATE_KEY  закрытый — им подписан каждый запрос к службе
 *                      уведомлений, без него служба запрос не примет;
 *   VAPID_SUBJECT      контакт отправителя для служб уведомлений:
 *                      mailto: или https:.
 * Нет любой — канала нет: блок в настройках не показывается, воркер
 * не регистрируется, рассылка пуш пропускает. Так же, как ВКонтакте
 * без VK_BOT_TOKEN, и это не поломка, а «такой возможности нет».
 *
 * Пара ключей генерируется один раз (npx tsx scripts/generate-vapid.ts)
 * и больше не меняется: браузеры подписаны на открытый ключ, и с новой
 * парой служба уведомлений отвергнет все прежние подписки — каждому
 * придётся включать уведомления заново на каждом устройстве.
 *
 * Открытый ключ нужен браузеру, но через NEXT_PUBLIC_* он туда не идёт:
 * такие переменные вшиваются в код при сборке образа, а образ собирается
 * без боевых настроек (см. Dockerfile). Ключ читается здесь, на сервере,
 * при каждом запросе и передаётся в страницу пропсом.
 */

export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** О чём уже предупредили в журнале: настройка читается на каждый запрос. */
const warned = new Set<string>();

/**
 * Последняя проверенная настройка. Читается на каждого получателя
 * рассылки, а проверка пары ключей — умножение точки на кривой; ключ
 * кеша — сами значения, так что смена переменных (и подмена в тестах)
 * перепроверяется сразу.
 */
let checked: { key: string; config: PushConfig | null } | undefined;

export function pushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";

  // Ничего не задано — обычное состояние, предупреждать не о чем
  if (!publicKey && !privateKey && !subject) return null;

  const key = `${publicKey}\n${privateKey}\n${subject}`;
  if (checked?.key === key) return checked.config;

  const problem = vapidProblem({ publicKey, privateKey, subject });
  if (problem) {
    /*
      Наполовину заданная настройка — ошибка выкатки, но не повод
      останавливать платформу (канал необязательный, как ВК
      в lib/config/production-check.ts). Канал выключается целиком,
      причина — в журнал: молча выключенный канал ищут дольше.
    */
    if (!warned.has(problem)) {
      warned.add(problem);
      console.warn(`[пуш] уведомления на устройства выключены: ${problem}`);
    }
  }
  checked = { key, config: problem ? null : { publicKey, privateKey, subject } };
  return checked.config;
}

export function pushConfigured(): boolean {
  return pushConfig() !== null;
}

/** Открытый ключ для браузера — или null, если канала нет. */
export function pushPublicKey(): string | null {
  return pushConfig()?.publicKey ?? null;
}

/**
 * Что не так с настройкой — словами, для журнала. null — всё в порядке.
 *
 * Ключи проверяются заранее, а не первой отправкой: web-push на неверном
 * ключе бросает исключение посреди рассылки, и узнали бы об этом не на
 * выкатке, а по молчанию телефонов.
 */
export function vapidProblem(config: PushConfig): string | null {
  const { publicKey, privateKey, subject } = config;
  if (!publicKey || !privateKey || !subject) {
    return "нужны все три переменные: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT";
  }
  // Без «=» на конце: web-push принимает ключи только так
  if (publicKey.includes("=") || base64UrlByteLength(publicKey) !== 65) {
    return "VAPID_PUBLIC_KEY не похож на открытый ключ: нужна строка base64url (65 байт)";
  }
  if (privateKey.includes("=") || base64UrlByteLength(privateKey) !== 32) {
    return "VAPID_PRIVATE_KEY не похож на закрытый ключ: нужна строка base64url (32 байта)";
  }
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) {
    return "VAPID_SUBJECT — контакт для служб уведомлений: mailto:ящик@домен или https://адрес";
  }
  // Ключи из разных пар — частая ошибка копирования: подписки создаются
  // на один ключ, запросы подписаны другим, и служба отвергает всё
  if (derivePublicKey(privateKey) !== publicKey) {
    return "VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY — из разных пар ключей";
  }
  return null;
}

function derivePublicKey(privateKey: string): string | null {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    return ecdh.getPublicKey().toString("base64url");
  } catch {
    return null;
  }
}
