import 'server-only';
import type { PasswordResetRequestResult } from '@/lib/account-email';
import { formatWait } from '@/lib/wait-format';
import { rateLimit, rateLimitExhausted } from './rate-limit';

/**
 * Можно ли ответить на запрос сброса пароля честно.
 *
 * Честные ответы («аккаунта с такой почтой нет», «у аккаунта нет пароля, вход по коду») удобны
 * человеку, который ошибся адресом, и они же превращают форму в проверку «есть ли у вас такая
 * почта». Решение владельца: честно — только на первые три промаха с одного адреса за час
 * (опечатки и «регистрировался с другой почтой» случаются у живых людей), с четвёртого на всё
 * один и тот же нейтральный ответ. Перебор адресов тем самым упирается в три подсказки в час.
 *
 * Считаются промахи: нет аккаунта и «вход по коду». «Подождите минуту» (письмо уже ушло) —
 * тоже говорит, что аккаунт есть, но промахом не является: квоту не тратит, однако у того,
 * кто её уже исчерпал, тоже становится нейтральным, иначе повторным запросом одной и той же
 * почты можно было бы узнать, что она есть. Отправленное письмо и сбой почты честны всегда:
 * эти ответы и так видит владелец ящика.
 *
 * `ip` — настоящий адрес клиента из clientIp(): при подделке заголовков счёт был бы пуст.
 */
export async function answerHonestly(ip: string, status: PasswordResetRequestResult['status']): Promise<boolean> {
  if (status === 'NO_ACCOUNT' || status === 'NO_PASSWORD') {
    return (await rateLimit('passwordResetMiss', ip)).ok;
  }
  if (status === 'WAIT') return !(await rateLimitExhausted('passwordResetMiss', ip));
  return true;
}

export interface ResetReply {
  status: number;
  body: Record<string, unknown>;
  /** Секунд до повтора — для заголовка Retry-After */
  retryAfter?: number;
}

/** Ответ, который видит и тот, чей адрес есть, и тот, чьего нет. */
const NEUTRAL_REPLY: ResetReply = { status: 200, body: { sent: true } };

/**
 * Что отвечать на запрос сброса. `honest` — решение answerHonestly(): в нейтральном режиме
 * на любой исход один и тот же ответ (статус и тело), в честном — понятное объяснение.
 * Исход «ссылка выпущена» в честном режиме совпадает с нейтральным ответом: и там и там
 * `{ sent: true }`. Сбоя отправки среди исходов нет — письмо уходит после ответа.
 */
export function resetReply(result: PasswordResetRequestResult, honest: boolean): ResetReply {
  if (!honest) return NEUTRAL_REPLY;
  switch (result.status) {
    case 'NO_ACCOUNT':
      return {
        status: 404,
        body: {
          error: 'Аккаунта с такой почтой нет. Проверьте адрес на опечатки или зарегистрируйтесь.',
          code: 'NO_ACCOUNT',
          fields: { email: 'Аккаунта с такой почтой нет. Проверьте адрес на опечатки.' },
        },
      };
    case 'NO_PASSWORD':
      return {
        status: 409,
        body: {
          error: 'У этого аккаунта нет пароля: вход по коду. Новый код выдаёт ваш менеджер агентства.',
          code: 'NO_PASSWORD',
          fields: { email: 'У этого аккаунта нет пароля: вход по коду от менеджера.' },
        },
      };
    case 'WAIT': {
      const retryAfter = result.retryAfter;
      return {
        status: 429,
        body: { error: `Письмо уже отправлено. Новое можно запросить через ${formatWait(retryAfter)}.`, code: 'WAIT' },
        retryAfter,
      };
    }
    default:
      return NEUTRAL_REPLY;
  }
}
