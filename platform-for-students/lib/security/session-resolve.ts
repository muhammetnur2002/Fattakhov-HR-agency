import type { AccountRecord } from '@/lib/db/types';
import type { SessionUser } from '@/lib/types';
import { verifySession } from './session';

/**
 * Что делать с кукой сессии, когда подпись верна.
 *
 * Подпись говорит лишь, что токен выдали мы и он не истёк. Действует ли он
 * сейчас, знает только база: после сброса пароля и отключения учётной записи
 * выданный токен жив до двух недель. Поэтому, как и в CRM (crm/lib/auth/session.ts),
 * сессия сверяется с учётной записью:
 *
 *  - записи нет или она отключена (`isActive = false`) — сессия недействительна сразу, любая роль;
 *  - пароль менялся после выпуска токена (`iat` раньше `passwordChangedAt`) — недействительна.
 *
 * Стоит это одного запроса по первичному ключу на проверку. Вход сотрудников из CRM
 * не затронут: их учётка заводится без пароля (`passwordChangedAt` пуст), а токен
 * выпускается уже после проверки билета.
 */

export interface ResolvedSession {
  user: SessionUser | null;
  /** Строка учётной записи, прочитанная для проверки: вызывающему не нужно читать её второй раз */
  account: AccountRecord | null;
  /**
   * Подпись верна, но запись отозвана (учётка отключена, удалена или пароль сменили).
   * Нужно страницам: куку с отозванной сессией надо снять через /logout, иначе middleware,
   * видя валидную подпись, гоняет человека между разделом и формой входа.
   */
  revoked: boolean;
}

/**
 * Допуск при сравнении, секунды. Метку ставит иногда не сервер, а скрипт set-password.ts
 * на другой машине, и часы у них могут расходиться; без допуска свежий вход после сброса
 * мог бы погасить сам себя. Цена допуска — сессия, выпущенная в последние две секунды
 * перед сменой пароля, переживёт её; для сессии, которой уже минуты, это не важно.
 */
const PASSWORD_CHANGE_SKEW_SECONDS = 2;

/**
 * Выпущен ли токен раньше смены пароля. `iat` — секунды, метка — миллисекунды: сравниваем
 * в секундах, а токен, выпущенный в ту же секунду, что и смена, считаем новым — иначе
 * вход сразу после сброса погасил бы сам себя. Токен без `iat` при заданной метке — старый.
 */
export function isIssuedBeforePasswordChange(issuedAt: number | undefined, passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt) return false;
  if (issuedAt === undefined) return true;
  return issuedAt < Math.floor(passwordChangedAt.getTime() / 1000) - PASSWORD_CHANGE_SKEW_SECONDS;
}

export async function resolveSession(
  token: string | undefined,
  accounts: { findById(id: string): Promise<AccountRecord | null> },
): Promise<ResolvedSession> {
  const verified = await verifySession(token);
  if (!verified) return { user: null, account: null, revoked: false };

  const { issuedAt, ...user } = verified;
  const account = await accounts.findById(user.accountId);
  if (!account || !account.isActive || isIssuedBeforePasswordChange(issuedAt, account.passwordChangedAt)) {
    return { user: null, account: null, revoked: true };
  }
  return { user, account, revoked: false };
}
