/**
 * Проверки защиты входа: определение IP клиента, отзыв сессии, счётчики попыток кодов,
 * подсказки «такой почты нет», повтор письма с кодом и проверка Origin.
 *
 *   npm run test:security
 *
 * По умолчанию — на хранилище в памяти, без сервера и базы. С DATABASE_URL — на настоящем
 * Postgres (временная база: `prisma migrate deploy` и затем
 * `DATABASE_URL=postgresql://... npm run test:security`): правила у памяти и Prisma одни,
 * но гонку параллельных запросов проверить по-настоящему можно только на базе.
 * Боевой базе здесь не место: тест заводит учётные записи и пишет в счётчики лимитов.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { EMAIL_CODE_MAX_ATTEMPTS } from '../lib/account-codes';
import { requestPasswordReset, resetPassword, verifyEmailCode } from '../lib/account-email';
import { getStore } from '../lib/db';
import { HttpError } from '../lib/security/http-error';
import { assertSameOrigin } from '../lib/security/origin';
import { rateLimit, clientIp } from '../lib/security/rate-limit';
import { resolveSession, isIssuedBeforePasswordChange } from '../lib/security/session-resolve';
import { signPendingRegistration, signSession } from '../lib/security/session';
import { hashEmailCode, hashResetToken } from '../lib/security/tokens';
import { answerHonestly, resetReply } from '../lib/security/reset-hints';
import { recordPulse } from '../lib/presence-pulse';
import { RATE_LIMITS } from '../lib/security/rate-limit';
import { RECHECK_EVERY_TICKS, createStreamGuard } from '../lib/security/stream-guard';
import { devOutbox } from '../lib/mail/transport';
import { confirmPendingRegistration, resendPendingRegistration } from '../lib/pending-registration';
import { hashPassword, verifyPassword } from '../lib/security/password';
import type { DataStore } from '../lib/db/types';

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function headersOf(init: Record<string, string>): Headers {
  return new Headers(init);
}

async function newStudent(store: DataStore, email: string, password = 'Tuman-Zakat-4821') {
  return store.students.createWithAccount({
    email,
    password,
    fullName: 'Проверкин Тест',
    phone: null,
    gender: 'FEMALE',
    birthYear: 2004,
    birthDate: '2004-05-17',
    photoUrl: null,
    resumeUrl: null,
    resumeName: null,
    university: 'Тестовый вуз',
    speciality: 'Тест',
    studyYear: 2,
    city: null,
    workDays: ['MON'],
    hoursPerWeek: 10,
    skills: [],
    about: null,
    lookingFor: [],
    institutionId: null,
    consentVersion: 'test',
    consentIp: null,
    termsVersion: 'test',
    marketingConsent: false,
  });
}

/** Все исходники сервера: чтобы убедиться, что IP нигде не берут мимо clientIp(). */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'tests', '.git'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

