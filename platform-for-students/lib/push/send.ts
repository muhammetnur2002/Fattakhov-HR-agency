import 'server-only';
import webpush from 'web-push';
import { getStore } from '@/lib/db';
import { PRIVATE_ADDRESS_CODE, pushAgent, pushServiceName } from '@/lib/push/guard';
import { pushConfig, type PushConfig } from '@/lib/push/config';

/**
 * Пуш-уведомления на устройства (Web Push: RFC 8030, 8291, 8292).
 *
 * Серверу нужно достучаться только до службы уведомлений браузера
 * (Google, Apple, Mozilla), а содержимое шифруется ключами самого
 * браузера: служба видит лишь адрес и размер. Почта и колокольчик
 * остаются основными каналами — пуш получает те же поводы, но ничего
 * не заменяет и не отменяет.
 *
 * Текст — нейтральный: название события и ссылка в кабинет, без имён,
 * компаний и названий вакансий. Уведомление показывается на экране
 * блокировки, и прочитать его может любой, кто взял телефон в руки.
 */

/**
 * Сколько служба уведомлений держит сообщение, пока устройство не в сети.
 * По умолчанию у web-push — четыре недели, а «вас пригласили», пришедшее
 * через неделю, только сбивает с толку. Сутки: письмо и колокольчик
 * к тому времени уже сказали то же самое.
 */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Сколько ждём ответа службы уведомлений. Рассылка идёт внутри действия
 * человека (смена статуса отклика), и зависшая служба не должна держать
 * его дольше нескольких секунд. Устройства опрашиваются параллельно.
 */
const TIMEOUT_MS = 5_000;

/**
 * Устройств на человека. Каждое уведомление уходит на все сразу, и без
 * потолка подписки копились бы годами — каждая новая подписка сверх него
 * вытесняет самую старую.
 */
export const MAX_DEVICES_PER_ACCOUNT = 10;

/**
 * Когда отказывающую подписку пора удалить: пять отказов подряд — и только
 * если она молчит дольше недели. Без второго условия сбой на стороне службы
 * или в сети облака за пару часов отписал бы всех разом. 404 и 410 — другое
 * дело: служба прямо говорит, что подписки больше нет, и такие удаляются сразу.
 */
const FAILURES_BEFORE_REMOVAL = 5;
const SILENCE_BEFORE_REMOVAL_MS = 7 * 24 * 60 * 60_000;

export type PushMessage = {
  title: string;
  body?: string;
  /**
   * Путь внутри платформы, а не полный адрес: воркер (public/push-sw.js)
   * открывает его на том же адресе, где живёт сам, и чужие адреса не
   * открывает вовсе.
   */
  url?: string;
  /** Уведомление с тем же ярлыком заменяет прежнее на экране, а не ложится рядом. */
  tag?: string;
  /** Подсказка телефону, будить ли его ради этого сразу. */
  urgency?: 'high' | 'normal' | 'low';
};

export type SavedPushSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

/** Чем закончилась отправка на одно устройство. */
export type PushOutcome =
  | { state: 'sent' }
  /** Подписки больше нет: служба ответила 404/410 или адрес ведёт внутрь сети. */
  | { state: 'gone' }
  /** Служба ответила отказом — код ответа есть. */
  | { state: 'rejected'; status: number }
  /** До службы не достучались: сеть, таймаут. */
  | { state: 'unreachable' };

export type PushDelivery = { sent: number; removed: number; failed: number; outcomes: PushOutcome[] };

const NOTHING_SENT: PushDelivery = { sent: 0, removed: 0, failed: 0, outcomes: [] };

/**
 * Отправить человеку на все его устройства — параллельно.
 *
 * Не бросает никогда: как почта и колокольчик, пуш не должен ронять
 * действие, которое его вызвало.
 */
