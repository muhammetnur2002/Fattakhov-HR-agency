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
import { GET as staffStudentsList } from '../app/api/service/staff/students/route';
import { GET as staffStudentProfile } from '../app/api/service/staff/students/[id]/route';
import { searchStaffStudents, parseStaffSearch, MAX_PAGE_SIZE } from '../lib/staff-students';

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
  await test('сохранённое «не показывать» (прежнее значение) пульс не останавливает: пишется как всем', async () => {
    const { account } = await newStudent(store, `pulse-hidden-${unique()}@demo.ru`);
    await store.accounts.setShowPresence(account.id, false);
    const hidden = await store.accounts.findById(account.id);
    assert.equal(hidden?.showPresence, false);

    const at = new Date();
    assert.deepEqual(await recordPulse(store, hidden, at), { written: true });
    assert.equal((await store.accounts.findById(account.id))?.lastSeenAt?.getTime(), at.getTime());
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


  // ---------- Поиск студентов для сотрудников (служебный API для CRM) ----------
  console.log('\nПоиск студентов для сотрудников');
  {
    const secret = 'staff-search-secret-0123456789abcdef0123456789';
    const savedSecret = process.env.CRM_SERVICE_SECRET;
    process.env.CRM_SERVICE_SECRET = secret;
    const M = `Вуз${unique()}`;
    // Идентификаторы сотрудников — как cuid из CRM: латиница и цифры (в заголовок кириллица не пройдёт)
    const A = unique();
    const year = new Date().getFullYear();
    const call = (route: typeof staffStudentsList | typeof staffStudentProfile, url: string, init: { actor?: string | null; auth?: string | null } = {}) => {
      const headers: Record<string, string> = {};
      const auth = init.auth === undefined ? `Bearer ${secret}` : init.auth;
      if (auth) headers.authorization = auth;
      if (init.actor !== null) headers['x-crm-actor'] = init.actor ?? `act-${A}`;
      const id = url.split('?')[0].split('/').pop()!;
      return (route as (request: Request, props: { params: Promise<{ id: string }> }) => ReturnType<typeof staffStudentsList>)(
        new Request(`https://students.example.ru${url}`, { headers }),
        { params: Promise.resolve({ id }) },
      );
    };
    const list = async (query: string, actor?: string) => {
      const response = await call(staffStudentsList, `/api/service/staff/students?university=${encodeURIComponent(M)}&${query}`, { actor });
      assert.equal(response.status, 200, `список: ${response.status}`);
      return (await response.json()) as Awaited<ReturnType<typeof searchStaffStudents>>;
    };
    const names = (r: { items: { fullName: string }[] }) => r.items.map((i) => i.fullName);

    async function mk(opts: {
      name: string;
      age: number;
      gender: 'MALE' | 'FEMALE';
      spec: string;
      studyYear: number;
      city: string | null;
      skills: string[];
      about?: string | null;
      phone?: string | null;
    }) {
      const email = `staff-${unique()}@demo.ru`;
      const created = await store.students.createWithAccount({
        email,
        password: 'Tuman-Zakat-4821',
        fullName: opts.name,
        phone: opts.phone ?? null,
        gender: opts.gender,
        birthYear: year - opts.age,
        birthDate: `${year - opts.age}-01-01`,
        photoUrl: null,
        resumeUrl: null,
        resumeName: null,
        university: M,
        speciality: opts.spec,
        studyYear: opts.studyYear,
        city: opts.city,
        workDays: ['MON'],
        hoursPerWeek: 10,
        skills: opts.skills,
        about: opts.about ?? null,
        lookingFor: [],
        institutionId: null,
        consentVersion: 'test',
        consentIp: null,
        termsVersion: 'test',
        marketingConsent: false,
      });
      return { ...created, email };
    }

    // Регистрируются по очереди: новые первыми — это порядок обратный
    const sharipova = await mk({ name: 'Шарипова Алия', age: 19, gender: 'FEMALE', spec: 'Информатика', studyYear: 2, city: 'Казань', skills: ['Python', 'SQL'], phone: '+7 900 111-22-33', about: 'Люблю данные. '.repeat(40) });
    await sleep(15);
    const elkin = await mk({ name: 'Ёлкин Пётр', age: 22, gender: 'MALE', spec: 'Дизайн', studyYear: 4, city: 'Казань', skills: ['Figma'] });
    await sleep(15);
    const ivanov = await mk({ name: 'Иванов Иван', age: 25, gender: 'MALE', spec: 'Юриспруденция', studyYear: 3, city: 'Москва', skills: ['Excel', 'Английский B2'] });
    await sleep(15);
    const petrova = await mk({ name: 'Петрова Мария', age: 20, gender: 'FEMALE', spec: 'Информатика', studyYear: 2, city: 'Казань', skills: ['SMM'] });
    await sleep(15);
    const sidorova = await mk({ name: 'Сидорова Анна', age: 21, gender: 'FEMALE', spec: 'Маркетинг', studyYear: 3, city: 'Казань', skills: ['SMM', 'Excel'] });
    await sleep(15);
    const testov = await mk({ name: 'Тестов Тест', age: 18, gender: 'MALE', spec: 'Физика', studyYear: 1, city: null, skills: [] });

    await store.students.setStudyVerified(sharipova.student.id, true);
    await store.students.setStudyVerified(ivanov.student.id, true);
    await store.students.setStudyVerified(petrova.student.id, true);
    await store.students.setStudyDocument(elkin.student.id, { url: '/api/files/study/00000000-0000-0000-0000-000000000000.pdf', name: 'spravka.pdf' });
    await store.students.setStatus(elkin.student.id, 'PAUSED');
    await store.students.setStatus(ivanov.student.id, 'PLACED');
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    await store.accounts.setLastSeen(sidorova.account.id, minutesAgo(1));
    await store.accounts.setLastSeen(petrova.account.id, minutesAgo(1));
    await store.accounts.setShowPresence(petrova.account.id, false);
    await store.accounts.setLastSeen(testov.account.id, minutesAgo(3 * 24 * 60));

    await test('без секрета и с чужим секретом — 401, и список, и профиль', async () => {
      for (const route of [staffStudentsList, staffStudentProfile] as const) {
        const url = route === staffStudentsList ? '/api/service/staff/students' : `/api/service/staff/students/${sharipova.student.id}`;
        assert.equal((await call(route, url, { auth: null })).status, 401);
        assert.equal((await call(route, url, { auth: 'Bearer wrong-secret-wrong-secret-wrong-secret-12' })).status, 401);
        assert.equal((await call(route, url, { auth: `Basic ${secret}` })).status, 401);
      }
    });
    await test('секрет службы не настроен — 503, а не открытый доступ', async () => {
      delete process.env.CRM_SERVICE_SECRET;
      try {
        assert.equal((await call(staffStudentsList, '/api/service/staff/students', { auth: `Bearer ${secret}` })).status, 503);
      } finally {
        process.env.CRM_SERVICE_SECRET = secret;
      }
    });
    await test('список отдаёт анкету без почты, телефона, даты рождения, фото и резюме', async () => {
      const body = JSON.stringify(await list(''));
      for (const key of ['email', 'phone', 'birthDate', 'photoUrl', 'resumeUrl', 'resumeName', 'studyDocUrl', 'contacts']) {
        assert.ok(!body.includes(`"${key}"`), `в списке есть поле ${key}`);
      }
      assert.ok(!body.includes(sharipova.email), 'почта в списке');
      assert.ok(!body.includes('111-22-33'), 'телефон в списке');
      assert.ok(!body.includes(`${year - 19}-01-01`), 'дата рождения в списке');
      const result = JSON.parse(body) as Awaited<ReturnType<typeof searchStaffStudents>>;
      assert.equal(result.total, 6);
      const item = result.items.find((i) => i.id === sharipova.student.id)!;
      assert.equal(item.fullName, 'Шарипова Алия');
      assert.equal(item.age, 19);
      assert.equal(item.studyVerified, true);
      assert.ok(item.about!.length <= 201 && item.about!.endsWith('…'), '«о себе» обрезано до ~200 знаков');
    });
    await test('фильтры по вузу, специальности, курсу, городу и полу', async () => {
      assert.deepEqual(names(await list('speciality=информатика&sort=name')), ['Петрова Мария', 'Шарипова Алия']);
      assert.deepEqual(names(await list('studyYear=3&sort=name')), ['Иванов Иван', 'Сидорова Анна']);
      assert.equal((await list('city=казан')).total, 4);
      assert.deepEqual(names(await list('gender=MALE&sort=name')), ['Ёлкин Пётр', 'Иванов Иван', 'Тестов Тест']);
      assert.equal((await list('university=нет-такого-вуза')).total, 0);
    });
    await test('фильтр по возрасту точный: от 20 до 22', async () => {
      assert.deepEqual(names(await list('ageFrom=20&ageTo=22&sort=name')), ['Ёлкин Пётр', 'Петрова Мария', 'Сидорова Анна']);
      assert.deepEqual(names(await list('ageFrom=25')), ['Иванов Иван']);
      assert.deepEqual(names(await list('ageTo=18')), ['Тестов Тест']);
    });
    await test('возраст «от» больше «до» — ошибка проверки, а не пустой список', async () => {
      const response = await call(staffStudentsList, '/api/service/staff/students?ageFrom=30&ageTo=20');
      assert.equal(response.status, 400);
    });
    await test('навыки — подстрока без учёта регистра, все указанные сразу', async () => {
      assert.deepEqual(names(await list('skills=pyth')), ['Шарипова Алия']);
      assert.deepEqual(names(await list('skills=smm&sort=name')), ['Петрова Мария', 'Сидорова Анна']);
      assert.deepEqual(names(await list('skills=smm,excel')), ['Сидорова Анна']);
      assert.deepEqual(names(await list('skills=excel&sort=name')), ['Иванов Иван', 'Сидорова Анна']);
    });
    await test('статусы: учёба подтверждена / на проверке / нет, на паузе, трудоустроен', async () => {
      assert.deepEqual(names(await list('study=verified&sort=name')), ['Иванов Иван', 'Петрова Мария', 'Шарипова Алия']);
      assert.deepEqual(names(await list('study=pending')), ['Ёлкин Пётр']);
      assert.deepEqual(names(await list('study=none&sort=name')), ['Сидорова Анна', 'Тестов Тест']);
      assert.deepEqual(names(await list('status=paused')), ['Ёлкин Пётр']);
      assert.deepEqual(names(await list('status=placed')), ['Иванов Иван']);
      assert.equal((await list('status=active')).total, 4);
      const all = await list('');
      const elkinItem = all.items.find((i) => i.id === elkin.student.id)!;
      assert.equal(elkinItem.paused, true);
      assert.equal(elkinItem.studyPending, true);
      assert.equal(all.items.find((i) => i.id === ivanov.student.id)!.placed, true);
    });
    await test('поиск по имени: фамилия, часть имени, ё = е, несколько слов, вуз и навык', async () => {
      assert.deepEqual(names(await list('q=шарипова')), ['Шарипова Алия']);
      assert.deepEqual(names(await list('q=ЛИЯ')), ['Шарипова Алия']);
      assert.deepEqual(names(await list('q=елкин')), ['Ёлкин Пётр']);
      assert.deepEqual(names(await list('q=петр')).sort(), ['Петрова Мария', 'Ёлкин Пётр'].sort());
      assert.deepEqual(names(await list('q=иван иванов')), ['Иванов Иван']);
      assert.deepEqual(names(await list('q=figma')), ['Ёлкин Пётр']);
      assert.deepEqual(names(await list('q=юриспр')), ['Иванов Иван']);
      assert.equal((await list('q=несуществующий')).total, 0);
    });
    await test('поиск по имени сочетается с фильтрами', async () => {
      assert.deepEqual(names(await list('q=а&city=москва')), ['Иванов Иван']);
      assert.deepEqual(names(await list('q=ия&gender=FEMALE&study=verified&sort=name')), ['Петрова Мария', 'Шарипова Алия']);
      assert.deepEqual(names(await list('q=ия&gender=FEMALE&study=verified&city=казань&speciality=информ&sort=name')), ['Петрова Мария', 'Шарипова Алия']);
      assert.deepEqual(names(await list('q=лия&gender=MALE')), []);
    });
    await test('присутствие: скрывший показ — null, как и не заходивший; видимый — время', async () => {
      const r = await list('');
      const by = (id: string) => r.items.find((i) => i.id === id)!;
      assert.equal(by(petrova.student.id).lastSeenAt, null);
      assert.equal(by(elkin.student.id).lastSeenAt, null);
      assert.ok(by(sidorova.student.id).lastSeenAt);
      assert.ok(by(testov.student.id).lastSeenAt);
    });
    await test('«в сети за N минут» не находит скрывшего показ', async () => {
      assert.deepEqual(names(await list('onlineWithin=10')), ['Сидорова Анна']);
      assert.deepEqual(names(await list('onlineWithin=10000&sort=seen')), ['Сидорова Анна', 'Тестов Тест']);
    });
    await test('сортировка по входу: скрывшие и не заходившие в конце, порядок по скрытому времени не выдаёт', async () => {
      const r = await list('sort=seen');
      assert.deepEqual(names(r).slice(0, 2), ['Сидорова Анна', 'Тестов Тест']);
      // Петрова заходила минуту назад, но скрыла показ — места среди видимых у неё нет
      assert.ok(names(r).indexOf('Петрова Мария') >= 2);
    });
    await test('сортировка по имени, по вузу и новые регистрации первыми', async () => {
      assert.deepEqual(names(await list('sort=name')), ['Ёлкин Пётр', 'Иванов Иван', 'Петрова Мария', 'Сидорова Анна', 'Тестов Тест', 'Шарипова Алия']);
      // «Ё» в русской сортировке стоит рядом с «Е», а не после «Я»
      assert.deepEqual(names(await list('sort=new')), ['Тестов Тест', 'Сидорова Анна', 'Петрова Мария', 'Иванов Иван', 'Ёлкин Пётр', 'Шарипова Алия']);
      const byUni = await list('sort=university');
      assert.equal(byUni.total, 6);
      // Один вуз у всех: внутри него по специальности (Дизайн, Информатика, Информатика, Маркетинг, Физика, Юриспруденция)
      assert.deepEqual(byUni.items.map((i) => i.speciality), ['Дизайн', 'Информатика', 'Информатика', 'Маркетинг', 'Физика', 'Юриспруденция']);
    });
    await test('пагинация: страницы не пересекаются, потолок — 50 на страницу', async () => {
      const p1 = await list('pageSize=4&page=1');
      const p2 = await list('pageSize=4&page=2');
      assert.equal(p1.items.length, 4);
      assert.equal(p2.items.length, 2);
      assert.equal(p1.total, 6);
      assert.ok(p1.items.every((a) => !p2.items.some((b) => b.id === a.id)));
      const huge = await list('pageSize=500');
      assert.equal(huge.pageSize, MAX_PAGE_SIZE);
      assert.equal(MAX_PAGE_SIZE, 50);
      assert.ok(huge.items.length <= 50);
      assert.equal((await list('')).pageSize, 20);
      // Пагинация и в режиме с поиском в памяти
      const q1 = await list('q=а&sort=name&pageSize=2&page=2');
      assert.equal(q1.items.length, 2);
      assert.equal(q1.page, 2);
    });
    await test('слишком большая выборка для поиска по имени — подсказка «уточните фильтры», а не расшифровка всех', async () => {
      const query = parseStaffSearch(new URLSearchParams({ university: M, q: 'а' }));
      const result = await searchStaffStudents(query, new Date(), 3);
      assert.equal(result.items.length, 0);
      assert.equal(result.total, 6);
      assert.match(result.hint ?? '', /уточните фильтры/i);
      // Без поиска по имени и навыкам тот же размер выборки ничему не мешает
      const plain = await searchStaffStudents(parseStaffSearch(new URLSearchParams({ university: M })), new Date(), 3);
      assert.equal(plain.items.length, 6);
      assert.equal(plain.hint, null);
      // Сортировка по имени на большой выборке — новые первыми и пояснение
      const sorted = await searchStaffStudents(parseStaffSearch(new URLSearchParams({ university: M, sort: 'name' })), new Date(), 3);
      assert.equal(sorted.items.length, 6);
      assert.ok(sorted.hint);
    });
    await test('мусор в параметрах — 400, а не 500', async () => {
      for (const bad of ['studyYear=99', 'gender=robot', 'sort=hack', 'onlineWithin=-5', 'page=0', 'study=maybe']) {
        const response = await call(staffStudentsList, `/api/service/staff/students?${bad}`);
        assert.equal(response.status, 400, bad);
      }
      // Подозрительные строки в тексте безвредны: параметризованный запрос, в памяти — подстрока
      const response = await call(staffStudentsList, `/api/service/staff/students?city=${encodeURIComponent('\'; drop table "Student"; --')}`);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { total: number }).total, 0);
    });
    await test('список журнал не пишет', async () => {
      const count = async () => (await store.audit.list(2000)).filter((e) => e.action.startsWith('student.profile.read')).length;
      const before = await count();
      await list('q=шарипова');
      assert.equal(await count(), before);
    });

    const profileUrl = (id: string, query = '') => `/api/service/staff/students/${id}${query}`;
    const readAudit = async (action: string, studentId: string, actor: string) =>
      (await store.audit.list(2000)).filter((e) => e.action === action && e.entityId === studentId && e.actorLabel === `CRM:${actor}`);

    await test('профиль без contacts=1: все открытые поля, но без почты, телефона и даты рождения', async () => {
      const response = await call(staffStudentProfile, profileUrl(sharipova.student.id), { actor: `prof-${A}` });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.ok(!body.includes(sharipova.email) && !body.includes('111-22-33'), 'контакты без contacts=1');
      assert.ok(!body.includes(`${year - 19}-01-01`));
      const profile = JSON.parse(body);
      assert.equal(profile.fullName, 'Шарипова Алия');
      assert.equal(profile.contacts, null);
      assert.equal(profile.about.length > 200, true, 'в профиле «о себе» целиком');
      assert.deepEqual(profile.skills, ['Python', 'SQL']);
      assert.equal(profile.age, 19);
    });
    await test('contacts=1 отдаёт почту и телефон; любое другое значение — нет', async () => {
      const opened = await (await call(staffStudentProfile, profileUrl(sharipova.student.id, '?contacts=1'), { actor: `prof-${A}` })).json();
      assert.deepEqual(opened.contacts, { email: sharipova.email, phone: '+7 900 111-22-33' });
      for (const value of ['0', 'true', 'yes', '']) {
        const other = await (await call(staffStudentProfile, profileUrl(sharipova.student.id, `?contacts=${value}`), { actor: `prof-${A}` })).json();
        assert.equal(other.contacts, null, `contacts=${value}`);
      }
    });
    await test('профиль: журнал платформы с актором CRM:<id>, без ФИО, не чаще раза в 10 минут', async () => {
      const actor = `aud-${A}`;
      const id = petrova.student.id;
      await call(staffStudentProfile, profileUrl(id), { actor });
      await call(staffStudentProfile, profileUrl(id), { actor });
      const plain = await readAudit('student.profile.read', id, actor);
      assert.equal(plain.length, 1);
      assert.equal(plain[0].entity, 'Student');
      assert.ok(!JSON.stringify(plain[0]).includes('Петрова'), 'в журнале нет ФИО');
      assert.equal((await readAudit('student.profile.read.contacts', id, actor)).length, 0);

      await call(staffStudentProfile, profileUrl(id, '?contacts=1'), { actor });
      await call(staffStudentProfile, profileUrl(id, '?contacts=1'), { actor });
      assert.equal((await readAudit('student.profile.read.contacts', id, actor)).length, 1);
      // Другой сотрудник — своя запись; другой студент — тоже
      await call(staffStudentProfile, profileUrl(id, '?contacts=1'), { actor: `${actor}-b` });
      assert.equal((await readAudit('student.profile.read.contacts', id, `${actor}-b`)).length, 1);
      await call(staffStudentProfile, profileUrl(sidorova.student.id, '?contacts=1'), { actor });
      assert.equal((await readAudit('student.profile.read.contacts', sidorova.student.id, actor)).length, 1);
    });
    await test('журнал: окно дедупликации истекает', async () => {
      const entry = { accountId: null, actorLabel: `CRM:win-${M}`, action: 'student.profile.read', entity: 'Student', entityId: 'x', ip: null, userAgent: null, meta: null };
      await store.audit.log(entry);
      assert.equal(await store.audit.recentExists({ actorLabel: entry.actorLabel, action: entry.action, entityId: 'x', withinMs: 60_000 }), true);
      await sleep(30);
      assert.equal(await store.audit.recentExists({ actorLabel: entry.actorLabel, action: entry.action, entityId: 'x', withinMs: 10 }), false);
      assert.equal(await store.audit.recentExists({ actorLabel: entry.actorLabel, action: 'student.profile.read.contacts', entityId: 'x', withinMs: 60_000 }), false);
    });
    await test('профиль: без сотрудника в заголовке — 400, неизвестный студент — 404, и в журнал это не пишется', async () => {
      assert.equal((await call(staffStudentProfile, profileUrl(sharipova.student.id), { actor: null })).status, 400);
      assert.equal((await call(staffStudentProfile, profileUrl(sharipova.student.id), { actor: 'bad actor!' })).status, 400);
      const actor = `nf-${A}`;
      assert.equal((await call(staffStudentProfile, profileUrl('no-such-student', '?contacts=1'), { actor })).status, 404);
      assert.equal((await readAudit('student.profile.read.contacts', 'no-such-student', actor)).length, 0);
    });
    await test('профиль скрывшего показ: lastSeenAt = null', async () => {
      const profile = await (await call(staffStudentProfile, profileUrl(petrova.student.id), { actor: `pr-${A}` })).json();
      assert.equal(profile.lastSeenAt, null);
      const seen = await (await call(staffStudentProfile, profileUrl(sidorova.student.id), { actor: `pr-${A}` })).json();
      assert.ok(seen.lastSeenAt);
    });
    await test('лимит: поиск на сотрудника — 120 в минуту, раскрытие контактов — 60 за 10 минут', async () => {
      const rl = `rl-${A}`;
      let last = 200;
      for (let i = 0; i < RATE_LIMITS.staffStudents.limit + 1; i++) {
        last = (await call(staffStudentsList, '/api/service/staff/students?pageSize=1', { actor: rl })).status;
      }
      assert.equal(last, 429);
      // Лимит у одного сотрудника не задевает другого
      assert.equal((await call(staffStudentsList, '/api/service/staff/students?pageSize=1', { actor: `${rl}-other` })).status, 200);

      const ct = `ct-${A}`;
      const statuses: number[] = [];
      for (let i = 0; i < RATE_LIMITS.staffContacts.limit + 1; i++) {
        statuses.push((await call(staffStudentProfile, profileUrl(testov.student.id, '?contacts=1'), { actor: ct })).status);
      }
      assert.equal(statuses[RATE_LIMITS.staffContacts.limit - 1], 200);
      assert.equal(statuses[RATE_LIMITS.staffContacts.limit], 429);
    });

    if (savedSecret === undefined) delete process.env.CRM_SERVICE_SECRET;
    else process.env.CRM_SERVICE_SECRET = savedSecret;
  }

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