async function main() {
  const store = await getStore();
  console.log(`Хранилище: ${store.kind}\n`);

  // ---------- 1. IP клиента ----------
  console.log('IP клиента');
  const savedVercel = process.env.VERCEL;
  delete process.env.VERCEL;

  await test('заголовок Vercel без VERCEL игнорируется: клиент не подставит свой адрес', () => {
    const headers = headersOf({ 'x-vercel-forwarded-for': '6.6.6.6', 'x-forwarded-for': '203.0.113.7' });
    assert.equal(clientIp(headers), '203.0.113.7');
  });
  await test('без VERCEL и без X-Forwarded-For заголовок Vercel тоже не работает', () => {
    assert.equal(clientIp(headersOf({ 'x-vercel-forwarded-for': '6.6.6.6' })), '127.0.0.1');
    assert.equal(clientIp(headersOf({ 'x-vercel-forwarded-for': '6.6.6.6', 'x-real-ip': '203.0.113.9' })), '203.0.113.9');
  });
  await test('на Vercel заголовок платформы — главный', () => {
    process.env.VERCEL = '1';
    try {
      const headers = headersOf({ 'x-vercel-forwarded-for': '198.51.100.4', 'x-forwarded-for': '203.0.113.7' });
      assert.equal(clientIp(headers), '198.51.100.4');
    } finally {
      delete process.env.VERCEL;
    }
  });
  await test('X-Forwarded-For: берётся первый адрес — тот, что записал Caddy', () => {
    assert.equal(clientIp(headersOf({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
    assert.equal(clientIp(headersOf({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.2' })), '203.0.113.7');
  });
  await test('IPv6 принимается', () => {
    assert.equal(clientIp(headersOf({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1');
  });
  await test('мусор вместо адреса не попадает в ключи лимитов и журнал аудита', () => {
    assert.equal(clientIp(headersOf({ 'x-forwarded-for': 'drop table; --', 'x-real-ip': '203.0.113.9' })), '203.0.113.9');
    assert.equal(clientIp(headersOf({ 'x-forwarded-for': 'x'.repeat(500) })), '127.0.0.1');
  });
  await test('x-real-ip — второй по порядку, запасной адрес — последний', () => {
    assert.equal(clientIp(headersOf({ 'x-real-ip': '203.0.113.9' })), '203.0.113.9');
    assert.equal(clientIp(headersOf({})), '127.0.0.1');
  });
  await test('подделка заголовка не обходит лимит: у каждого настоящего адреса свой счётчик', async () => {
    // Атакующий сидит на 203.0.113.50 и каждый раз называет себя другим адресом Vercel.
    // Ключ лимита берётся из clientIp(), значит, все его попытки считаются на один адрес.
    const attacker = Array.from({ length: 40 }, (_, i) =>
      clientIp(headersOf({ 'x-vercel-forwarded-for': `6.6.6.${i}`, 'x-forwarded-for': '203.0.113.50' })),
    );
    assert.equal(new Set(attacker).size, 1);
  });
  await test('IP читается только в одном месте: clientIp() в rate-limit.ts', () => {
    const root = process.cwd();
    const offenders = sourceFiles(root)
      .filter((file) => !file.endsWith(path.join('lib', 'security', 'rate-limit.ts')))
      .filter((file) => /x-forwarded-for|x-real-ip|x-vercel-forwarded-for/i.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file));
    assert.deepEqual(offenders, []);
  });

  if (savedVercel !== undefined) process.env.VERCEL = savedVercel;

  // ---------- 2. Отзыв сессии ----------
  console.log('\nОтзыв сессии');
  await test('isIssuedBeforePasswordChange: до смены — да, после — нет, без метки — нет', () => {
    const changed = new Date('2026-10-05T12:00:30.500Z');
    const sec = Math.floor(changed.getTime() / 1000);
    // Допуск две секунды: часы скрипта set-password и сервера могут расходиться
    assert.equal(isIssuedBeforePasswordChange(sec - 3, changed), true);
    assert.equal(isIssuedBeforePasswordChange(sec - 2, changed), false);
    assert.equal(isIssuedBeforePasswordChange(sec - 1, changed), false);
    assert.equal(isIssuedBeforePasswordChange(sec, changed), false);
    assert.equal(isIssuedBeforePasswordChange(sec + 5, changed), false);
    assert.equal(isIssuedBeforePasswordChange(undefined, changed), true);
    assert.equal(isIssuedBeforePasswordChange(undefined, null), false);
    assert.equal(isIssuedBeforePasswordChange(sec - 1000, null), false);
  });

  const sessionEmail = `sess-${unique()}@demo.ru`;
  const { account: sessAccount, student: sessStudent } = await newStudent(store, sessionEmail);
  const sessionOf = (accountId: string) => ({
    accountId,
    role: 'STUDENT' as const,
    profileId: sessStudent.id,
    name: 'Проверкин',
  });

  await test('у новой учётной записи метки смены пароля нет', async () => {
    assert.equal((await store.accounts.findById(sessAccount.id))?.passwordChangedAt, null);
  });
  await test('действующая сессия принимается', async () => {
    const token = await signSession(sessionOf(sessAccount.id));
    const resolved = await resolveSession(token, store.accounts);
    assert.equal(resolved.user?.accountId, sessAccount.id);
    assert.equal(resolved.revoked, false);
  });
  await test('нет куки или подпись неверна — гость, и это не «отозвана»', async () => {
    assert.deepEqual(await resolveSession(undefined, store.accounts), { user: null, account: null, revoked: false });
    assert.deepEqual(await resolveSession('мусор', store.accounts), { user: null, account: null, revoked: false });
  });
  await test('подпись верна, а учётной записи нет — сессия отозвана', async () => {
    const token = await signSession(sessionOf('несуществующий-id'));
    assert.deepEqual(await resolveSession(token, store.accounts), { user: null, account: null, revoked: true });
  });
  await test('сброс пароля гасит уже выданную сессию, новая после смены проходит', async () => {
    const old = await signSession(sessionOf(sessAccount.id));
    await sleep(3200); // iat в секундах и допуск две секунды: смена должна оказаться заметно позже выпуска
    await store.accounts.setPassword(sessAccount.id, await hashPassword('Lilovyj-Tuman-2026'));
    const changed = await store.accounts.findById(sessAccount.id);
    assert.ok(changed?.passwordChangedAt instanceof Date);
    assert.deepEqual(await resolveSession(old, store.accounts), { user: null, account: null, revoked: true });
    const fresh = await signSession(sessionOf(sessAccount.id));
    assert.equal((await resolveSession(fresh, store.accounts)).user?.accountId, sessAccount.id);
  });

  // Отключение учётки: для всех ролей, а не только для ADMIN
  for (const role of ['STUDENT', 'EMPLOYER', 'ADMIN'] as const) {
    await test(`отключённая учётная запись (${role}) теряет сессию сразу`, async () => {
      const email = `off-${role.toLowerCase()}-${unique()}@demo.ru`;
      const account = role === 'ADMIN' ? await store.accounts.createStaff(email) : (await newStudent(store, email)).account;
      const token = await signSession({ accountId: account.id, role, profileId: null, name: 'Тест' });
      assert.equal((await resolveSession(token, store.accounts)).user?.accountId, account.id);
      await store.accounts.setActive(account.id, false);
      assert.deepEqual(await resolveSession(token, store.accounts), { user: null, account: null, revoked: true });
      await store.accounts.setActive(account.id, true);
      assert.equal((await resolveSession(token, store.accounts)).user?.accountId, account.id);
    });
  }

  await test('вход сотрудника из CRM (учётка без пароля) работает: метки нет, сессия живая', async () => {
    const staff = await store.accounts.createStaff(`staff-${unique()}@demo.ru`);
    assert.equal(staff.passwordChangedAt, null);
    const token = await signSession(
      { accountId: staff.id, role: 'ADMIN', profileId: null, name: 'Сотрудник', permissions: ['students'] },
      8 * 3600,
    );
    const resolved = await resolveSession(token, store.accounts);
    assert.equal(resolved.user?.role, 'ADMIN');
    assert.deepEqual(resolved.user?.permissions, ['students']);
  });

  await test('сброс пароля по ссылке ставит метку и принимает хороший пароль', async () => {
    const email = `reset-${unique()}@demo.ru`;
    const { account } = await newStudent(store, email);
    const token = `tok-${unique()}-${'x'.repeat(30)}`;
    await store.authTokens.issue({
      accountId: account.id,
      kind: 'PASSWORD_RESET',
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const result = await resetPassword(token, 'Sirenevyj-Rassvet-31');
    assert.equal(result.status, 'RESET');
    const after = await store.accounts.findById(account.id);
    assert.ok(after?.passwordChangedAt);
    assert.equal(await verifyPassword('Sirenevyj-Rassvet-31', after?.passwordHash), true);
  });
  await test('сброс слабым паролем отклонён и ссылку не сжигает', async () => {
    const email = `reset-weak-${unique()}@demo.ru`;
    const { account } = await newStudent(store, email);
    const token = `tok-${unique()}-${'y'.repeat(30)}`;
    await store.authTokens.issue({
      accountId: account.id,
      kind: 'PASSWORD_RESET',
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    for (const weak of ['Password2026!', 'qwertyuiop', '1234567890', `${email.split('@')[0]}-1`]) {
      const result = await resetPassword(token, weak);
      assert.equal(result.status, 'WEAK', weak);
    }
    const before = await store.accounts.findById(account.id);
    assert.equal(before?.passwordChangedAt, null);
    assert.equal((await resetPassword(token, 'Sirenevyj-Rassvet-31')).status, 'RESET');
  });

  await test('сброс пароля для администратора не отправляется и не выдаёт, что аккаунт есть', async () => {
    const email = `admin-reset-${unique()}@demo.ru`;
    const staff = await store.accounts.createStaff(email);
    await store.accounts.setPassword(staff.id, await hashPassword('Tuman-Zakat-4821'));
    assert.deepEqual(await requestPasswordReset(email), { status: 'NO_ACCOUNT' });
    // И ссылка, выданная раньше, администратору пароль не задаст
    const token = `tok-${unique()}-${'z'.repeat(30)}`;
    await store.authTokens.issue({
      accountId: staff.id,
      kind: 'PASSWORD_RESET',
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    assert.equal((await resetPassword(token, 'Sirenevyj-Rassvet-31')).status, 'INVALID');
  });

  // ---------- 3. Счётчики попыток ----------
  console.log('\nПеребор кодов');
  await test('claimAttempt: параллельные запросы не обгоняют счётчик — ровно пять попыток', async () => {
    const { account } = await newStudent(store, `claim-${unique()}@demo.ru`);
    const issued = await store.authTokens.issue({
      accountId: account.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: hashEmailCode(account.id, '123456'),
      expiresAt: new Date(Date.now() + 1800_000),
    });
    const results = await Promise.all(Array.from({ length: 30 }, () => store.authTokens.claimAttempt(issued.id, 5)));
    const granted = results.filter((n): n is number => n !== null).sort((a, b) => a - b);
    assert.deepEqual(granted, [1, 2, 3, 4, 5]);
    const row = await store.authTokens.latest(account.id, 'EMAIL_VERIFY');
    assert.equal(row?.attempts, 5);
  });
  await test('claimAttempt: погашенный код попыток не даёт', async () => {
    const { account } = await newStudent(store, `claim-used-${unique()}@demo.ru`);
    const issued = await store.authTokens.issue({
      accountId: account.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: hashEmailCode(account.id, '123456'),
      expiresAt: new Date(Date.now() + 1800_000),
    });
    assert.equal(await store.authTokens.consume(issued.id), true);
    assert.equal(await store.authTokens.claimAttempt(issued.id, 5), null);
  });

  await test('подтверждение почты: сорок параллельных догадок — не больше пяти сверок', async () => {
    const { account } = await newStudent(store, `verify-${unique()}@demo.ru`);
    await store.authTokens.issue({
      accountId: account.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: hashEmailCode(account.id, '123456'),
      expiresAt: new Date(Date.now() + 1800_000),
    });
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => verifyEmailCode(account.id, String(900000 + i))),
    );
    const compared = results.filter((r) => r.status === 'WRONG' || r.status === 'LOCKED');
    assert.equal(compared.length, 40);
    // Из сорока ответов «неверно, осталось N» могло быть не больше четырёх: пятая ошибка уже «заблокировано»
    assert.ok(results.filter((r) => r.status === 'WRONG').length <= EMAIL_CODE_MAX_ATTEMPTS - 1);
    const row = await store.authTokens.latest(account.id, 'EMAIL_VERIFY');
    assert.equal(row?.attempts, EMAIL_CODE_MAX_ATTEMPTS, 'счётчик не должен уходить за предел');
    // Верный код после блокировки не принимается: перебор не должен выиграть на последней попытке
    assert.equal((await verifyEmailCode(account.id, '123456')).status, 'LOCKED');
  });
  await test('подтверждение почты: верный код с первой попытки принимается', async () => {
    const { account } = await newStudent(store, `verify-ok-${unique()}@demo.ru`);
    await store.authTokens.issue({
      accountId: account.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: hashEmailCode(account.id, '654321'),
      expiresAt: new Date(Date.now() + 1800_000),
    });
    const wrong = await verifyEmailCode(account.id, '000000');
    assert.deepEqual(wrong, { status: 'WRONG', attemptsLeft: 4 });
    assert.equal((await verifyEmailCode(account.id, '654321')).status, 'VERIFIED');
  });
  await test('подтверждение почты: верный код на последней, пятой попытке ещё проходит', async () => {
    const { account } = await newStudent(store, `verify-last-${unique()}@demo.ru`);
    await store.authTokens.issue({
      accountId: account.id,
      kind: 'EMAIL_VERIFY',
      tokenHash: hashEmailCode(account.id, '654321'),
      expiresAt: new Date(Date.now() + 1800_000),
    });
    for (let i = 0; i < EMAIL_CODE_MAX_ATTEMPTS - 1; i++) await verifyEmailCode(account.id, '000000');
    assert.equal((await verifyEmailCode(account.id, '654321')).status, 'VERIFIED');
  });

  await test('счётчик лимита точный и при параллельных запросах: ровно десять из шестидесяти', async () => {
    const id = `race-${unique()}`;
    const results = await Promise.all(Array.from({ length: 60 }, () => rateLimit('registerConfirmEmail', id)));
    assert.equal(results.filter((r) => r.ok).length, 10);
  });

  await test('регистрация: повтор старого билета не обнуляет предел по адресу', async () => {
    const email = `pending-${unique()}@demo.ru`;
    const token = await signPendingRegistration({
      kind: 'student',
      email,
      codeHash: 'не-тот-хеш',
      attempts: 0,
      sentAt: Date.now() - 120_000,
      payloadEnc: 'x',
    });
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => confirmPendingRegistration('student', token, String(100000 + i))),
    );
    // Билет с attempts=0 присылают снова и снова — предел держит счётчик по адресу, а не билет
    assert.ok(results.filter((r) => r.status === 'WRONG').length <= 10);
    assert.ok(results.some((r) => r.status === 'LOCKED'));
  });

  // ---------- 4. Повтор письма с кодом ----------
  console.log('\nПовтор письма с кодом регистрации');
  const oldTicket = (email: string) =>
    signPendingRegistration({
      kind: 'student',
      email,
      codeHash: 'x',
      attempts: 0,
      // Билет «старый»: пауза в нём давно прошла — сервер не должен верить билету
      sentAt: 0,
      payloadEnc: 'x',
    });

  await test('повтор по тому же билету сразу — пауза, даже если билет «старый»', async () => {
    const email = `resend-${unique()}@demo.ru`;
    const token = await oldTicket(email);
    const first = await resendPendingRegistration('student', token);
    assert.equal(first.status, 'SENT');
    const second = await resendPendingRegistration('student', token);
    assert.equal(second.status, 'WAIT');
    assert.ok(second.status === 'WAIT' && second.retryAfter > 0 && second.retryAfter <= 60);
  });
  await test('повтор: свой счётчик у каждой почты', async () => {
    const a = await resendPendingRegistration('student', await oldTicket(`resend-a-${unique()}@demo.ru`));
    const b = await resendPendingRegistration('student', await oldTicket(`resend-b-${unique()}@demo.ru`));
    assert.equal(a.status, 'SENT');
    assert.equal(b.status, 'SENT');
  });
  await test('повтор: параллельные запросы по одной почте — отправлено ровно одно письмо', async () => {
    const email = `resend-par-${unique()}@demo.ru`;
    const token = await oldTicket(email);
    const results = await Promise.all(Array.from({ length: 12 }, () => resendPendingRegistration('student', token)));
    assert.equal(results.filter((r) => r.status === 'SENT').length, 1);
  });
  await test('повтор: ответ одинаков для занятой и свободной почты — адрес не выдаётся', async () => {
    const taken = `resend-taken-${unique()}@demo.ru`;
    await newStudent(store, taken);
    const free = `resend-free-${unique()}@demo.ru`;
    const a = await resendPendingRegistration('student', await oldTicket(taken));
    const b = await resendPendingRegistration('student', await oldTicket(free));
    assert.equal(a.status, b.status);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  });
  if (store.kind === 'memory') {
    // Время сдвигаем подменой Date.now: счёт в памяти берёт его оттуда. На базе метка ставится самой базой.
    await test('повтор: после паузы можно, но не больше трёх писем в час на почту', async () => {
      const realNow = Date.now;
      let offset = 0;
      Date.now = () => realNow() + offset;
      try {
        const email = `resend-hour-${unique()}@demo.ru`;
        const statuses: string[] = [];
        for (let i = 0; i < 5; i++) {
          statuses.push((await resendPendingRegistration('student', await oldTicket(email))).status);
          offset += 61_000;
        }
        assert.deepEqual(statuses, ['SENT', 'SENT', 'SENT', 'LIMITED', 'LIMITED']);
        offset += 3600_000;
        assert.equal((await resendPendingRegistration('student', await oldTicket(email))).status, 'SENT');
      } finally {
        Date.now = realNow;
      }
    });
  }

  // ---------- 5. Подсказки «такой почты нет» ----------
  console.log('\nПодсказки при сбросе пароля');
  await test('первые три промаха с одного адреса — честный ответ, с четвёртого — нейтральный', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}-${unique()}`;
    const answers: boolean[] = [];
    for (let i = 0; i < 6; i++) answers.push(await answerHonestly(ip, 'NO_ACCOUNT'));
    assert.deepEqual(answers, [true, true, true, false, false, false]);
  });
  await test('«вход по коду» считается тем же промахом', async () => {
    const ip = `ip-${unique()}`;
    assert.equal(await answerHonestly(ip, 'NO_PASSWORD'), true);
    assert.equal(await answerHonestly(ip, 'NO_ACCOUNT'), true);
    assert.equal(await answerHonestly(ip, 'NO_PASSWORD'), true);
    assert.equal(await answerHonestly(ip, 'NO_ACCOUNT'), false);
  });
  await test('счётчик у каждого адреса свой', async () => {
    const a = `ip-a-${unique()}`;
    const b = `ip-b-${unique()}`;
    for (let i = 0; i < 4; i++) await answerHonestly(a, 'NO_ACCOUNT');
    assert.equal(await answerHonestly(a, 'NO_ACCOUNT'), false);
    assert.equal(await answerHonestly(b, 'NO_ACCOUNT'), true);
  });
  await test('«подождите минуту» не тратит квоту, но у исчерпавшего её тоже нейтральное', async () => {
    const ip = `ip-wait-${unique()}`;
    for (let i = 0; i < 10; i++) assert.equal(await answerHonestly(ip, 'WAIT'), true);
    for (let i = 0; i < 3; i++) assert.equal(await answerHonestly(ip, 'NO_ACCOUNT'), true);
    // Три честных ответа адрес уже получил: «подождите» теперь тоже говорил бы, что аккаунт есть
    assert.equal(await answerHonestly(ip, 'WAIT'), false);
    assert.equal(await answerHonestly(ip, 'NO_ACCOUNT'), false);
  });
  await test('отправленное письмо — не промах, ответ честный всегда', async () => {
    const ip = `ip-sent-${unique()}`;
    for (let i = 0; i < 5; i++) await answerHonestly(ip, 'NO_ACCOUNT');
    assert.equal(await answerHonestly(ip, 'SENT'), true);
  });

  // ---------- Пульс «в сети» ----------
  console.log('\nПульс «в сети»');
  await test('шесть вкладок целый час: запись не блокируется лимитом, а лимит тратится только на запись', async () => {
    const { account } = await newStudent(store, `pulse-${unique()}@demo.ru`);
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    try {
      let written = 0;
      let limited = 0;
      for (let minute = 0; minute < 60; minute++) {
        // Шесть вкладок шлют пульс каждую минуту, и ещё по одному — при возврате к вкладке
        for (let tab = 0; tab < 6; tab++) {
          const fresh = await store.accounts.findById(account.id);
          const result = await recordPulse(store, fresh, new Date(Date.now()));
          if ('limited' in result) limited++;
          else if (result.written) written++;
          offset += 100;
        }
        for (let back = 0; back < 3; back++) {
          const fresh = await store.accounts.findById(account.id);
          const result = await recordPulse(store, fresh, new Date(Date.now()));
          if ('limited' in result) limited++;
          offset += 100;
        }
        offset += 60_000 - 900;
        // «В сети» на каждой минуте: отметка не старше двух минут
        const seen = (await store.accounts.findById(account.id))?.lastSeenAt;
        assert.ok(seen && Date.now() - seen.getTime() < 120_000, `минута ${minute}: человек «давно»`);
      }
      assert.equal(limited, 0);
      assert.equal(written, 60);
      // Квота потрачена только на 60 записей, а не на 540 запросов
      const left = await rateLimit('presence', account.id);
      assert.ok(left.ok && left.remaining >= RATE_LIMITS.presence.limit - 62, String(left.remaining));
    } finally {
      Date.now = realNow;
    }
  });
  await test('лимит пульса — тысяча в час, и он всё равно режет запись, если её требуют каждую секунду', () => {
    assert.equal(RATE_LIMITS.presence.limit, 1000);
  });
  await test('нет учётной записи — пульс молча не пишется', async () => {
    assert.deepEqual(await recordPulse(store, null), { written: false });
  });

  // ---------- Сброс пароля: письмо и ответ ----------
  console.log('\nСброс пароля: письмо и ответ');
  await test('SENT не ждёт письма: письмо уходит только когда вызовут deliver()', async () => {
    const email = `defer-${unique()}@demo.ru`;
    await newStudent(store, email);
    const result = await requestPasswordReset(email);
    assert.equal(result.status, 'SENT');
    assert.equal(devOutbox(email).length, 0, 'письмо ушло до ответа');
    assert.ok(result.status === 'SENT' && (await result.deliver()) === true);
    assert.equal(devOutbox(email).length, 1);
  });
  await test('нейтральный ответ одинаков для любого исхода: статус и тело', async () => {
    const outcomes = [
      { status: 'SENT' as const, deliver: async () => true },
      { status: 'NO_ACCOUNT' as const },
      { status: 'NO_PASSWORD' as const },
      { status: 'WAIT' as const, retryAfter: 42 },
    ];
    const replies = outcomes.map((o) => resetReply(o, false));
    for (const reply of replies) {
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body, { sent: true });
      assert.equal(reply.retryAfter, undefined);
    }
  });
  await test('честный ответ различает исходы, но «отправлено» совпадает с нейтральным', () => {
    const sent = resetReply({ status: 'SENT', deliver: async () => true }, true);
    assert.deepEqual(sent, resetReply({ status: 'NO_ACCOUNT' }, false));
    assert.equal(resetReply({ status: 'NO_ACCOUNT' }, true).status, 404);
    assert.equal(resetReply({ status: 'NO_PASSWORD' }, true).status, 409);
    const wait = resetReply({ status: 'WAIT', retryAfter: 42 }, true);
    assert.equal(wait.status, 429);
    assert.equal(wait.retryAfter, 42);
  });

  // ---------- Живой поток чата: отзыв сессии ----------
  console.log('\nЖивой поток чата');
  await test('поток закрывается не позже чем через ~3 минуты после отзыва сессии', async () => {
    const { account } = await newStudent(store, `sse-${unique()}@demo.ru`);
    const token = await signSession({ accountId: account.id, role: 'STUDENT', profileId: null, name: 'Т' });
    let revoked = 0;
    const guard = createStreamGuard(token, store.accounts, () => revoked++);
    // Сессия жива: сколько ни прошло проверок — поток открыт
    for (let i = 0; i < RECHECK_EVERY_TICKS * 2; i++) await guard();
    assert.equal(revoked, 0);
    // Отключили — до ближайшей проверки поток ещё жив, на ней закрывается один раз
    await store.accounts.setActive(account.id, false);
    for (let i = 1; i < RECHECK_EVERY_TICKS; i++) await guard();
    assert.equal(revoked, 0);
    await guard();
    assert.equal(revoked, 1);
    for (let i = 0; i < RECHECK_EVERY_TICKS * 2; i++) await guard();
    assert.equal(revoked, 1);
    assert.ok(RECHECK_EVERY_TICKS * 25 <= 200, 'проверка должна идти примерно раз в три минуты');
  });
  await test('сброс пароля тоже закрывает поток', async () => {
    const { account } = await newStudent(store, `sse2-${unique()}@demo.ru`);
    const token = await signSession({ accountId: account.id, role: 'STUDENT', profileId: null, name: 'Т' });
    await sleep(3200);
    await store.accounts.setPassword(account.id, await hashPassword('Lilovyj-Tuman-2027'));
    let revoked = 0;
    const guard = createStreamGuard(token, store.accounts, () => revoked++);
    for (let i = 0; i < RECHECK_EVERY_TICKS; i++) await guard();
    assert.equal(revoked, 1);
  });
  await test('сбой базы на проверке поток не рвёт', async () => {
    const { account } = await newStudent(store, `sse3-${unique()}@demo.ru`);
    const token = await signSession({ accountId: account.id, role: 'STUDENT', profileId: null, name: 'Т' });
    let revoked = 0;
    const broken = { findById: async () => { throw new Error('база недоступна'); } };
    const guard = createStreamGuard(token, broken, () => revoked++);
    for (let i = 0; i < RECHECK_EVERY_TICKS * 2; i++) await guard();
    assert.equal(revoked, 0);
  });

  // ---------- Образ: словарь паролей ----------
  console.log('\nСборка');
  await test('Dockerfile роняет сборку, если словарь паролей не попал в standalone', () => {
    const dockerfile = readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    const build = dockerfile.indexOf('RUN npm run build');
    const guardLine = dockerfile.indexOf('RUN test -s .next/standalone/lib/security/common-passwords.txt');
    assert.ok(build > 0 && guardLine > build, 'проверка словаря должна стоять после сборки');
    assert.ok(dockerfile.indexOf('FROM base AS runner') > guardLine, 'и в стадии build, до рабочего образа');
  });
  await test('next.config кладёт словарь в трассировку', () => {
    assert.match(readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8'), /common-passwords\.txt/);
  });

  // ---------- 6. Origin ----------
  console.log('\nПроверка Origin');
  const req = (method: string, headers: Record<string, string>) =>
    new Request('https://students.example.ru/api/x', { method, headers: { host: 'students.example.ru', ...headers } });
  const rejects = (request: Request) => {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return error instanceof HttpError && error.status === 403;
    }
    return false;
  };

  await test('POST со своим Origin проходит', () => {
    assertSameOrigin(req('POST', { origin: 'https://students.example.ru' }));
  });
  await test('POST с чужим Origin отклонён', () => {
    assert.equal(rejects(req('POST', { origin: 'https://evil.example.com' })), true);
    assert.equal(rejects(req('POST', { origin: 'null' })), true);
    assert.equal(rejects(req('POST', { origin: 'null', 'sec-fetch-site': 'cross-site' })), true);
  });
  await test('Origin: null допускается, только если браузер сам говорит same-origin (WebView, редиректы)', () => {
    assertSameOrigin(req('POST', { origin: 'null', 'sec-fetch-site': 'same-origin' }));
    // Чужой Origin не спасает и заголовок Sec-Fetch-Site: сверка Origin остаётся главной
    assert.equal(rejects(req('POST', { origin: 'https://evil.example.com', 'sec-fetch-site': 'same-origin' })), true);
  });
  await test('POST без Origin и без Sec-Fetch-Site отклонён: так ходит не браузер', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(rejects(req(method, {})), true, method);
  });
  await test('POST без Origin, но с Sec-Fetch-Site: same-origin проходит', () => {
    assertSameOrigin(req('POST', { 'sec-fetch-site': 'same-origin' }));
  });
  await test('POST без Origin и с Sec-Fetch-Site: cross-site / same-site отклонён', () => {
    assert.equal(rejects(req('POST', { 'sec-fetch-site': 'cross-site' })), true);
    assert.equal(rejects(req('POST', { 'sec-fetch-site': 'same-site' })), true);
  });
  await test('чтение (GET, HEAD) без Origin не трогаем', () => {
    assertSameOrigin(req('GET', {}));
    assertSameOrigin(req('HEAD', {}));
  });

  console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
  if (failures.length) {
    console.log('Провалено:');
    for (const name of failures) console.log(`  · ${name}`);
    process.exitCode = 1;
  }
  // Prisma держит соединение — без явного выхода процесс повис бы
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error('\nПроверка не завершилась:', error);
  process.exit(1);
});
