import 'server-only';
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_SECONDS,
  EMAIL_CODE_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
  isExpired,
  minutesAfter,
  resendWaitSeconds,
} from '@/lib/account-codes';
import { appUrl } from '@/lib/app-url';
import { getStore } from '@/lib/db';
import { emailCodeMail, passwordResetMail } from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/transport';
import { blindIndex, decryptSafe, safeEqual } from '@/lib/security/crypto';
import { hashPassword } from '@/lib/security/password';
import { weakPasswordMessage } from '@/lib/security/password-check';
import { generateEmailCode, generateResetToken, hashEmailCode, hashResetToken } from '@/lib/security/tokens';
import { releasePendingApplications } from '@/lib/services';
import type { Role } from '@/lib/types';

/**
 * Подтверждение почты и восстановление пароля.
 *
 * Почта подтверждается кодом из письма, а не ссылкой: код набирают на
 * том же устройстве, где открыт кабинет, — ссылка из письма на телефоне
 * открылась бы в другом браузере, без сессии.
 */

export type SendCodeResult =
  | { status: 'SENT'; delivered: boolean; retryAfter: number }
  | { status: 'WAIT'; retryAfter: number }
  | { status: 'ALREADY_VERIFIED' }
  | { status: 'NO_ACCOUNT' };

export async function sendEmailCode(accountId: string): Promise<SendCodeResult> {
  const store = await getStore();
  const account = await store.accounts.findById(accountId);
  if (!account || !account.isActive) return { status: 'NO_ACCOUNT' };
  if (account.emailVerifiedAt) return { status: 'ALREADY_VERIFIED' };

  const last = await store.authTokens.latest(accountId, 'EMAIL_VERIFY');
  const wait = resendWaitSeconds(last?.createdAt ?? null);
  if (wait > 0) return { status: 'WAIT', retryAfter: wait };

  const code = generateEmailCode();
  await store.authTokens.issue({
    accountId,
    kind: 'EMAIL_VERIFY',
    tokenHash: hashEmailCode(accountId, code),
    expiresAt: minutesAfter(new Date(), EMAIL_CODE_TTL_MINUTES),
  });
  const delivered = await sendMail({
    to: decryptSafe(account.emailEnc),
    ...emailCodeMail({ code, minutes: EMAIL_CODE_TTL_MINUTES }),
  });
  return { status: 'SENT', delivered, retryAfter: EMAIL_CODE_RESEND_SECONDS };
}

export type VerifyCodeResult =
  | { status: 'VERIFIED'; released: string[] }
  | { status: 'ALREADY_VERIFIED' }
  | { status: 'WRONG'; attemptsLeft: number }
  | { status: 'LOCKED' }
  | { status: 'EXPIRED' }
  | { status: 'NO_CODE' };

/**
 * Проверка кода. Подтверждённая почта у студента с подтверждённой учёбой
 * отправляет работодателям ожидавшие отклики — их id возвращаются, чтобы
 * вызывающий разослал письма компаниям.
 */
export async function verifyEmailCode(accountId: string, code: string): Promise<VerifyCodeResult> {
  const store = await getStore();
  const account = await store.accounts.findById(accountId);
  if (!account || !account.isActive) return { status: 'NO_CODE' };
  if (account.emailVerifiedAt) return { status: 'ALREADY_VERIFIED' };

  const token = await store.authTokens.latest(accountId, 'EMAIL_VERIFY');
  if (!token) return { status: 'NO_CODE' };
  if (isExpired(token.expiresAt)) return { status: 'EXPIRED' };

  // Попытка занимается до сверки, одним условным обновлением: если сначала сверять, а потом
  // считать, сорок параллельных запросов успели бы все прочитать «ошибок ноль» и перебрать
  // сорок кодов, а не пять. Пятая занятая попытка ещё сверяется — ровно пять догадок на код
  const attempts = await store.authTokens.claimAttempt(token.id, EMAIL_CODE_MAX_ATTEMPTS);
  if (attempts === null) return { status: 'LOCKED' };

  if (!safeEqual(token.tokenHash, hashEmailCode(accountId, code))) {
    return attempts >= EMAIL_CODE_MAX_ATTEMPTS
      ? { status: 'LOCKED' }
      : { status: 'WRONG', attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempts };
  }

  if (!(await store.authTokens.consume(token.id))) return { status: 'NO_CODE' };
  await store.accounts.markEmailVerified(accountId);

  let released: string[] = [];
  if (account.role === 'STUDENT') {
    const student = await store.students.findByAccountId(accountId);
    if (student) released = await releasePendingApplications(student.id);
  }
  return { status: 'VERIFIED', released };
}