export async function sendPushToAccount(accountId: string, message: PushMessage): Promise<PushDelivery> {
  try {
    const config = pushConfig();
    if (!config) return NOTHING_SENT;

    const store = await getStore();
    const subscriptions = await store.pushSubscriptions.listByAccount(accountId);
    if (subscriptions.length === 0) {
      // Видно в журнале, почему пуша нет: «никто не подписан», а не «сломалась отправка»
      console.info(`[пуш] ${accountId.slice(0, 8)}: нет подписанных устройств — уведомление «${message.title}» ушло только в колокольчик и на почту`);
      return NOTHING_SENT;
    }

    const outcomes = await Promise.all(subscriptions.map((s) => sendPush(s, message, config)));
    const delivery = {
      sent: outcomes.filter((o) => o.state === 'sent').length,
      removed: outcomes.filter((o) => o.state === 'gone').length,
      failed: outcomes.filter((o) => o.state === 'rejected' || o.state === 'unreachable').length,
      outcomes,
    };
    // Итог по каждой отправке: служба приняла (sent) — устройство получит, если оно в сети и
    // разрешения в порядке; остальное объяснено в строках «не доставлено» выше
    console.info(
      `[пуш] ${accountId.slice(0, 8)}: «${message.title}» — устройств ${subscriptions.length}, принято службой ${delivery.sent}, ` +
        `подписка погасла ${delivery.removed}, не дошло ${delivery.failed}`,
    );
    return delivery;
  } catch (error) {
    console.error('[пуш] сбой рассылки', error);
    return NOTHING_SENT;
  }
}

/** Отправить на одно устройство — проверочное уведомление после подписки. */
export async function sendPushToSubscription(
  subscription: SavedPushSubscription,
  message: PushMessage,
): Promise<PushOutcome> {
  const config = pushConfig();
  if (!config) return { state: 'unreachable' };
  return sendPush(subscription, message, config);
}

async function sendPush(subscription: SavedPushSubscription, message: PushMessage, config: PushConfig): Promise<PushOutcome> {
  const payload = JSON.stringify({
    title: message.title,
    body: message.body ?? '',
    url: message.url ?? '/',
    tag: message.tag,
  });

  let outcome: PushOutcome;
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      {
        vapidDetails: config,
        TTL: TTL_SECONDS,
        urgency: message.urgency ?? 'normal',
        timeout: TIMEOUT_MS,
        agent: pushAgent,
      },
    );
    outcome = { state: 'sent' };
  } catch (error) {
    outcome = classify(error);
    // В журнал — служба и код, без адреса подписки: по нему можно слать
    console.error(`[пуш] не доставлено ${subscription.id} (${pushServiceName(subscription.endpoint)}): ${describe(error)}`);
  }

  await recordOutcome(subscription.id, outcome);
  return outcome;
}

function classify(error: unknown): PushOutcome {
  const status = (error as { statusCode?: unknown })?.statusCode;
  if (typeof status === 'number') {
    return status === 404 || status === 410 ? { state: 'gone' } : { state: 'rejected', status };
  }
  // Имя ведёт во внутреннюю сеть — такая подписка не станет рабочей никогда
  if ((error as NodeJS.ErrnoException)?.code === PRIVATE_ADDRESS_CODE) return { state: 'gone' };
  return { state: 'unreachable' };
}

/** Отметить исход в подписке. Сбой отметки не роняет отправку. */
async function recordOutcome(id: string, outcome: PushOutcome): Promise<void> {
  try {
    const store = await getStore();
    if (outcome.state === 'sent') return await store.pushSubscriptions.recordSuccess(id);
    if (outcome.state === 'gone') return await store.pushSubscriptions.deleteById(id);

    const row = await store.pushSubscriptions.recordFailure(id);
    if (!row) return;
    const silentSince = row.lastSuccessAt ?? row.createdAt;
    if (row.failureCount >= FAILURES_BEFORE_REMOVAL && Date.now() - silentSince.getTime() > SILENCE_BEFORE_REMOVAL_MS) {
      await store.pushSubscriptions.deleteById(id);
    }
  } catch (error) {
    console.error(`[пуш] не удалось отметить исход для ${id}`, error);
  }
}

function describe(error: unknown): string {
  const e = error as { statusCode?: number; code?: string; message?: string };
  if (typeof e?.statusCode === 'number') return `ответ ${e.statusCode}`;
  return [e?.code, e?.message].filter(Boolean).join(' ') || String(error);
}
