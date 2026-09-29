import 'server-only';

import { agencySiteUrl } from '@/lib/agency';
import { crmServiceSecret } from '@/lib/security/service-auth';

export type CrmEventKind = 'company' | 'vacancy' | 'study' | 'crm-link' | 'application' | 'message';

/**
 * Пинг CRM: «появилось что-то на проверку». До этого колокольчик там
 * молчал, пока сотрудник сам не откроет «Проверки» и не обновит список —
 * компания или вакансия могли сутками ждать без единого сигнала.
 *
 * Никогда не бросает и не ждёт долго: уведомление — не часть действия,
 * которое его вызвало, а недоступный на секунду CRM не должен ронять
 * регистрацию компании или отправку вакансии.
 */
export async function notifyCrm(
  kind: CrmEventKind,
  title: string,
  body?: string,
  groupKey?: string,
  /** Для событий клиента (отклик, сообщение): кому из людей клиента показать в CRM. */
  crmClientId?: string,
): Promise<void> {
  const secret = crmServiceSecret();
  const base = agencySiteUrl();
  if (!secret || !base) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(`${base}/api/webhooks/students-event`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, body, groupKey, crmClientId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(`[crm] уведомление о событии "${kind}" не доставлено`, error);
  }
}
