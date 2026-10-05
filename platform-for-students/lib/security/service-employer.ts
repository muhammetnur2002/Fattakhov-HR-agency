import 'server-only';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { HttpError } from '@/lib/security/http-error';

/**
 * Кабинет клиента CRM для служебных вызовов /api/service/employer/*.
 *
 * Пользователя и сессии здесь нет (см. assertServiceAuth) — компанию
 * определяет crmClientId, который CRM присылает в каждом запросе: тот же
 * Client.id, что уходит в билет входа человека (issueClientTicket), только
 * без похода в браузер. 404, а не 403 — по той же причине, что и на
 * остальных ручках кабинета: не подтверждать перебором, что за id стоит
 * реальный клиент.
 */
const crmClientIdSchema = z.string().trim().min(1, 'crmClientId обязателен');

export async function requireServiceEmployer(crmClientId: unknown) {
  const id = crmClientIdSchema.parse(crmClientId);
  const store = await getStore();
  const employer = await store.employers.findByCrmClientId(id);
  if (!employer) throw new HttpError(404, 'Клиент CRM не найден на платформе', 'NOT_FOUND');
  return { employer, store };
}