export type PasswordResetRequestResult =
  /**
   * Ссылка выпущена, письмо ещё не ушло: `deliver()` отправляет его и сообщает, дошло ли.
   * Ответ человеку не ждёт письма — иначе по времени ответа отличались бы «аккаунт есть»
   * (идёт письмо) и «нет» (ответ сразу).
   */
  | { status: 'SENT'; deliver: () => Promise<boolean> }
  | { status: 'NO_ACCOUNT' }
  | { status: 'NO_PASSWORD' }
  | { status: 'WAIT'; retryAfter: number };

/**
 * Письмо со ссылкой сброса пароля.
 *
 * Результат говорит, что именно произошло, и форма объясняет это человеку:
 * раньше на любую почту отвечало «отправлено», и тот, кто ошибся адресом
 * или регистрировался в другой системе, ждал письмо, которое не придёт.
 * Неактивная учётка отдаётся как «нет такой» — её состояние не раскрывается.
 * Перебор адресов по-прежнему упирается в лимиты по IP и по почте
 * (см. route.ts), а регистрация и так сообщает о занятой почте.
 *
 * Работодателю из CRM без пароля письмо не уходит: он входит по коду,
 * который выдаёт менеджер, — для него отдельный ответ.
 *
 * Письмо отправляет вызывающий через `deliver()` уже после ответа (after() в маршруте):
 * процесс живёт на ВМ, заморозки инстанса нет, а ждать SMTP перед ответом значило бы
 * выдавать временем, есть ли такой аккаунт. Сбой отправки в ответ не попадает — только в журнал.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const store = await getStore();
  const account = await store.accounts.findByEmailHash(blindIndex(email));
  // Администратор платформы входит только через CRM: пароль ему не нужен, письмо со ссылкой
  // сброса не уходит, а о самом аккаунте ответ такой же, как о несуществующем
  if (!account || !account.isActive || account.role === 'ADMIN') return { status: 'NO_ACCOUNT' };
  if (!account.passwordHash) return { status: 'NO_PASSWORD' };

  const last = await store.authTokens.latest(account.id, 'PASSWORD_RESET');
  const wait = resendWaitSeconds(last?.createdAt ?? null);
  if (wait > 0) return { status: 'WAIT', retryAfter: wait };

  const token = generateResetToken();
  await store.authTokens.issue({
    accountId: account.id,
    kind: 'PASSWORD_RESET',
    tokenHash: hashResetToken(token),
    expiresAt: minutesAfter(new Date(), PASSWORD_RESET_TTL_MINUTES),
  });
  const to = decryptSafe(account.emailEnc);
  const mail = passwordResetMail({ url: appUrl(`/reset/${token}`), minutes: PASSWORD_RESET_TTL_MINUTES });
  return { status: 'SENT', deliver: () => sendMail({ to, ...mail }) };
}

export type ResetTokenState = 'VALID' | 'INVALID' | 'EXPIRED';

/** Состояние ссылки — чтобы страница сразу сказала, что ссылка устарела, а не после ввода пароля. */
export async function checkResetToken(token: string): Promise<ResetTokenState> {
  if (!token || token.length > 200) return 'INVALID';
  const store = await getStore();
  const record = await store.authTokens.findActiveByHash('PASSWORD_RESET', hashResetToken(token));
  if (!record) return 'INVALID';
  return isExpired(record.expiresAt) ? 'EXPIRED' : 'VALID';
}

export type ResetResult =
  | { status: 'RESET'; accountId: string; role: Role }
  /** Пароль слабый: ссылка не сгорает, человек вводит другой. message — что именно не так */
  | { status: 'WEAK'; message: string }
  | { status: 'INVALID' }
  | { status: 'EXPIRED' };

export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  const store = await getStore();
  const record = await store.authTokens.findActiveByHash('PASSWORD_RESET', hashResetToken(token));
  if (!record) return { status: 'INVALID' };
  if (isExpired(record.expiresAt)) return { status: 'EXPIRED' };

  const account = await store.accounts.findById(record.accountId);
  if (!account || !account.isActive || account.role === 'ADMIN') return { status: 'INVALID' };

  // Слабый пароль отвергается до погашения ссылки: опечатка или «слишком простой» не должны
  // стоить человеку нового письма. Почта берётся из базы — форма сброса её не знает
  const weak = weakPasswordMessage(password, decryptSafe(account.emailEnc));
  if (weak) return { status: 'WEAK', message: weak };

  if (!(await store.authTokens.consume(record.id))) return { status: 'INVALID' };

  // setPassword ставит и метку смены: сессии, выданные до сброса, перестают действовать
  await store.accounts.setPassword(account.id, await hashPassword(password));
  // Ссылка пришла на эту почту и по ней перешли — владение ящиком доказано
  await store.accounts.markEmailVerified(account.id);
  return { status: 'RESET', accountId: account.id, role: account.role };
}
