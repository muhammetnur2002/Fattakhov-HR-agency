import { createHash } from 'node:crypto';
import { getStore } from '@/lib/db';
import { newDeviceMail } from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/transport';
import { decryptSafe } from '@/lib/security/crypto';
import type { AccountRecord } from '@/lib/db/types';
import { appUrl } from '@/lib/app-url';

/**
 * Уведомление «вход с нового устройства».
 *
 * Украденная cookie не оставляет следа во входах: пароль не вводился. Но вор
 * открывает платформу из другого браузера или системы, и это видно по
 * User-Agent. Если с такой парой (браузер + система) аккаунт за последние
 * 90 дней не входил, владельцу уходит письмо.
 *
 * История входов хранится в журнале аудита, без отдельной таблицы:
 *  - `auth.device.tracked` — отметка, что слежение за аккаунтом началось.
 *    Без неё все существующие пользователи получили бы письмо «новое
 *    устройство» при первом входе после выкладки: первый вход только
 *    запоминает устройство, не рассылая ничего;
 *  - `auth.device` — известное устройство, запись обновляется не чаще раза в 30 дней.
 *
 * Версия браузера в сравнении не участвует (иначе каждое обновление
 * выглядело бы новым устройством), адрес тоже: он меняется у любого
 * человека с телефоном.
 */
const KNOWN_DAYS = 90;
const REFRESH_DAYS = 30;
const TRACKED_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Браузер и система из User-Agent, без версии: «Chrome, Windows». */
export function deviceKey(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  let browser = 'Другой браузер';
  if (/Edg(?:e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/YaBrowser\//.test(ua)) browser = 'Яндекс Браузер';
  else if (/(?:Firefox|FxiOS)\//.test(ua)) browser = 'Firefox';
  else if (/(?:Chrome|CriOS)\//.test(ua)) browser = 'Chrome';
  else if (/Version\/[\d.]+.*Safari/.test(ua)) browser = 'Safari';
  else if (/curl|python|node|axios|okhttp|Go-http/i.test(ua)) browser = 'Скрипт';

  let system = '';
  if (/Windows/i.test(ua)) system = 'Windows';
  else if (/Android/i.test(ua)) system = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) system = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) system = 'macOS';
  else if (/Linux|X11/i.test(ua)) system = 'Linux';

  return system ? `${browser}, ${system}` : browser;
}

const moscow = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Запомнить устройство входа и при необходимости предупредить владельца.
 * Никогда не бросает: сбой журнала или почты не должен мешать входу.
 */
export async function noteLoginDevice(
  account: Pick<AccountRecord, 'id' | 'emailEnc'>,
  request: { userAgent: string | null; ip: string | null },
): Promise<boolean> {
  try {
    const store = await getStore();
    const key = deviceKey(request.userAgent);
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
    const actorLabel = `ACCOUNT:${account.id}`;
    const base = { accountId: account.id, actorLabel, entity: 'Account', ip: request.ip, userAgent: request.userAgent };

    const tracked = await store.audit.recentExists({
      action: 'auth.device.tracked',
      actorLabel,
      entityId: account.id,
      withinMs: TRACKED_DAYS * DAY_MS,
    });
    if (!tracked) {
      // Слежение только началось: запоминаем устройство молча
      await store.audit.log({ ...base, action: 'auth.device.tracked', entityId: account.id, meta: null });
      await store.audit.log({ ...base, action: 'auth.device', entityId: `${account.id}:${hash}`, meta: { device: key } });
      return false;
    }

    const entityId = `${account.id}:${hash}`;
    const known = await store.audit.recentExists({ action: 'auth.device', actorLabel, entityId, withinMs: KNOWN_DAYS * DAY_MS });
    if (known) {
      const fresh = await store.audit.recentExists({ action: 'auth.device', actorLabel, entityId, withinMs: REFRESH_DAYS * DAY_MS });
      if (!fresh) await store.audit.log({ ...base, action: 'auth.device', entityId, meta: { device: key } });
      return false;
    }

    await store.audit.log({ ...base, action: 'auth.device', entityId, meta: { device: key, isNew: true } });
    const to = decryptSafe(account.emailEnc);
    if (!to) return true;
    const mail = newDeviceMail({ device: key, when: `${moscow.format(new Date())} (МСК)`, ip: request.ip, url: appUrl('/login') });
    await sendMail({ to, ...mail });
    return true;
  } catch (error) {
    console.error('[вход с нового устройства] не удалось обработать', error);
    return false;
  }
}
