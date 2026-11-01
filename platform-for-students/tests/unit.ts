/**
 * Модульные проверки правил, которые одинаково работают в форме и на сервере:
 * возраст, ИНН, часы по дням, сроки справки и ожидающих откликов.
 *
 *   npm run test:unit
 *
 * Без сервера и базы. Сквозная проверка (npm run smoke) проходит те же
 * правила через API, но граничные даты — 29 февраля, полночь по Москве —
 * через API не проверить: время там всегда «сейчас».
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import ts from 'typescript';
import { verifyStaffTicket } from '../lib/security/staff-ticket';
import { crmQueueSignature, verifyCrmQueueRequest } from '../lib/security/crm-queue-signature';
import { buildCrmReviewItems } from '../lib/crm-review-queue';
import { staffCan, staffHome } from '../lib/staff-permissions';
import { ageFromIso, fullYears, parseIsoDate } from '../lib/age';
import { hasCompanyProfile, innSchema } from '../lib/company';
import { isValidInn } from '../lib/inn';
import { rankInstitutions } from '../lib/rating';
import { fitHours, maxHoursPerWeek } from '../lib/schedule';
import { addWorkdays, applicationsOpen, isPendingExpired, studyStatus, workdaysLeft } from '../lib/study';
import { isCodeShape, maskEmail, normalizeCode, resendWaitSeconds } from '../lib/account-codes';
import { applicationStatusMail, emailCodeMail, escapeHtml, messagesDigestMail, passwordResetMail } from '../lib/mail/templates';
import { birthDateSchema, consentFields, emailCodeSchema, passwordSchema, registrationSteps, requiredPhoneSchema } from '../lib/validation';
import { vacancyInputSchema } from '../lib/vacancy';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../lib/password-policy';
import { commonPasswordCount, isCommonPassword } from '../lib/security/common-passwords';
import { weakPasswordMessage } from '../lib/security/password-check';
import { canSignInWithPassword, passwordHashForLogin } from '../lib/security/login-policy';
import { safeNext } from '../lib/security/safe-next';
import { BANNER_VERSION, isAccepted, isAnswered } from '../lib/analytics/consent';
import bcryptjs from 'bcryptjs';
import { hashPassword, verifyPassword } from '../lib/security/password';
import { formatWait } from '../lib/wait-format';
import nodemailer from 'nodemailer';
import { secureSmtpUrl } from '../lib/mail/smtp-url';
import {
  PRESENCE_TICK_MS,
  effectiveShowPresence,
  formatPresence,
  presenceNow,
  shouldWritePresence,
  visibleLastSeen,
} from '../lib/presence';
import { apiErrorMessage } from '../lib/api-client';
import { isMeaningfulDraft, NEVER_STORED, parseDraft, serializeDraft } from '../lib/registration-draft';
import { vapidProblem } from '../lib/push/config';
import { endpointHash, isPublicAddress, pushServiceName } from '../lib/push/guard';
import { PRIVACY, STUDENT_CONSENT, STUDENT_CONSENT_VERSION, needsConsentRenewal } from '../lib/legal';
import { base64UrlByteLength, isAcceptablePushEndpoint, pushSubscriptionSchema } from '../lib/push/validation';
import { proxy } from '../proxy';
import { signSession, SESSION_COOKIE, HOME_BY_ROLE } from '../lib/security/session';
import { ACCENT_STEP, FONT_BREAKPOINTS, FONT_STEPS, FONT_STEP_CLASSES } from '../lib/type-scale';
import { cn, initials } from '../lib/utils';
import {
  REDUCED_MOTION_QUERY,
  getReducedMotionServerSnapshot,
  getReducedMotionSnapshot,
  subscribeReducedMotion,
} from '../lib/hooks/useReducedMotionSafe';
import tailwindConfig from '../tailwind.config';
import {
  NOINDEX_METADATA,
  NOINDEX_PREFIXES,
  OG_IMAGE,
  PUBLIC_PAGES,
  ROBOTS_DISALLOW,
  absoluteUrl,
  buildRobots,
  buildSitemap,
  isNoindexPath,
  pageMetadata,
} from '../lib/seo';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Асинхронные проверки: итог печатается после их завершения (в конце файла). */
const pending: Promise<void>[] = [];
function testAsync(name: string, fn: () => Promise<void>) {
  pending.push(
    fn().then(
      () => {
        passed++;
        console.log(`  ok   ${name}`);
      },
      (error) => {
        failures.push(name);
        console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
      },
    ),
  );
}

console.log('Дата рождения');
test('несуществующая дата не разбирается', () => {
  assert.equal(parseIsoDate('2005-02-30'), null);
  assert.equal(parseIsoDate('2005-13-01'), null);
  assert.equal(parseIsoDate('2005-04'), null);
});
test('29 февраля високосного года — настоящая дата', () => {
  assert.deepEqual(parseIsoDate('2004-02-29'), { year: 2004, month: 2, day: 29 });
});
test('18 лет исполняется в день рождения, не раньше', () => {
  const birth = { year: 2008, month: 9, day: 15 };
  assert.equal(fullYears(birth, { year: 2026, month: 9, day: 14 }), 17);
  assert.equal(fullYears(birth, { year: 2026, month: 9, day: 15 }), 18);
});
test('родившийся 29 февраля становится старше 1 марта', () => {
  const birth = { year: 2008, month: 2, day: 29 };
  assert.equal(fullYears(birth, { year: 2026, month: 2, day: 28 }), 17);
  assert.equal(fullYears(birth, { year: 2026, month: 3, day: 1 }), 18);
});
test('возраст считается по календарю Москвы', () => {
  // 21:30 UTC 14 сентября — уже 00:30 15 сентября в Москве
  assert.equal(ageFromIso('2008-09-15', new Date('2026-09-14T21:30:00Z')), 18);
  assert.equal(ageFromIso('2008-09-15', new Date('2026-09-14T20:30:00Z')), 17);
});
test('шаг регистрации требует полную дату', () => {
  const base = { fullName: 'Тест Тестов', gender: 'MALE' as const };
  assert.equal(registrationSteps.identity.safeParse({ ...base, birthDate: '2005-04-12' }).success, true);
  assert.equal(registrationSteps.identity.safeParse({ ...base, birthDate: '' }).success, false);
  assert.equal(registrationSteps.identity.safeParse({ ...base, birthDate: '2015-04-12' }).success, false);
});

console.log('\nИНН');
test('ИНН организации с верной контрольной цифрой', () => {
  assert.equal(isValidInn('7707083893'), true);
  assert.equal(isValidInn('7707083894'), false);
});
test('ИНН предпринимателя: обе контрольные цифры', () => {
  assert.equal(isValidInn('500100732001'), true);
  assert.equal(isValidInn('500100732002'), false);
});
test('ИНН из формы очищается от пробелов и проверяется', () => {
  assert.equal(innSchema.parse(' 7707 083 893 '), '7707083893');
  assert.equal(innSchema.safeParse('1234567890').success, false);
  assert.equal(innSchema.safeParse('12345').success, false);
});
test('клиенту CRM для отправки вакансии ИНН не нужен — он сверен по договору', () => {
  const base = { companyName: 'Кофейни «Север»', contactName: 'Иван Иванов' };
  assert.equal(hasCompanyProfile({ ...base, inn: null, crmClientId: 'client-sever' }), true);
  assert.equal(hasCompanyProfile({ ...base, inn: null, crmClientId: null }), false);
  assert.equal(hasCompanyProfile({ ...base, inn: '7707083893', crmClientId: null }), true);
  assert.equal(hasCompanyProfile({ companyName: '', contactName: '', inn: null, crmClientId: 'client-sever' }), false);
});

console.log('\nЧасы по дням');
test('потолок — восемь часов в день и сорок в неделю', () => {
  assert.equal(maxHoursPerWeek(1), 8);
  assert.equal(maxHoursPerWeek(3), 24);
  assert.equal(maxHoursPerWeek(7), 40);
});
test('часы подгоняются под дни наибольшим вариантом', () => {
  assert.equal(fitHours(20, 1), 8);
  assert.equal(fitHours(40, 3), 24);
  assert.equal(fitHours(12, 3), 12);
  assert.equal(fitHours(null, 1), null);
});
test('шаг графика отвергает часы, которые не помещаются в дни', () => {
  assert.equal(registrationSteps.schedule.safeParse({ workDays: ['MON'], hoursPerWeek: 20 }).success, false);
  assert.equal(registrationSteps.schedule.safeParse({ workDays: ['MON'], hoursPerWeek: 8 }).success, true);
});

console.log('\nСправка и ожидающие отклики');
test('четыре рабочих дня пропускают выходные', () => {
  // Пятница 11 сентября 2026 → четверг 17 сентября
  const deadline = addWorkdays(new Date(2026, 8, 11, 10), 4);
  assert.equal(deadline.getDate(), 17);
  assert.equal(workdaysLeft(deadline, new Date(2026, 8, 11, 11)), 4);
  assert.equal(workdaysLeft(deadline, new Date(2026, 8, 17, 9)), 0);
});
test('ожидающий отклик истекает ровно через 14 дней', () => {
  const swiped = new Date('2026-09-01T10:00:00Z');
  assert.equal(isPendingExpired(swiped, new Date('2026-09-15T09:59:00Z')), false);
  assert.equal(isPendingExpired(swiped, new Date('2026-09-15T10:00:00Z')), true);
});
test('статус учёбы складывается из отметки, файла и причины', () => {
  assert.equal(studyStatus({ studyVerified: true, studyDocUrl: null, studyReviewNote: null }), 'VERIFIED');
  assert.equal(studyStatus({ studyVerified: false, studyDocUrl: '/api/files/study/x.pdf', studyReviewNote: 'старая' }), 'PENDING');
  assert.equal(studyStatus({ studyVerified: false, studyDocUrl: null, studyReviewNote: 'нечитаемо' }), 'REJECTED');
  assert.equal(studyStatus({ studyVerified: false, studyDocUrl: null, studyReviewNote: null }), 'NONE');
});

console.log('\nРейтинг вузов');
const school = (slug: string, students: number, hired: number) => ({
  slug,
  label: slug.toUpperCase(),
  name: slug,
  students,
  applications: students * 2,
  invited: hired,
  hired,
});
test('меньше пяти студентов — цифры не публикуются', () => {
  const [row] = rankInstitutions([school('a', 4, 1)]);
  assert.equal(row.students, null);
  assert.equal(row.share, null);
  assert.equal(row.place, null);
});
test('от пяти до девяти — цифры есть, места нет', () => {
  const [row] = rankInstitutions([school('a', 7, 2)]);
  assert.equal(row.students, 7);
  assert.equal(row.share, 29);
  assert.equal(row.place, null);
});
test('место — по доле, при равной доле выше тот, где работающих больше; ничья делит место', () => {
  const rows = rankInstitutions([school('x', 20, 10), school('y', 10, 5), school('z', 10, 6), school('w', 10, 5)]);
  const place = (slug: string) => rows.find((r) => r.slug === slug)?.place;
  assert.equal(place('z'), 1);
  assert.equal(place('x'), 2);
  assert.equal(place('y'), 3);
  assert.equal(place('w'), 3);
});

console.log('\nПочта');
test('код из поля ввода: пробелы и дефисы отбрасываются', () => {
  assert.equal(normalizeCode(' 12-34 56 '), '123456');
  assert.equal(isCodeShape('123456'), true);
  assert.equal(isCodeShape('12345'), false);
  assert.equal(emailCodeSchema.parse({ code: '12 34 56' }).code, '123456');
  assert.equal(emailCodeSchema.safeParse({ code: '12ab' }).success, false);
});
test('повторный код — не раньше чем через минуту', () => {
  const sent = new Date('2026-09-15T10:00:00Z');
  assert.equal(resendWaitSeconds(null), 0);
  assert.equal(resendWaitSeconds(sent, new Date('2026-09-15T10:00:20Z')), 40);
  assert.equal(resendWaitSeconds(sent, new Date('2026-09-15T10:01:00Z')), 0);
});
test('адрес в подсказке скрыт, домен виден', () => {
  assert.equal(maskEmail('alice@mail.ru'), 'a***@mail.ru');
  assert.equal(maskEmail('не адрес'), '***');
});
test('отклики уходят, только когда подтверждены и учёба, и почта, и дозаполнен вуз', () => {
  const at = new Date();
  const filled = { university: 'КФУ', speciality: 'Экономика', studyYear: 2 };
  const unfilled = { university: '', speciality: '', studyYear: 0 };
  assert.equal(applicationsOpen({ studyVerified: true, ...filled }, { emailVerifiedAt: at }), true);
  assert.equal(applicationsOpen({ studyVerified: true, ...filled }, { emailVerifiedAt: null }), false);
  assert.equal(applicationsOpen({ studyVerified: false, ...filled }, { emailVerifiedAt: at }), false);
  assert.equal(applicationsOpen({ studyVerified: true, ...filled }, null), false);
  // Упрощённая регистрация могла не спросить вуз — до дозаполнения в
  // профиле отклики ждут, как и без подтверждения учёбы или почты
  assert.equal(applicationsOpen({ studyVerified: true, ...unfilled }, { emailVerifiedAt: at }), false);
});
test('письмо с кодом: код в теме, тексте и HTML', () => {
  const mail = emailCodeMail({ code: '042917', minutes: 30 });
  assert.ok(mail.subject.includes('042917'));
  assert.ok(mail.text.includes('Код: 042917'));
  assert.ok(mail.html.includes('042917'));
});
test('письмо с кодом: превью с кодом, код раньше срока и оговорки', () => {
  const mail = emailCodeMail({ code: '042917', minutes: 30 });
  assert.ok(mail.html.includes('Код 042917 — действует 30 минут'));
  assert.ok(mail.html.indexOf('>042917<') < mail.html.indexOf('Код действует 30 минут'));
  assert.ok(mail.text.indexOf('Код: 042917') < mail.text.indexOf('Код действует 30 минут'));
});
test('HTML письма — в стиле платформы: тёмное полотно, белый знак, без перекраски клиентом', () => {
  const mail = emailCodeMail({ code: '042917', minutes: 30 });
  assert.ok(mail.html.includes('/brand/logo-light.png'));
  assert.ok(mail.html.includes('<meta name="color-scheme" content="dark light">'));
  assert.ok(mail.html.includes('bgcolor="#000000"'));
  assert.ok(mail.html.includes('Fattakhov Students'));
});
test('кавычки в стилях писем не рвут атрибут style', () => {
  // Двойная кавычка внутри style="…" (например, "Segoe UI" в стеке шрифтов)
  // закрывает атрибут раньше времени: остаток стиля превращается в мусорные
  // атрибуты тега, и кнопка становится синей подчёркнутой ссылкой
  for (const mail of [
    emailCodeMail({ code: '042917', minutes: 30 }),
    passwordResetMail({ url: 'https://students.example.org/reset/abc', minutes: 60 }),
  ]) {
    assert.ok(!/style="[^"]*"[^\s>/]/.test(mail.html), mail.subject);
  }
});
test('HTML письма экранирует текст', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  const mail = messagesDigestMail({ count: 2, title: '<script>alert(1)</script>', url: 'https://example.org/messages' });
  assert.ok(!mail.html.includes('<script>'));
});
test('ссылка сброса есть и в тексте, и в кнопке', () => {
  const mail = passwordResetMail({ url: 'https://students.example.org/reset/abc', minutes: 60 });
  assert.ok(mail.text.includes('https://students.example.org/reset/abc'));
  assert.ok(mail.html.includes('href="https://students.example.org/reset/abc"'));
});
test('на новый отклик письма студенту нет, на приглашение — есть', () => {
  assert.equal(applicationStatusMail({ status: 'NEW', company: 'А', title: 'Б', url: 'https://x.org' }), null);
  assert.ok(applicationStatusMail({ status: 'INVITED', company: 'А', title: 'Б', url: 'https://x.org' })?.subject.includes('приглашают'));
});

console.log('\nВход из CRM');
const ssoSecret = 'k'.repeat(40);
function signTicket(claims: Record<string, unknown>, secret = ssoSecret): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      v: 1, iss: 'fattakhov-crm', aud: 'fattakhov-students', kind: 'staff', sub: 'usr_1', email: 'Staff@Agency.ru',
      name: 'Анна', position: 'Администратор', permissions: ['students'], iat: now, exp: now + 60,
      jti: 'j'.repeat(22), ...claims,
    }),
  ).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function signClientTicket(claims: Record<string, unknown>, secret = ssoSecret): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      v: 1, iss: 'fattakhov-crm', aud: 'fattakhov-students', kind: 'client', sub: 'usr_client_1',
      crmClientId: 'client_a', companyName: 'Кофейни «Север»', contactName: 'Анна',
      contactEmail: 'Anna@Sever.ru', iat: now, exp: now + 60, jti: 'j'.repeat(22), ...claims,
    }),
  ).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
test('верный билет из CRM принимается, почта — в нижнем регистре', () => {
  const result = verifyStaffTicket(signTicket({}), ssoSecret);
  assert.equal(result.ok, true);
  if (result.ok && result.ticket.kind === 'staff') {
    assert.equal(result.ticket.email, 'staff@agency.ru');
    assert.deepEqual(result.ticket.permissions, ['students']);
  }
});
test('билет клиента CRM принимается, почта — в нижнем регистре', () => {
  const result = verifyStaffTicket(signClientTicket({}), ssoSecret);
  assert.equal(result.ok, true);
  if (result.ok && result.ticket.kind === 'client') {
    assert.equal(result.ticket.crmClientId, 'client_a');
    assert.equal(result.ticket.companyName, 'Кофейни «Север»');
    assert.equal(result.ticket.contactEmail, 'anna@sever.ru');
  }
});
test('билет клиента без crmClientId или компании не проходит', () => {
  assert.equal(verifyStaffTicket(signClientTicket({ crmClientId: '' }), ssoSecret).ok, false);
  assert.equal(verifyStaffTicket(signClientTicket({ companyName: '' }), ssoSecret).ok, false);
  assert.equal(verifyStaffTicket(signClientTicket({ contactEmail: 'не почта' }), ssoSecret).ok, false);
});
test('чужая подпись, истёкший срок, чужой адресат и мусор не проходят', () => {
  assert.deepEqual(verifyStaffTicket(signTicket({}, 'x'.repeat(40)), ssoSecret), { ok: false, reason: 'SIGNATURE' });
  const past = Math.floor(Date.now() / 1000) - 120;
  assert.deepEqual(verifyStaffTicket(signTicket({ iat: past, exp: past + 60 }), ssoSecret), { ok: false, reason: 'EXPIRED' });
  assert.deepEqual(verifyStaffTicket(signTicket({ aud: 'другое' }), ssoSecret), { ok: false, reason: 'CLAIMS' });
  assert.deepEqual(verifyStaffTicket('мусор', ssoSecret), { ok: false, reason: 'FORMAT' });
});
test('билет без известных разделов или с долгим сроком не принимается', () => {
  assert.equal(verifyStaffTicket(signTicket({ permissions: ['admin'] }), ssoSecret).ok, false);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyStaffTicket(signTicket({ iat: now, exp: now + 3600 }), ssoSecret).ok, false);
});
test('разделы сотрудника: без списка — всё, со списком — только выданное', () => {
  assert.equal(staffCan({ role: 'ADMIN' }, 'moderation'), true);
  assert.equal(staffCan({ role: 'ADMIN', permissions: ['students'] }, 'moderation'), false);
  assert.equal(staffCan({ role: 'STUDENT' }, 'students'), false);
  assert.equal(staffHome(['pilot', 'students']), '/admin/students');
});


console.log('\nОчередь проверок для CRM');
test('запрос CRM с верной подписью и свежей меткой принимается', () => {
  const now = 1_790_000_000;
  assert.equal(verifyCrmQueueRequest(String(now), crmQueueSignature(ssoSecret, now), ssoSecret, now), true);
  assert.equal(verifyCrmQueueRequest(String(now - 200), crmQueueSignature(ssoSecret, now - 200), ssoSecret, now), true);
});
test('чужая подпись, старая метка, подпись билета вместо подписи очереди — отказ', () => {
  const now = 1_790_000_000;
  assert.equal(verifyCrmQueueRequest(String(now), crmQueueSignature('x'.repeat(40), now), ssoSecret, now), false);
  assert.equal(verifyCrmQueueRequest(String(now - 301), crmQueueSignature(ssoSecret, now - 301), ssoSecret, now), false);
  assert.equal(verifyCrmQueueRequest(null, null, ssoSecret, now), false);
  const ticketLike = crypto.createHmac('sha256', ssoSecret).update(String(now)).digest('base64url');
  assert.equal(verifyCrmQueueRequest(String(now), ticketLike, ssoSecret, now), false);
});
test('в очередь идут только ждущие проверки, справки — без имён студентов', () => {
  const at = new Date('2026-09-24T09:00:00.000Z');
  const items = buildCrmReviewItems({
    employers: [
      { id: 'e1', companyName: 'Кофейни «Север»', moderationStatus: 'PENDING', createdAt: at },
      { id: 'e2', companyName: 'Уже проверенная', moderationStatus: 'APPROVED', createdAt: at },
    ],
    pendingVacancies: [{ id: 'v1', title: 'Бариста', employerId: 'e2', submittedAt: at, createdAt: at }],
    students: [
      { id: 's1', university: 'КФУ', studyYear: 3, studyVerified: false, studyDocUrl: '/api/files/study/x.pdf', studyReviewNote: null, studyDocAt: at, createdAt: at },
      { id: 's2', university: 'КФУ', studyYear: 2, studyVerified: true, studyDocUrl: '/api/files/study/y.pdf', studyReviewNote: null, studyDocAt: at, createdAt: at },
      { id: 's3', university: 'КНИТУ', studyYear: 1, studyVerified: false, studyDocUrl: null, studyReviewNote: null, studyDocAt: null, createdAt: at },
    ],
  });
  assert.deepEqual(items, [
    { kind: 'company', id: 'e1', title: 'Кофейни «Север»', submittedAt: '2026-09-24T09:00:00.000Z' },
    { kind: 'vacancy', id: 'v1', title: 'Бариста · Уже проверенная', submittedAt: '2026-09-24T09:00:00.000Z' },
    { kind: 'study', id: 's1', title: 'КФУ, 3 курс', submittedAt: '2026-09-24T09:00:00.000Z' },
  ]);
});
test('справка до дозаполнения профиля — без вуза и курса, но в очереди', () => {
  const at = new Date('2026-09-24T09:00:00.000Z');
  const items = buildCrmReviewItems({
    employers: [],
    pendingVacancies: [],
    students: [
      { id: 's4', university: '', studyYear: 0, studyVerified: false, studyDocUrl: '/api/files/study/z.pdf', studyReviewNote: null, studyDocAt: at, createdAt: at },
    ],
  });
  assert.deepEqual(items, [{ kind: 'study', id: 's4', title: 'Вуз не указан', submittedAt: '2026-09-24T09:00:00.000Z' }]);
});

const UUID = '123e4567-e89b-12d3-a456-426614174000';
test('фото и резюме — только наши загруженные файлы', () => {
  const photo = (photoUrl: string | null) => registrationSteps.photo.safeParse({ photoUrl }).success;
  const resume = (resumeUrl: string | null) =>
    registrationSteps.skills.safeParse({ skills: [], about: null, resumeUrl, resumeName: null }).success;
  assert.equal(photo(null), true);
  assert.equal(photo(`/api/files/photo/${UUID}.jpg`), true);
  assert.equal(photo('javascript:alert(1)'), false);
  assert.equal(photo('https://evil.example/x.jpg'), false);
  assert.equal(photo(`/api/files/resume/${UUID}.pdf`), false);
  assert.equal(photo(`/api/files/photo/${UUID}.svg`), false);
  assert.equal(resume(`/api/files/resume/${UUID}.pdf`), true);
  assert.equal(resume('data:text/html,<script>1</script>'), false);
});
test('адрес возврата после входа — только путь внутри сайта', () => {
  assert.equal(safeNext('/feed'), '/feed');
  assert.equal(safeNext('/employer?tab=1'), '/employer?tab=1');
  assert.equal(safeNext('//evil.example'), null);
  assert.equal(safeNext('/\\evil.example'), null);
  assert.equal(safeNext('https://evil.example'), null);
  assert.equal(safeNext('javascript:alert(1)'), null);
  assert.equal(safeNext('/a\nb'), null);
  assert.equal(safeNext(null), null);
});

test('выбор по аналитике: согласие засчитывается только текущей версии текста', () => {
  const stored = (choice: string, version: string) => JSON.stringify({ choice, version, at: '2026-10-01T00:00:00.000Z' });
  assert.equal(isAccepted(null), false);
  assert.equal(isAnswered(null), false);
  assert.equal(isAccepted(stored('accepted', BANNER_VERSION)), true);
  assert.equal(isAnswered(stored('rejected', BANNER_VERSION)), true);
  assert.equal(isAccepted(stored('rejected', BANNER_VERSION)), false);
  // старая версия текста — баннер должен показаться снова
  assert.equal(isAnswered(stored('accepted', '2000-01-01')), false);
  assert.equal(isAccepted(stored('accepted', '2000-01-01')), false);
  // мусор вместо выбора страницу не роняет
  assert.equal(isAccepted('не json'), false);
  assert.equal(isAnswered('{"choice":"maybe","version":"' + BANNER_VERSION + '"}'), false);
});

// ---------- Пуш-уведомления ----------

test('пуш: адрес подписки — только https-служба с именем, не внутренняя сеть', () => {
  assert.equal(isAcceptablePushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isAcceptablePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(isAcceptablePushEndpoint('https://web.push.apple.com/abc'), true);
  assert.equal(isAcceptablePushEndpoint('http://fcm.googleapis.com/x'), false); // не https
  assert.equal(isAcceptablePushEndpoint('https://169.254.169.254/latest'), false); // метаданные облака
  assert.equal(isAcceptablePushEndpoint('https://10.10.0.5/x'), false);
  assert.equal(isAcceptablePushEndpoint('https://[::1]/x'), false);
  assert.equal(isAcceptablePushEndpoint('https://localhost/x'), false);
  assert.equal(isAcceptablePushEndpoint('https://db.internal/x'), false);
  assert.equal(isAcceptablePushEndpoint('https://fcm.googleapis.com:8443/x'), false); // нестандартный порт
  assert.equal(isAcceptablePushEndpoint('https://user:pass@fcm.googleapis.com/x'), false);
  assert.equal(isAcceptablePushEndpoint('не адрес'), false);
});

test('пуш: сервер не ходит на закрытые адреса и принимает публичные', () => {
  for (const address of ['10.10.0.4', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', 'не-адрес']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['142.250.74.10', '17.253.144.10', '2a00:1450:4010:c0e::5f']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('пуш: ключи подписки проверяются по длине, лишнее «=» отбрасывается', () => {
  const p256dh = 'B' + 'A'.repeat(86); // 65 байт в base64url: 87 символов
  const auth = 'A'.repeat(22); // 16 байт
  assert.equal(base64UrlByteLength(p256dh), 65);
  assert.equal(base64UrlByteLength(auth), 16);
  const ok = pushSubscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: p256dh + '=', auth } });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.keys.p256dh.endsWith('='), false);
  assert.equal(pushSubscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'коротко', auth } }).success, false);
  assert.equal(pushSubscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh, auth: 'AAAA' } }).success, false);
  assert.equal(pushSubscriptionSchema.safeParse({ endpoint: 'https://10.0.0.1/x', keys: { p256dh, auth } }).success, false);
});

test('пуш: настройка VAPID — все три значения, ключи из одной пары', () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const good = {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
    subject: 'mailto:info@fattakhovhr.ru',
  };
  assert.equal(vapidProblem(good), null);
  assert.equal(vapidProblem({ ...good, subject: 'https://fattakhovhr.ru' }), null);
  assert.match(vapidProblem({ ...good, subject: '' }) ?? '', /три переменные/);
  assert.match(vapidProblem({ ...good, subject: 'info@fattakhovhr.ru' }) ?? '', /VAPID_SUBJECT/);
  assert.match(vapidProblem({ ...good, publicKey: 'коротко' }) ?? '', /открытый ключ/);
  assert.match(vapidProblem({ ...good, privateKey: 'AAAA' }) ?? '', /закрытый ключ/);
  const other = crypto.createECDH('prime256v1');
  other.generateKeys();
  assert.match(vapidProblem({ ...good, publicKey: other.getPublicKey().toString('base64url') }) ?? '', /разных пар/);
});

test('пуш: отпечаток адреса стабилен, имя службы понятно человеку', () => {
  assert.equal(endpointHash('https://fcm.googleapis.com/x'), endpointHash('https://fcm.googleapis.com/x'));
  assert.notEqual(endpointHash('https://fcm.googleapis.com/x'), endpointHash('https://fcm.googleapis.com/y'));
  assert.equal(pushServiceName('https://fcm.googleapis.com/fcm/send/abc'), 'Google');
  assert.equal(pushServiceName('https://web.push.apple.com/abc'), 'Apple');
  assert.equal(pushServiceName('https://updates.push.services.mozilla.com/x'), 'Mozilla');
});

test('время ожидания: секунды до минуты, дальше минуты вверх', () => {
  assert.equal(formatWait(1), '1 с');
  assert.equal(formatWait(59), '59 с');
  assert.equal(formatWait(60), '1 мин');
  assert.equal(formatWait(61), '2 мин');
  assert.equal(formatWait(1324), '23 мин');
  assert.equal(formatWait(0), '1 с');
});

testAsync('пароли: хеши bcryptjs и нативного bcrypt читаются друг другом', async () => {
  const plain = 'Совместимость-12345!';
  // Пароль, сохранённый прежним кодом (bcryptjs), проверяется нативным модулем
  const legacy = bcryptjs.hashSync(plain, 12);
  assert.equal(await verifyPassword(plain, legacy), true);
  assert.equal(await verifyPassword(plain + 'x', legacy), false);
  // Новый хеш (нативный) проверяется и нативным кодом, и старым bcryptjs
  const fresh = await hashPassword(plain);
  assert.match(fresh, /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword(plain, fresh), true);
  assert.equal(bcryptjs.compareSync(plain, fresh), true);
  assert.equal(bcryptjs.compareSync(plain + 'x', fresh), false);
});

testAsync('пароли: нет хеша — сравнение с заглушкой, ответ «неверно»', async () => {
  assert.equal(await verifyPassword('любой', null), false);
  assert.equal(await verifyPassword('любой', undefined), false);
});

// --- «В сети» и «был(а) последний раз» ---------------------------------
// Время задаётся с явным московским смещением: иначе проверки прошли бы
// на машине разработчика и упали на сервере в другой зоне.
const MSK_NOW = new Date('2026-10-04T21:40:00+03:00');
const seen = (iso: string) => formatPresence(new Date(iso), MSK_NOW);

test('только что — «В сети» с зелёной точкой', () => {
  assert.deepEqual(seen('2026-10-04T21:40:00+03:00'), { online: true, text: 'В сети' });
});

test('две минуты — ещё в сети: это один пропущенный пульс', () => {
  assert.equal(seen('2026-10-04T21:38:00+03:00').online, true);
});

test('три минуты — уже не в сети', () => {
  assert.deepEqual(seen('2026-10-04T21:37:00+03:00'), { online: false, text: 'был(а) 3 мин назад' });
});

test('ровно 59 минут — ещё в минутах, это верхняя граница правила', () => {
  assert.equal(seen('2026-10-04T20:41:00+03:00').text, 'был(а) 59 мин назад');
});

test('ровно час — уже не в минутах, а со временем', () => {
  assert.equal(seen('2026-10-04T20:40:00+03:00').text, 'был(а) сегодня в 20:40');
});

test('сегодня — со временем по Москве', () => {
  assert.equal(seen('2026-10-04T18:40:00+03:00').text, 'был(а) сегодня в 18:40');
});

test('вчера — отдельная формулировка, а не «21 ч назад»', () => {
  assert.equal(seen('2026-10-03T21:00:00+03:00').text, 'был(а) вчера в 21:00');
});

test('в этом году — день и месяц без времени', () => {
  assert.equal(seen('2026-09-12T10:00:00+03:00').text, 'был(а) 12 сент.');
});

test('прошлый год — «давно», без точной даты', () => {
  assert.equal(seen('2025-12-31T10:00:00+03:00').text, 'был(а) давно');
});

test('не заходил ни разу — «давно», а не пусто', () => {
  assert.deepEqual(formatPresence(null, MSK_NOW), { online: false, text: 'был(а) давно' });
});

test('отметка из будущего — рассинхрон часов, а не машина времени', () => {
  assert.equal(formatPresence(new Date('2026-10-04T21:45:00+03:00'), MSK_NOW).online, true);
});

test('сразу после московской полуночи вчерашнее становится «вчера»', () => {
  const midnight = new Date('2026-10-05T00:10:00+03:00');
  // Двадцать минут назад — это ещё «20 мин назад»: правило минут идёт первым
  assert.equal(formatPresence(new Date('2026-10-04T23:50:00+03:00'), midnight).text, 'был(а) 20 мин назад');
  // А то, что было вечером, уже вчерашнее, хотя прошло всего три часа
  assert.equal(formatPresence(new Date('2026-10-04T21:00:00+03:00'), midnight).text, 'был(а) вчера в 21:00');
});

test('статус виден всегда: сохранённое «выключено» ни на что не влияет, скрывает только отсутствие права', () => {
  const at = new Date('2026-10-04T21:00:00+03:00');
  // Студент и работодатель скрыть статус не могут: прежнее false из базы игнорируется
  assert.equal(visibleLastSeen({ lastSeenAt: at, showPresence: false }, true), at);
  assert.equal(visibleLastSeen({ lastSeenAt: at, showPresence: true }, false), null);
  assert.equal(visibleLastSeen({ lastSeenAt: at, showPresence: true }, true), at);
  assert.equal(visibleLastSeen({ lastSeenAt: null, showPresence: false }, true), null);
});

test('effectiveShowPresence: всегда true, что бы ни лежало в базе', () => {
  assert.equal(effectiveShowPresence({ showPresence: false }), true);
  assert.equal(effectiveShowPresence({ showPresence: true }), true);
  assert.equal(effectiveShowPresence(null), true);
  assert.equal(effectiveShowPresence(undefined), true);
});

test('пульс пишется не чаще раза в минуту', () => {
  const now = new Date('2026-10-04T21:40:00+03:00');
  assert.equal(shouldWritePresence(null, now), true);
  assert.equal(shouldWritePresence(new Date('2026-10-04T21:39:30+03:00'), now), false);
  assert.equal(shouldWritePresence(new Date('2026-10-04T21:39:00+03:00'), now), true);
});


console.log('Пароль: длина, словарь, простые шаблоны');
test('длина — не меньше десяти символов', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.equal(passwordSchema.safeParse('Tuman-4821').success, true); // 10
  assert.equal(passwordSchema.safeParse('Tuman-482').success, false); // 9
  const short = passwordSchema.safeParse('abc12345');
  assert.equal(short.success ? '' : short.error.issues[0]?.message, 'Минимум 10 символов');
});
test('слишком длинный пароль отвергается, а не обрезается', () => {
  assert.equal(passwordSchema.safeParse('а1'.repeat(65)).success, false);
});
test('набор символов не навязывается: длинная фраза без цифр подходит', () => {
  assert.equal(passwordSchema.safeParse('коралловый закат над морем').success, true);
});
test('только цифры — слабый пароль (не последовательность)', () => {
  assert.match(passwordProblem('7391846205') ?? '', /из одних цифр/);
});
test('повтор одного символа и пары символов', () => {
  assert.match(passwordProblem('aaaaaaaaaaaa') ?? '', /однообразный/);
  assert.match(passwordProblem('abababababab') ?? '', /однообразный/);
  assert.match(passwordProblem('1212121212') ?? '', /однообразный/);
});
test('последовательности: цифры, алфавиты, ряды клавиатуры обеих раскладок', () => {
  for (const weak of ['1234567890', '12345678901', 'abcdefghijk', 'qwertyuiop', 'йцукенгшщз', 'asdfghjklzxc', 'zyxwvutsrq', 'poiuytrewq']) {
    assert.match(passwordProblem(weak) ?? '', /последовательность/, weak);
  }
});
test('регистр и пробелы по краям не прячут слабый пароль', () => {
  assert.notEqual(passwordProblem('QWERTYUIOP'), null);
  assert.notEqual(passwordProblem('  1234567890  '), null);
});
test('схема отдаёт то же сообщение, что и passwordProblem', () => {
  const result = passwordSchema.safeParse('qwertyuiop');
  assert.equal(result.success ? '' : result.error.issues[0]?.message, passwordProblem('qwertyuiop'));
});
test('пароль с частью почты слабый: локальная часть и её слова от четырёх символов', () => {
  const ctx = { email: 'iva.petrov@mail.ru' };
  assert.match(passwordProblem('petrov-2026-xyz', ctx) ?? '', /почт/);
  assert.match(passwordProblem('IVA.PETROV!!2026', ctx) ?? '', /почт/);
  assert.equal(passwordProblem('коралловый-закат-17', ctx), null);
  // «iva» короче четырёх символов — не повод отвергать пароль
  assert.equal(passwordProblem('iva-коралловый-закат', ctx), null);
});
test('хороший пароль проходит', () => {
  for (const good of ['коралловый-закат-17', 'Tr0ub4dor&3x', 'correct horse battery staple', 'Tuman-Zakat-4821']) {
    assert.equal(passwordProblem(good), null, good);
  }
});

console.log('Пароль: словарь распространённых (сервер)');
test('словарь прочитан целиком: десять тысяч слов и русское дополнение', () => {
  assert.ok(commonPasswordCount() > 10_000, String(commonPasswordCount()));
  assert.equal(isCommonPassword('пароль123'), true);
});
test('словарь не зависит от регистра и пробелов', () => {
  assert.equal(isCommonPassword('  DRAGON '), true);
  assert.equal(isCommonPassword('коралловый-закат-17'), false);
});
test('слово из словаря плюс цифры и знаки на конце — тоже слабое', () => {
  for (const weak of ['Password2026!', 'letmein2026', 'Qwerty123456', 'PASSWORD123', 'iloveyou-2026']) {
    assert.match(weakPasswordMessage(weak, null) ?? '', /распространённый/, weak);
  }
});
test('сервер: словарь и почта в одной проверке; хороший пароль — null', () => {
  assert.match(weakPasswordMessage('petrov-2026-xyz', 'ivan.petrov@mail.ru') ?? '', /почт/);
  assert.equal(weakPasswordMessage('коралловый-закат-17', 'ivan.petrov@mail.ru'), null);
  assert.equal(weakPasswordMessage('Tuman-Zakat-4821', null), null);
});


console.log('Вход: роли и пароль');
test('парольный вход закрыт для ADMIN и открыт студенту и работодателю', () => {
  assert.equal(canSignInWithPassword('ADMIN'), false);
  assert.equal(canSignInWithPassword('STUDENT'), true);
  assert.equal(canSignInWithPassword('EMPLOYER'), true);
});
test('у администратора сверка идёт с пустышкой, а не с его хешем', () => {
  assert.equal(passwordHashForLogin({ role: 'ADMIN', passwordHash: '$2a$12$настоящий-хеш' }), null);
  assert.equal(passwordHashForLogin({ role: 'STUDENT', passwordHash: '$2a$12$хеш' }), '$2a$12$хеш');
  assert.equal(passwordHashForLogin(null), null);
});
testAsync('верный пароль администратора не проходит: сверка с пустышкой даёт «неверно»', async () => {
  const hash = await hashPassword('Tuman-Zakat-4821');
  assert.equal(await verifyPassword('Tuman-Zakat-4821', passwordHashForLogin({ role: 'ADMIN', passwordHash: hash })), false);
  assert.equal(await verifyPassword('Tuman-Zakat-4821', passwordHashForLogin({ role: 'STUDENT', passwordHash: hash })), true);
});

test('строка «в сети» пересчитывается чаще раза в минуту, но не чаще раза в полминуты', () => {
  assert.ok(PRESENCE_TICK_MS >= 30_000 && PRESENCE_TICK_MS <= 60_000);
  const tick = (ms: number) => presenceNow(ms).getTime();
  const base = PRESENCE_TICK_MS * 40_000_000;
  assert.equal(tick(base), tick(base + PRESENCE_TICK_MS - 1));
  assert.equal(tick(base + PRESENCE_TICK_MS) - tick(base), PRESENCE_TICK_MS);
});

console.log('Согласие студента: текст и повторное согласие');
const consentText = (doc: { intro: string; sections: Array<{ title: string; paragraphs?: string[]; items?: string[] }> }) =>
  [doc.intro, ...doc.sections.flatMap((s) => [s.title, ...(s.paragraphs ?? []), ...(s.items ?? [])])].join('\n');
test('версия согласия новее прежней: старым студентам текст показывается заново', () => {
  assert.ok(STUDENT_CONSENT_VERSION > '2026-09-30', STUDENT_CONSENT_VERSION);
  assert.match(STUDENT_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(STUDENT_CONSENT.version, STUDENT_CONSENT_VERSION);
});
test('согласие больше не обещает «работодателю только после отклика»', () => {
  const text = consentText(STUDENT_CONSENT);
  assert.ok(!/только после моего отклика/.test(text), 'старая формулировка осталась');
});
test('согласие говорит, что видно до отклика: клиентам с договором и проверенным компаниям', () => {
  const text = consentText(STUDENT_CONSENT);
  assert.match(text, /договор/);
  assert.match(text, /прошедш[а-я]+ проверку/);
  assert.match(text, /до (моего |какого-либо )?отклика/);
  // Что именно видно в списке кандидатов — перечень из lib/services.ts (listCandidatesForVacancy)
  for (const word of ['возраст', 'учебное заведение', 'навыки', 'о себе', 'проекты', 'увлечения', 'ссылки']) {
    assert.ok(text.toLowerCase().includes(word), `в согласии нет «${word}»`);
  }
});
test('согласие говорит, когда открываются контакты: приглашение работодателя или отклик студента', () => {
  const text = consentText(STUDENT_CONSENT);
  assert.match(text, /приглас/);
  assert.match(text, /откликнул/);
  assert.match(text, /почт/);
  assert.match(text, /телефон/);
  // Приглашение открывает контакты сразу, до ответа студента — так работает код, так и сказано
  assert.match(text, /до моего ответа|сразу при приглашении/);
});
test('политика не повторяет старое «только после отклика»', () => {
  const text = consentText(PRIVACY);
  assert.ok(!/видит данные студента только после его отклика/.test(text));
  assert.ok(!/^работодателю — после отклика студента на его вакансию;$/m.test(text));
  assert.match(text, /приглаш/);
  assert.match(text, /договор/);
});
test('needsConsentRenewal: другая версия — нужно принять заново, та же — нет', () => {
  assert.equal(needsConsentRenewal({ consentVersion: '2026-09-30' }), true);
  assert.equal(needsConsentRenewal({ consentVersion: 'test' }), true);
  assert.equal(needsConsentRenewal({ consentVersion: STUDENT_CONSENT_VERSION }), false);
});

console.log('Статусные цвета в обеих темах');
{
  // Читаем реальные токены из app/globals.css и считаем контраст по формуле WCAG: цвета статусов
  // раньше были одним hex на обе темы и в светлой давали 1,3–2,6:1 (сверка 08.10.2026)
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `нет блока ${selector}`);
    return css.slice(start, css.indexOf('\n}', start));
  };
  const token = (body: string, name: string): [number, number, number] => {
    const m = new RegExp(`--color-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`).exec(body);
    assert.ok(m, `нет токена --color-${name}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], bg: number[], alpha: number) => fg.map((f, i) => Math.round(f * alpha + bg[i] * (1 - alpha)));

  for (const [theme, selector] of [['светлая', ':root'], ['тёмная', '.dark']] as const) {
    const body = block(selector);
    const ink = token(body, 'ink');
    const raise = token(body, 'ink-raise');
    const [warn, yes, glow, danger] = [token(body, 'warn'), token(body, 'yes'), token(body, 'yes-glow'), token(body, 'danger')];

    test(`${theme} тема: текст статусов на полотне и на карточке — не ниже 4,5:1`, () => {
      for (const [name, color] of [['warn', warn], ['yes', yes], ['yes-glow', glow], ['danger', danger]] as const) {
        for (const [on, bg] of [['полотне', ink], ['карточке', raise]] as const) {
          assert.ok(ratio(color, bg) >= 4.5, `${name} на ${on}: ${ratio(color, bg).toFixed(2)}`);
        }
      }
    });
    test(`${theme} тема: подписи на плашках статусов (приглашён, вышел на работу, отклонена) — не ниже 4,5:1`, () => {
      const pairs: [string, number[], number[]][] = [
        ['INVITED: warn на warn/12', warn, over(warn, raise, 0.12)],
        ['HIRED: yes-glow на yes/14', glow, over(yes, raise, 0.14)],
        ['REJECTED: danger на danger/15', danger, over(danger, raise, 0.15)],
        ['кнопка danger при наведении: danger на danger/25', danger, over(danger, raise, 0.25)],
      ];
      for (const [name, text, bg] of pairs) assert.ok(ratio(text, bg) >= 4.5, `${name}: ${ratio(text, bg).toFixed(2)}`);
    });
  }

  test('tailwind читает статусные цвета из переменных темы, а не из одного hex', () => {
    const config = readFileSync(new URL('../tailwind.config.ts', import.meta.url), 'utf8');
    for (const name of ['yes', 'yes-glow', 'yes-deep', 'warn', 'danger']) {
      assert.ok(config.includes(`withOpacity('--color-${name}')`), name);
    }
    assert.equal(/#C9A227|#4FA37F|#B4534F/i.test(config), false, 'старые hex вернулись');
  });
}

console.log('Страницы ошибок, клавиатура и подтверждение отказа');
{
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  test('у каждого раздела есть своя страница ошибки, а корень — ещё и global-error (раньше не было ни одной)', () => {
    for (const file of ['app/error.tsx', 'app/global-error.tsx', 'app/(student)/error.tsx', 'app/employer/error.tsx', 'app/admin/error.tsx']) {
      assert.ok(read(file).length > 0, file);
    }
    for (const file of ['app/error.tsx', 'app/(student)/error.tsx', 'app/employer/error.tsx', 'app/admin/error.tsx']) {
      assert.ok(read(file).includes('ErrorScreen'), file);
    }
  });
  test('страница ошибки не показывает текст исключения и различает «страница устарела»', () => {
    const screen = read('components/ui/ErrorScreen.tsx');
    assert.equal(/error\.message/.test(screen), false, 'текст исключения не выводится');
    assert.ok(screen.includes('unstable_isUnrecognizedActionError'));
    assert.ok(screen.includes('Страница устарела'));
  });
  test('мастер регистрации и редакторы — формы: Enter идёт дальше, у кнопки type=submit', () => {
    const wizard = read('components/screens/RegistrationWizard.tsx');
    assert.ok(wizard.includes('id="registration-step-form"') && wizard.includes('form="registration-step-form"'));
    assert.ok(/type="submit"/.test(wizard));
    for (const file of ['components/screens/ProfileEditor.tsx', 'components/screens/CompanyEditor.tsx']) {
      const source = read(file);
      assert.ok(/<form\s[^>]*onSubmit/s.test(source), `${file}: корень — форма`);
      assert.ok(/<Button size="sm" type="submit"/.test(source), `${file}: «Сохранить» — кнопка отправки`);
    }
  });
  test('«Отказ» работодателя идёт через подтверждение, текущий этап — aria-pressed, «Новый» выбрать нельзя', () => {
    const board = read('components/screens/EmployerBoard.tsx');
    assert.ok(board.includes("if (status === 'REJECTED')"));
    assert.ok(board.includes('title="Отказать студенту?"'));
    assert.ok(board.includes('aria-pressed={status === application.status}'));
    assert.ok(board.includes("filter((status) => status !== 'NEW')"));
    assert.equal(/disabled=\{pending \|\| status === application\.status\}/.test(board), false, 'текущий этап не выключается');
  });
}

console.log('Отказ сервера и черновик анкеты');
testAsync('apiErrorMessage: текст отказа берётся из поля error, иначе запасной', async () => {
  assert.equal(await apiErrorMessage({ json: async () => ({ error: 'Слишком много попыток. Повторите через 2 мин.' }) }, 'запасной'), 'Слишком много попыток. Повторите через 2 мин.');
  assert.equal(await apiErrorMessage({ json: async () => ({}) }, 'запасной'), 'запасной');
  assert.equal(await apiErrorMessage({ json: async () => ({ error: '   ' }) }, 'запасной'), 'запасной');
  assert.equal(await apiErrorMessage({ json: async () => ({ error: 42 }) }, 'запасной'), 'запасной');
  assert.equal(await apiErrorMessage({ json: async () => { throw new Error('не JSON'); } }, 'запасной'), 'запасной');
});

const DRAFT_INITIAL = {
  fullName: '',
  photoUrl: null as string | null,
  workDays: [] as string[],
  hoursPerWeek: 20 as number | null,
  email: '',
  password: '',
  consent: false,
  terms: false,
  marketing: false,
};
test('черновик: пароль и все согласия в сохранённое не попадают', () => {
  const raw = serializeDraft(3, { ...DRAFT_INITIAL, fullName: 'Анна', password: 'секрет-1', consent: true, terms: true, marketing: true });
  for (const key of NEVER_STORED) assert.equal(raw.includes(`"${key}"`), false, key);
  assert.equal(raw.includes('секрет-1'), false);
});
test('черновик: после разбора шаг и ответы на месте, а пароль и согласия — пустые', () => {
  const raw = serializeDraft(2, { ...DRAFT_INITIAL, fullName: 'Анна Петрова', workDays: ['MON', 'WED'], hoursPerWeek: 12, photoUrl: '/uploads/a.jpg' });
  const draft = parseDraft(raw, DRAFT_INITIAL, 5);
  assert.ok(draft);
  assert.equal(draft.step, 2);
  assert.equal(draft.form.fullName, 'Анна Петрова');
  assert.deepEqual(draft.form.workDays, ['MON', 'WED']);
  assert.equal(draft.form.hoursPerWeek, 12);
  assert.equal(draft.form.photoUrl, '/uploads/a.jpg');
  assert.equal(draft.form.password, '');
  assert.equal(draft.form.consent, false);
});
test('черновик: подменённое содержимое хранилища форму не ломает', () => {
  assert.equal(parseDraft(null, DRAFT_INITIAL, 5), null);
  assert.equal(parseDraft('не json', DRAFT_INITIAL, 5), null);
  assert.equal(parseDraft(JSON.stringify({ v: 99, step: 1, form: {} }), DRAFT_INITIAL, 5), null);
  const tampered = parseDraft(
    JSON.stringify({ v: 1, step: 99, form: { fullName: 123, workDays: [1, 2], hoursPerWeek: 'много', password: 'x', consent: true, чужое: 'поле' } }),
    DRAFT_INITIAL,
    5,
  );
  assert.ok(tampered);
  assert.equal(tampered.step, 4, 'шаг ограничен числом шагов');
  assert.equal(tampered.form.fullName, '', 'число вместо строки отброшено');
  assert.deepEqual(tampered.form.workDays, [], 'массив не из строк отброшен');
  assert.equal(tampered.form.hoursPerWeek, 20, 'строка вместо числа отброшена');
  assert.equal(tampered.form.password, '');
  assert.equal(tampered.form.consent, false, 'согласие подменой не включить');
  assert.equal('чужое' in tampered.form, false);
  assert.equal(parseDraft(JSON.stringify({ v: 1, step: -3, form: {} }), DRAFT_INITIAL, 5)?.step, 0);
});
test('черновик: «значимый» только если ушли с первого шага или что-то ввели', () => {
  assert.equal(isMeaningfulDraft(0, DRAFT_INITIAL, DRAFT_INITIAL), false);
  assert.equal(isMeaningfulDraft(1, DRAFT_INITIAL, DRAFT_INITIAL), true);
  assert.equal(isMeaningfulDraft(0, { ...DRAFT_INITIAL, fullName: 'А' }, DRAFT_INITIAL), true);
  assert.equal(isMeaningfulDraft(0, { ...DRAFT_INITIAL, password: 'введён' }, DRAFT_INITIAL), false, 'один пароль — не повод восстанавливать');
});
test('SMTP: у внешнего сервера шифрование обязательно, откат на открытый обмен запрещён', () => {
  const url = secureSmtpUrl('smtp://login:pass@smtp.reg.ru:587');
  assert.ok(url.includes('requireTLS=true'));
  // и nodemailer действительно читает параметр из адреса, а не молча игнорирует
  const transport = nodemailer.createTransport(url) as unknown as { options: { requireTLS?: boolean } };
  assert.equal(transport.options.requireTLS, true);
});
test('SMTP: smtps, локальные адреса и явная настройка владельца не трогаются', () => {
  for (const same of [
    'smtps://u:p@smtp.reg.ru:465',
    'smtp://localhost:1025',
    'smtp://127.0.0.1:1025',
    'smtp://u:p@smtp.reg.ru:587?requireTLS=false',
    'smtp://u:p@smtp.reg.ru:587?ignoreTLS=true',
    'не-адрес',
  ]) {
    assert.equal(secureSmtpUrl(same), same);
  }
});

// ---------- Тема, первый экран без JS, кнопка темы (09.10.2026) ----------
const readSrc = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('тема: скрипт в <head> и провайдер берут один и тот же выбор по умолчанию', () => {
  // Скрипт ставил тёмную, провайдер после загрузки пересчитывал в системную:
  // на светлом телефоне страница секунды стояла чёрной и вспыхивала светлой
  const script = /localStorage\.getItem\("theme"\) \|\| "(\w+)"/.exec(readSrc('app/layout.tsx'));
  const provider = /\?\? '(\w+)';\s*\} catch/.exec(readSrc('components/theme/ThemeProvider.tsx'));
  assert.ok(script && provider, 'оба значения по умолчанию найдены');
  assert.equal(script[1], provider[1]);
});
test('первый экран появляется CSS-анимацией: не ждёт JS и не остаётся пустым без него', () => {
  const landing = readSrc('components/screens/Landing.tsx');
  const hero = landing.slice(landing.indexOf('ПЕРВЫЙ ЭКРАН'), landing.indexOf('ЦИФРЫ'));
  // В первом экране нет JS-анимации с невидимым стартом: такой блок пуст, пока не загрузятся скрипты
  assert.equal(/<motion\./.test(hero), false, 'на первом экране нет motion-элементов');
  assert.ok(hero.includes('rise-in'));
  const split = readSrc('components/motion/SplitText.tsx');
  const splitText = split.slice(split.indexOf('export function SplitText({'), split.indexOf('export function SplitTextInView'));
  assert.equal(/motion\.span/.test(splitText), false, 'заголовок первого экрана — на CSS');
  const css = readSrc('app/globals.css');
  // Без движения анимация выключена целиком: одна сокращённая длительность оставила бы задержку,
  // и текст до неё был бы невидим
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.rise-in,\s*\.word-rise\s*\{\s*animation: none;/);
});
test('без JS: блоки с анимацией появления помечены и показываются как есть', () => {
  const layout = readSrc('app/layout.tsx');
  assert.match(layout, /\[data-reveal\]\{opacity:1!important/);
  assert.match(layout, /<noscript>/);
  for (const file of ['components/motion/Reveal.tsx', 'components/motion/SplitText.tsx']) {
    const src = readSrc(file);
    const hidden = (src.match(/initial=/g) ?? []).length;
    const marked = (src.match(/data-reveal/g) ?? []).length;
    assert.ok(marked >= hidden, `${file}: у каждого невидимого старта есть data-reveal (${marked} из ${hidden})`);
  }
});
test('нижние панели оставляют место под кнопку темы', () => {
  const css = readSrc('app/globals.css');
  assert.match(css, /\.clear-theme-toggle\s*\{[^}]*padding-right: max\(0px/);
  for (const file of ['components/analytics/CookieBanner.tsx', 'components/screens/ProfileEditor.tsx', 'components/screens/CompanyEditor.tsx']) {
    assert.ok(readSrc(file).includes('clear-theme-toggle'), `${file}: панель освобождает угол кнопки темы`);
  }
});


// ---------------------------------------------------------------------------
// Доступность, фокус, масштаб и поиск (сверка 12.10.2026). Читают исходники и считают по значениям
// из app/globals.css и tailwind.config.ts: правило, которое держится на глаз, потом тихо ломается.
// Замеры в настоящем браузере (контраст по отрисованным пикселям, кольцо фокуса по снимкам до/после)
// сняты отдельно и приведены в описании PR.
// ---------------------------------------------------------------------------

const rootDir = path.join(process.cwd());
const src = (rel: string) => readFileSync(path.join(rootDir, rel), 'utf8').replace(/\r\n/g, '\n');
/** Без комментариев: слова «maximumScale» или «text-white» в пояснении — не нарушение. */
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function listFiles(dir: string, pattern: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(rootDir, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(rootDir, rel)).isDirectory()) listFiles(rel, pattern, out);
    else if (pattern.test(name)) out.push(rel);
  }
  return out;
}
const uiFiles = [...listFiles('app', /\.tsx$/), ...listFiles('components', /\.tsx$/)];

// ----- контраст: лестница текста и кольцо фокуса ---------------------------------------------
console.log('Контраст: лестница текста (paper / dim / faint) и кольцо фокуса, обе темы');
{
  const css = src('app/globals.css');
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `нет блока ${selector}`);
    return css.slice(start, css.indexOf('\n}', start));
  };
  const triple = (body: string, name: string): number[] => {
    const m = new RegExp(`--color-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`).exec(body);
    assert.ok(m, `нет токена --color-${name}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const rgba = (value: string): number[] => {
    const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)/.exec(value);
    assert.ok(m, `не разобрать цвет: ${value}`);
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  };
  const prop = (body: string, name: string): string => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(body);
    assert.ok(m, `нет свойства ${name}`);
    return m[1].trim();
  };
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], bg: number[], alpha: number) => fg.slice(0, 3).map((f, i) => f * alpha + bg[i] * (1 - alpha));
  /** Цвета градиента linear-gradient(180deg, rgba(...), rgba(...)) */
  const stops = (value: string) => [...value.matchAll(/rgba\([^)]*\)/g)].map((m) => rgba(m[0]));

  for (const [theme, selector] of [['светлая', ':root'], ['тёмная', '.dark']] as const) {
    const body = block(selector);
    const ink = triple(body, 'ink');
    const raise = triple(body, 'ink-raise');
    const deep = triple(body, 'ink-deep');
    const paper = triple(body, 'paper');
    const dim = rgba(prop(body, '--color-paper-dim'));
    const faint = rgba(prop(body, '--color-paper-faint'));
    // Поверхности, на которых лежит текст: полотно, карточка, стекло, список — и плашки с заливкой paper/6%
    const surfaces: [string, number[]][] = [
      ['полотно', ink],
      ['полотно (raise)', raise],
      ['полотно (deep)', deep],
      ...stops(prop(body, '--surface-glass-card')).map((c, i): [string, number[]] => [`карточка, край ${i + 1}`, over(c, ink, c[3])]),
      ...stops(prop(body, '--surface-surface')).map((c, i): [string, number[]] => [`строка списка, край ${i + 1}`, over(c, ink, c[3])]),
      ['стекло', over(rgba(prop(body, '--glass-tint')), ink, rgba(prop(body, '--glass-tint'))[3])],
      // подпись под колодой на главной лежит в тени карточки (shadow-lift): в браузере там 220 вместо 238
      ['полотно в тени карточки', over([20, 22, 24], ink, 0.12)],
    ];
    const withPill = surfaces.map(([name, bg]): [string, number[]] => [`${name} + плашка paper/6%`, over(paper, bg, 0.06)]);

    test(`${theme} тема: dim и faint — не ниже 4,5:1 на всех поверхностях и плашках (раньше faint был 2,5:1 / 3,25:1)`, () => {
      for (const [level, token] of [['dim', dim], ['faint', faint]] as const) {
        for (const [name, bg] of [...surfaces, ...withPill]) {
          const r = ratio(over(paper, bg, token[3]), bg);
          assert.ok(r >= 4.5, `${level} на «${name}»: ${r.toFixed(2)}`);
        }
      }
    });
    test(`${theme} тема: ступени не слиплись — dim заметно плотнее faint, faint заметно слабее основного`, () => {
      assert.ok(dim[3] - faint[3] >= 0.1, `dim ${dim[3]} и faint ${faint[3]}`);
      assert.ok(1 - dim[3] >= 0.2, 'dim не должен быть почти основным цветом');
    });
    test(`${theme} тема: текст подсказки в поле — на уровне faint (не 0,3: подсказка тоже текст)`, () => {
      assert.match(body, /--placeholder-color:\s*var\(--color-paper-faint\);/);
    });
    test(`${theme} тема: подпись плавающего поля (opacity 0,62 / 0,8 из Field.tsx) — не ниже 4,5:1 на рамке поля`, () => {
      const field = stripComments(src('components/ui/Field.tsx'));
      const opacities = [...field.matchAll(/opacity:\s*([\d.]+)\s*\}/g)].map((m) => Number(m[1])).filter((o) => o > 0);
      assert.ok(opacities.length >= 2, 'не нашли значения прозрачности подписи');
      // рамка поля: graphite-900 с прозрачностью 55% на карточке
      const g900 = triple(body, 'graphite-900');
      const card = over(stops(prop(body, '--surface-glass-card'))[1], ink, stops(prop(body, '--surface-glass-card'))[1][3]);
      const shell = over(g900, card, 0.55);
      for (const o of opacities) {
        const r = ratio(over(paper, shell, o), shell);
        assert.ok(r >= 4.5, `подпись при прозрачности ${o}: ${r.toFixed(2)}`);
      }
    });
    test(`${theme} тема: кольцо фокуса — не слабее 3:1 к полотну, карточке, строке списка и тени под стопкой карточек`, () => {
      const ring = rgba(prop(body, '--focus-ring-color'));
      // кнопки решения в ленте лежат на тени стопки карточек: в браузере там серый ≈165 вместо 238
      const shadowed: [string, number[]][] = [['тень под стопкой карточек', over([20, 22, 24], ink, 0.32)]];
      for (const [name, bg] of [...surfaces, ...shadowed]) {
        const r = ratio(ring, bg);
        assert.ok(r >= 3, `кольцо на «${name}»: ${r.toFixed(2)}`);
      }
    });
  }

  test('кольцо фокуса — outline, а не box-shadow (тень перебивалась .glass/.surface/shadow-* и пропадала в forced-colors)', () => {
    const start = css.indexOf('  :focus-visible {');
    assert.ok(start >= 0, 'нет правила :focus-visible');
    const rule = css.slice(start, css.indexOf('}', start));
    assert.match(rule, /outline:\s*2px solid var\(--focus-ring-color\)/);
    assert.match(rule, /outline-offset:\s*2px/);
    assert.equal(/box-shadow/.test(rule), false, 'в правиле фокуса не должно быть box-shadow');
    assert.equal(/border-radius/.test(rule), false, 'фокус не должен менять радиус элемента');
  });
  test('режим высокой контрастности: цвет кольца задаёт система (Highlight)', () => {
    assert.match(css, /@media \(forced-colors: active\)\s*\{[^}]*:focus-visible[^}]*outline-color:\s*Highlight/);
  });
  test('поля ввода рисуют кольцо на рамке: .field-focus и shell в Field.tsx', () => {
    assert.match(css, /\.field-focus:focus-within\s*\{[^}]*outline:\s*2px solid var\(--focus-ring-color\)/);
    assert.match(src('components/ui/Field.tsx'), /const shellBase =\s*'field-focus /);
  });
  test('нет цвета фокуса-рамки слабее кольца: focus:border-accent-400/70 и прозрачные рамки заменены', () => {
    for (const file of uiFiles) {
      assert.equal(/focus(-within)?:border-accent-400\/70/.test(src(file)), false, file);
    }
  });
}

// ----- фокус: один элемент на действие, у каждого есть кольцо ----------------------------------
console.log('Фокус: вложенные интерактивные элементы, outline-none, скрытые поля файлов');
{
  const INTERACTIVE = new Set(['a', 'Link', 'button', 'Button', 'ButtonLink', 'summary', 'input', 'select', 'textarea']);
  const OUTER = new Set(['a', 'Link', 'button', 'Button', 'ButtonLink', 'summary']);
  const tagName = (n: ts.Node): string | null =>
    ts.isJsxElement(n) ? n.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(n) ? n.tagName.getText() : null;

  test('нет интерактивного внутри интерактивного: ссылка вокруг кнопки (и наоборот) — два Tab и два кольца на одно действие', () => {
    const found: string[] = [];
    for (const file of uiFiles) {
      const code = src(file);
      const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node, stack: string[]) => {
        const name = tagName(node);
        if (name && INTERACTIVE.has(name) && stack.some((outer) => OUTER.has(outer))) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          found.push(`${file}:${line + 1} <${stack.find((o) => OUTER.has(o))}> содержит <${name}>`);
        }
        ts.forEachChild(node, (child) => visit(child, name ? [name, ...stack] : stack));
      };
      visit(sf, []);
    }
    assert.deepEqual(found, []);
  });
  test('ButtonLink — один <a> (motion.a / next/link), без вложенной кнопки; переход на внешний адрес — обычный <a>', () => {
    const button = stripComments(src('components/ui/Button.tsx'));
    assert.match(button, /export function ButtonLink\(/);
    const body = button.slice(button.indexOf('export function ButtonLink('));
    assert.equal(/<Button[\s>]|<motion\.button/.test(body), false);
    assert.match(body, /<motion\.a /);
    assert.match(body, /<MotionLink /);
  });
  // Тег, которому принадлежит атрибут: у атрибута className родитель родителя — JsxOpeningElement
  // (элемент с содержимым) или JsxSelfClosingElement. tagName() выше понимает только целые узлы,
  // поэтому для <button>…</button> имя выходило пустым и проверка молча пропускалась.
  const ownerTag = (attribute: ts.Node): string => {
    const owner = attribute.parent?.parent;
    return owner && ts.isJsxOpeningLikeElement(owner) ? owner.tagName.getText() : '';
  };
  const outlineProblems = (file: string, code: string): string[] => {
    const bad: string[] = [];
    if (!/outline-(none|0)\b/.test(code)) return bad;
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && node.name.getText() === 'className' && /outline-(none|0)\b/.test(node.getText())) {
        const name = ownerTag(node);
        const text = node.getText();
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        const where = `${file}:${line + 1} <${name}>`;
        // outline-none оставляет прозрачный outline, который forced-colors рисует постоянной рамкой
        if (INTERACTIVE.has(name) && /outline-none/.test(text)) bad.push(`${where}: outline-none`);
        // outline-0 у поля — только когда рамку с кольцом рисует .field-focus
        if (/outline-0\b/.test(text) && INTERACTIVE.has(name) && !code.includes('field-focus')) bad.push(`${where}: outline-0 без field-focus`);
        // у кнопок и ссылок кольцо не снимает ничто
        if (/outline-0\b/.test(text) && OUTER.has(name)) bad.push(`${where}: кольцо снято у кнопки или ссылки`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    // вхождение вне className (в общей функции классов кнопки, в константе) обходит проверку выше
    const total = (stripComments(code).match(/outline-(none|0)\b/g) ?? []).length;
    let inAttrs = 0;
    const count = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && node.name.getText() === 'className') inAttrs += (stripComments(node.getText()).match(/outline-(none|0)\b/g) ?? []).length;
      ts.forEachChild(node, count);
    };
    count(sf);
    if (total !== inAttrs) bad.push(`${file}: outline вне JSX-className (${total - inAttrs})`);
    return bad;
  };
  test('outline-none нет у интерактивных элементов; у поля внутри рамки — outline-0 при .field-focus; вне className его нет', () => {
    const bad: string[] = [];
    for (const file of uiFiles) bad.push(...outlineProblems(file, src(file)));
    assert.deepEqual(bad, []);
  });
  test('сторож outline зрячий: ловит outline-none и у элементов с содержимым (<button>…</button>), не только у <input />', () => {
    const cases: Array<[string, string, number]> = [
      ['кнопка с содержимым', `export const A = () => <button type="button" className="rounded outline-none">Нажми</button>;`, 1],
      ['ссылка с содержимым', `export const A = () => <a href="/x" className="outline-none underline">Ссылка</a>;`, 1],
      ['компонент Button с содержимым', `export const A = () => <Button className="outline-none">Нажми</Button>;`, 1],
      ['summary с содержимым', `export const A = () => <summary className="outline-none">Вопрос</summary>;`, 1],
      ['select с вариантами', `export const A = () => <select className="outline-none"><option>1</option></select>;`, 1],
      ['самозакрывающийся input', `export const A = () => <input className="outline-none" />;`, 1],
      ['кольцо снято outline-0 у кнопки с содержимым', `export const A = () => <button type="button" className="outline-0">Нажми</button>;`, 2],
      ['обычный div — не интерактивный', `export const A = () => <div className="outline-none">Текст</div>;`, 0],
      ['кнопка без outline-none', `export const A = () => <button type="button" className="focus-visible:outline-offset-4">Нажми</button>;`, 0],
    ];
    for (const [name, code, expected] of cases) {
      const found = outlineProblems('fixture.tsx', code);
      if (expected === 0) assert.deepEqual(found, [], name);
      else assert.ok(found.length >= 1, `${name}: сторож промолчал`);
    }
  });
  test('скрытые поля выбора файла не берут Tab: у них нет видимого кольца (tabIndex=-1, открывает их кнопка)', () => {
    const missing: string[] = [];
    for (const file of uiFiles) {
      const code = src(file);
      for (const m of code.matchAll(/<input\b[^>]*?type="file"[\s\S]*?\/>/g)) {
        if (!/tabIndex=\{-1\}/.test(m[0])) missing.push(file);
      }
    }
    assert.deepEqual(missing, []);
  });
}

// ----- шрифты, поля и масштаб ----------------------------------------------------------------
console.log('Шрифты и масштаб: не меньше 12px, поля 16px на сенсорных, масштаб страницы разрешён');
{
  test('мельче 12px текста нет ни на одной ширине: ступень caption и все старшие — не меньше 12px', () => {
    for (const [name, sizes] of Object.entries(FONT_STEPS)) {
      for (const px of sizes) assert.ok(px >= 12, `${name}: ${px}px`);
    }
  });
  test('метка капсом (text-eyebrow) — тот же размер, что caption (var(--fs-caption)), плюс разрядка; не новая ступень', () => {
    const eyebrow = (tailwindConfig.theme?.fontSize as Record<string, unknown>).eyebrow as [string, Record<string, string>];
    assert.equal(eyebrow[0], 'var(--fs-caption)');
    assert.ok(Number.parseFloat(eyebrow[1].letterSpacing) > 0, 'у метки капсом есть разрядка');
  });
  test('подпись плавающего поля не уменьшается ниже 12px: масштаб ≥ 0,8 от основного текста (body)', () => {
    const field = stripComments(src('components/ui/Field.tsx'));
    const scales = [...field.matchAll(/scale:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    assert.ok(scales.length >= 2);
    const body = Math.min(...FONT_STEPS.body);
    for (const scale of scales) assert.ok(body * scale >= 12, `масштаб ${scale} → ${body * scale}px`);
    // подпись и текст поля — одной ступенью: подпись «всплывает» масштабом того же размера
    assert.ok((field.match(/text-body/g) ?? []).length >= 2, 'подпись и поле Field.tsx — text-body');
  });
  test('viewport не запрещает масштаб: без maximumScale, userScalable и maximum-scale; width и initialScale на месте', () => {
    const layout = stripComments(src('app/layout.tsx'));
    const viewport = layout.slice(layout.indexOf('export const viewport'), layout.indexOf('};', layout.indexOf('export const viewport')));
    assert.match(viewport, /width:\s*'device-width'/);
    assert.match(viewport, /initialScale:\s*1/);
    for (const file of uiFiles) {
      assert.equal(/maximumScale|userScalable|maximum-scale|user-scalable/.test(stripComments(src(file))), false, file);
    }
  });
  test('поля ввода на сенсорном экране — 16px (иначе iOS увеличивает страницу при фокусе), флажки и кнопки не затронуты', () => {
    const css = src('app/globals.css');
    const m = /@media \(pointer: coarse\)(?:,\s*\(max-width: 1023px\))?\s*\{\s*input:not\(([^)]*)\),\s*textarea:not\(\[data-keep-size\]\),\s*select:not\(\[data-keep-size\]\)\s*\{\s*font-size:\s*16px !important;/.exec(css);
    assert.ok(m, 'нет правила 16px для полей на (pointer: coarse) с исключением [data-keep-size]');
    for (const type of ['checkbox', 'radio', 'file', 'submit', 'button', 'range']) assert.ok(m[1].includes(`'${type}'`), type);
    assert.ok(m[1].includes('[data-keep-size]'), 'у input нет исключения [data-keep-size]');
  });
  test('правило 16px для полей — литерал, а не шкала: основной текст (body, 15px) мельче 16px, а поле на сенсорном экране остаётся 16px', () => {
    const css = src('app/globals.css');
    const at = css.search(/@media \(pointer: coarse\)(?:,\s*\(max-width: 1023px\))?\s*\{\s*input:not\(/);
    assert.ok(at >= 0, 'нет правила для полей на (pointer: coarse)');
    const rule = css.slice(at, css.indexOf('\n}\n', at));
    assert.match(rule, /font-size:\s*16px !important;/);
    assert.equal(/var\(--fs-|\d(?:\.\d+)?(?:rem|em)\b/.test(rule.replace(/font-size:\s*16px !important;/, '')), false, 'размер поля читает шкалу или относительную единицу: правка body сдвинет его с 16px');
    // iOS Safari увеличивает страницу при фокусе на поле мельче 16px; основной текст стал мельче — поле обязано его перерасти, а не следовать за ним
    assert.ok(Math.max(...FONT_STEPS.body) < 16, 'body уже не меньше 16px: правило для полей на сенсорных теряет смысл — решение владельца про 15px изменилось?');
  });
  // Правило 16px — для мелких полей. Поле крупнее (код из письма, 18px) оно не должно ужимать:
  // !important перебивает любую утилиту text-[Npx], поэтому исключение — атрибут, а не класс.
  const fieldFontProblems = (file: string, code: string): string[] => {
    const bad: string[] = [];
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningLikeElement(node) && ['input', 'textarea', 'select'].includes(node.tagName.getText())) {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const className = attrs.find((a) => a.name.getText() === 'className')?.getText() ?? '';
        const keep = attrs.some((a) => a.name.getText() === 'data-keep-size');
        // ступень шкалы → самый крупный её размер по ширинам; без варианта (md:text-…) тоже считается
        const sizes = [...className.matchAll(/(?<![\w-])text-(caption|small|body|sub|title|headline|display)\b/g)].map((x) =>
          Math.max(...FONT_STEPS[x[1] as keyof typeof FONT_STEPS]),
        );
        const biggest = sizes.length ? Math.max(...sizes) : 0;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        const where = `${file}:${line + 1} <${node.tagName.getText()}>`;
        if (biggest > 16 && !keep) bad.push(`${where}: ${biggest}px ужмётся до 16px на сенсорном экране — нужен data-keep-size`);
        if (keep && biggest < 16) bad.push(`${where}: data-keep-size у поля мельче 16px (iOS увеличит страницу при фокусе)`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return bad;
  };
  test('поле крупнее 16px (код подтверждения, 18px) не ужимается правилом для сенсорных: у него data-keep-size; а data-keep-size — только у полей не мельче 16px', () => {
    const bad: string[] = [];
    for (const file of uiFiles) bad.push(...fieldFontProblems(file, src(file)));
    assert.deepEqual(bad, []);
    assert.match(stripComments(src('components/forms/ConfirmCodeStep.tsx')), /data-keep-size/);
  });
  test('сторож размера полей зрячий: 18px (text-sub) без data-keep-size и data-keep-size у 14px (text-small) и 15px (text-body) — нарушения', () => {
    assert.equal(fieldFontProblems('f.tsx', `export const A = () => <input className="text-sub" />;`).length, 1);
    assert.equal(fieldFontProblems('f.tsx', `export const A = () => <input data-keep-size className="text-sub" />;`).length, 0);
    assert.equal(fieldFontProblems('f.tsx', `export const A = () => <input data-keep-size className="text-small" />;`).length, 1);
    assert.equal(fieldFontProblems('f.tsx', `export const A = () => <input className="text-body" />;`).length, 0);
    // основной текст — 15px: у поля с data-keep-size такой размер на iOS увеличил бы страницу при фокусе
    assert.equal(fieldFontProblems('f.tsx', `export const A = () => <input data-keep-size className="text-body" />;`).length, 1);
  });
}

// ----- шкала шрифтов -------------------------------------------------------------------------------
console.log('Шкала шрифтов: шесть ступеней и акцентная, токены вместо произвольных размеров');
{
  const css = src('app/globals.css');
  const stepNames = Object.keys(FONT_STEPS);
  const regularNames = stepNames.filter((name) => name !== ACCENT_STEP);
  const fontSizeConfig = tailwindConfig.theme?.fontSize as Record<string, unknown>;

  /** Блок `{ … }` после заголовка в CSS: от первой открывающей скобки до парной */
  const cssBlock = (header: string): string => {
    const start = css.indexOf(header);
    assert.ok(start >= 0, `нет блока ${header}`);
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
    }
    throw new Error(`не закрыт блок ${header}`);
  };
  /** Размеры ступеней в px, как их видит браузер на каждой ширине: базовый :root, поверх него блоки @media по порядку */
  const cssSteps = (): Record<string, number[]> => {
    const result: Record<string, number[]> = Object.fromEntries(stepNames.map((name) => [name, []]));
    const current: Record<string, number> = {};
    FONT_BREAKPOINTS.forEach((min) => {
      const body = min === 0 ? cssBlock('\n:root {\n  --fs-caption') : cssBlock(`@media (min-width: ${min}px) {`);
      for (const m of body.matchAll(/--fs-([a-z]+):\s*([\d.]+)rem;/g)) current[m[1]] = Number(m[2]) * 16;
      for (const name of stepNames) {
        assert.ok(name in current, `--fs-${name} не задан на ширине от ${min}px`);
        result[name].push(current[name]);
      }
    });
    return result;
  };

  test('шесть обычных ступеней и одна акцентная — ровно семь, акцентная последняя и называется display', () => {
    assert.equal(stepNames.length, 7);
    assert.equal(regularNames.length, 6);
    assert.equal(ACCENT_STEP, 'display');
    assert.equal(stepNames[stepNames.length - 1], ACCENT_STEP, 'акцентная ступень — старшая');
    assert.deepEqual(stepNames, ['caption', 'small', 'body', 'sub', 'title', 'headline', 'display']);
  });
  test('решение владельца 16.10.2026: основной текст 15px, подзаголовок 18px на всех ширинах; остальные ступени прежние', () => {
    assert.deepEqual(
      { ...FONT_STEPS },
      {
        caption: [12, 12, 12],
        small: [14, 14, 14],
        body: [15, 15, 15],
        sub: [18, 18, 18],
        title: [24, 28, 28],
        headline: [32, 44, 44],
        display: [44, 56, 72],
      },
    );
    // и в самом CSS, а не только в зеркале: rem от корня браузера 16px
    assert.match(css, /--fs-body:\s*0\.9375rem;/);
    assert.match(css, /--fs-sub:\s*1\.125rem;/);
  });
  test('значения в app/globals.css (--fs-*, @media на 768 и 1280px) совпадают с lib/type-scale.ts на каждой ширине', () => {
    const fromCss = cssSteps();
    for (const name of stepNames) assert.deepEqual(fromCss[name], [...FONT_STEPS[name as keyof typeof FONT_STEPS]], name);
  });
  // Порог для соседних ступеней — 1,1×. Единственное исключение — small (14) → body (15), 1,071×: основной текст
  // 15px — решение владельца, а 14 и 15 различаются не размером, а ролью, цветом и весом (README «Шкала шрифтов»,
  // раздел «Чем отличаются 14 и 15»). Порог для этой пары — 1,07 и ровно 1px; другие пары исключений не получают.
  const MIN_STEP_RATIO = 1.1;
  const CLOSE_PAIRS: Record<string, number> = { 'small→body': 1.07 };
  test('ступени растут с каждой, отношение соседних — не меньше 1,1 (иначе их не отличить; единственное исключение small→body, 1,07), акцентная ≥ 1,25 к старшей обычной; на каждой ширине', () => {
    FONT_BREAKPOINTS.forEach((min, tier) => {
      const px = stepNames.map((name) => FONT_STEPS[name as keyof typeof FONT_STEPS][tier]);
      for (let i = 1; i < px.length; i++) {
        const pair = `${stepNames[i - 1]}→${stepNames[i]}`;
        assert.ok(px[i] > px[i - 1], `от ${min}px: ${stepNames[i]} (${px[i]}) не крупнее ${stepNames[i - 1]} (${px[i - 1]})`);
        assert.ok(px[i] / px[i - 1] >= (CLOSE_PAIRS[pair] ?? MIN_STEP_RATIO), `от ${min}px: ${pair}: ${px[i - 1]} → ${px[i]} — слишком близко`);
      }
      const accent = px[px.length - 1];
      assert.ok(accent / px[px.length - 2] >= 1.25, `от ${min}px: акцентная ${accent} к ${px[px.length - 2]}`);
    });
    // подпись — минимум, введённый на 12px; основной текст — 15px и крупнее мелкого ровно на пиксель, не меньше
    assert.ok(Math.min(...FONT_STEPS.caption) >= 12);
    assert.ok(Math.min(...FONT_STEPS.body) >= 15);
    assert.deepEqual(Object.keys(CLOSE_PAIRS), ['small→body'], 'исключений из порога 1,1 — одно');
    FONT_STEPS.small.forEach((px, tier) => assert.ok(FONT_STEPS.body[tier] - px >= 1, `body не крупнее small хотя бы на 1px (ширина ${FONT_BREAKPOINTS[tier]})`));
    // подзаголовок (sub) заметно крупнее основного текста: не меньше чем в 1,2 раза (целые числа — без ошибки округления)
    FONT_STEPS.sub.forEach((px, tier) => assert.ok(px * 5 >= FONT_STEPS.body[tier] * 6, `sub ${px} к body ${FONT_STEPS.body[tier]}: меньше 1,2×`));
  });
  test('основной текст страницы — ступень body: body без своей ступени берёт 15px из шкалы, а не 16px браузера', () => {
    const css = src('app/globals.css');
    const m = /\n\s*body\s*\{[^}]*@apply\s+([^;]*);/.exec(css);
    assert.ok(m, 'нет правила body с @apply в app/globals.css');
    assert.match(m[1], /(?<![\w-])text-body(?![\w-])/, 'у body нет text-body: текст без своей ступени остался бы 16px браузера мимо шкалы');
  });
  test('app/global-error.tsx: числа fontSize — только размеры title и body из шкалы (там нет токенов Tailwind, но и своих размеров быть не должно)', () => {
    const code = stripComments(src('app/global-error.tsx'));
    const sizes = [...code.matchAll(/fontSize:\s*(\d+)/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length >= 3, 'в global-error.tsx ожидаются размеры у заголовка, основного текста, кнопки и ссылки');
    const allowed = new Set<number>([FONT_STEPS.title[0], FONT_STEPS.body[0]]);
    for (const px of sizes) assert.ok(allowed.has(px), `global-error.tsx: ${px}px — не title (${FONT_STEPS.title[0]}) и не body (${FONT_STEPS.body[0]})`);
    assert.ok(sizes.includes(FONT_STEPS.body[0]), 'основной текст global-error.tsx — body');
  });
  test('tailwind.config.ts: размеры шрифта — только наши ступени (theme.fontSize, а не extend): стандартные text-sm / text-lg не создают CSS', () => {
    assert.deepEqual(Object.keys(fontSizeConfig).sort(), [...FONT_STEP_CLASSES].sort());
    const extend = tailwindConfig.theme?.extend as Record<string, unknown> | undefined;
    assert.equal(extend && 'fontSize' in extend, false, 'fontSize в extend вернул бы стандартные размеры Tailwind');
    for (const [name, value] of Object.entries(fontSizeConfig)) {
      const size = Array.isArray(value) ? value[0] : value;
      const step = name === 'eyebrow' ? 'caption' : name;
      assert.equal(size, `var(--fs-${step})`, `${name}: размер должен читать var(--fs-${step})`);
    }
  });
  test('cn(): ступень шрифта не съедает цвет текста и межстрочье, а следующая ступень заменяет предыдущую', () => {
    for (const name of FONT_STEP_CLASSES) {
      const step = `text-${name}`;
      // раньше tailwind-merge принимал text-small за «цвет» и выбрасывал text-ink: кнопка оставалась без подписи
      assert.equal(cn('text-ink', step), `text-ink ${step}`, `${step} съел цвет`);
      assert.equal(cn(step, 'text-paper-dim'), `${step} text-paper-dim`, `${step} съеден цветом`);
      assert.equal(cn('leading-relaxed', step), `leading-relaxed ${step}`, `${step} съел межстрочье`);
    }
    assert.equal(cn('text-small', 'text-body'), 'text-body');
    assert.equal(cn('text-eyebrow uppercase', 'text-caption'), 'uppercase text-caption');
  });

  // Нарушения шкалы в исходнике. Разбор по тексту без комментариев: класс может лежать в строке,
  // шаблоне или константе, а не только в className.
  const COLOR_ROOTS = new Set([...Object.keys((tailwindConfig.theme?.extend as { colors: Record<string, unknown> }).colors), 'red', 'white', 'black', 'transparent', 'current', 'inherit']);
  const NOT_SIZE = new Set(['left', 'center', 'right', 'justify', 'start', 'end', 'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip', 'gradient']);
  const scaleProblems = (file: string, raw: string): string[] => {
    const code = stripComments(raw);
    const bad: string[] = [];
    const lineOf = (index: number) => code.slice(0, index).split('\n').length;
    const report = (re: RegExp, why: string) => {
      for (const m of code.matchAll(re)) bad.push(`${file}:${lineOf(m.index ?? 0)}: ${m[0]} — ${why}`);
    };
    // text-[13px], md:text-[1.2rem], text-[clamp(…)], text-[length:var(--x)]: размер мимо шкалы
    report(/(?<![\w-])text-\[(?:\d|\.\d|clamp|calc|min|max|length:)[^\]]*\]/g, 'произвольный размер шрифта: возьмите ступень шкалы (text-caption … text-display)');
    // стандартные размеры Tailwind отключены в конфиге и молча не дают CSS
    report(/(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g, 'стандартный размер Tailwind отключён: возьмите ступень шкалы');
    report(/(?<![\w-])text-display-(?:sm|md|lg|xl)\b/g, 'прежний токен text-display-*: теперь title / headline / display');
    // inline: fontSize: 15, fontSize: size * 0.34
    report(/\bfontSize\s*:/g, 'fontSize в style: размер должен приходить классом ступени шкалы');
    // опечатка в имени ступени (text-smal, text-bodi) молча даёт «шрифт по умолчанию»
    for (const m of code.matchAll(/(?<![\w-])text-([a-z][a-z0-9-]*)/g)) {
      const word = m[1];
      // стандартные размеры и text-display-* уже названы выше — второй раз не сообщаем
      if (FONT_STEP_CLASSES.includes(word) || NOT_SIZE.has(word) || COLOR_ROOTS.has(word.split('-')[0])) continue;
      if (/^(?:xs|sm|base|lg|xl|[2-9]xl|display-(?:sm|md|lg|xl))$/.test(word)) continue;
      bad.push(`${file}:${lineOf(m.index ?? 0)}: ${m[0]} — не ступень шкалы, не цвет и не выравнивание (опечатка?)`);
    }
    return bad;
  };

  // Исключения — только с причиной. lib/mail: письма вне платформы, почтовый клиент не читает
  // CSS-переменные и классы, у них свои размеры в style="…". global-error: заменяет весь документ при
  // падении корневого макета, стили приложения там не загружены.
  const SCALE_EXEMPT: Record<string, string> = {
    'app/global-error.tsx': 'заменяет весь документ, Tailwind и токены не загружены; размеры 24 и 15px — те же числа, что title и body',
  };
  const scaleFiles = [
    ...uiFiles,
    ...listFiles('lib', /\.tsx?$/).filter((file) => !file.startsWith('lib/mail/') && file !== 'lib/type-scale.ts'),
  ].filter((file) => !(file in SCALE_EXEMPT));

  test('в исходниках нет произвольных размеров шрифта, стандартных text-sm/text-lg, прежних text-display-*, inline fontSize и опечаток в ступенях', () => {
    const bad: string[] = [];
    for (const file of scaleFiles) bad.push(...scaleProblems(file, src(file)));
    assert.deepEqual(bad, []);
  });
  test('исключения шкалы перечислены с причиной, и файлы существуют', () => {
    for (const [file, why] of Object.entries(SCALE_EXEMPT)) {
      assert.ok(why.length > 20, `${file}: нужна причина`);
      assert.ok(readSrc(file).length > 0);
    }
    assert.equal(Object.keys(SCALE_EXEMPT).length, 1);
  });
  test('сторож шкалы зрячий: ловит text-[13px], md:text-[1.2rem], clamp, text-lg, text-display-md, fontSize и опечатку; пропускает ступени, цвета и выравнивание', () => {
    const ok = (code: string) => assert.deepEqual(scaleProblems('f.tsx', code), [], code);
    const found = (code: string, count = 1) => assert.equal(scaleProblems('f.tsx', code).length, count, code);
    found(`<p className="text-[13px]">x</p>`);
    found(`<p className="text-[12.5px] text-paper">x</p>`);
    found(`<p className="md:text-[1.2rem]">x</p>`);
    found(`<p className="text-[clamp(1rem,2vw,2rem)]">x</p>`);
    found(`<p className="text-lg">x</p>`);
    found(`<p className="text-sm text-paper">x</p>`);
    found(`<p className="sm:text-2xl">x</p>`);
    found(`<h1 className="text-display-md">x</h1>`);
    found(`<span style={{ fontSize: 15 }}>x</span>`);
    found(`<span style={{ fontSize: size * 0.34 }}>x</span>`);
    found(`<p className="text-smal">x</p>`);
    found(`<p className="text-papr/70">x</p>`);
    ok(`<p className="text-small text-paper-dim">x</p>`);
    ok(`<p className="md:text-headline text-paper">x</p>`);
    ok(`<p className="text-body text-paper/70 text-center">x</p>`);
    ok(`<p className="text-eyebrow uppercase text-accent-300 hover:text-accent-200">x</p>`);
    ok(`<p className="text-gradient text-white/90 text-ellipsis">x</p>`);
    ok(`<p className="text-[var(--ink)] text-[#fff]">x</p>`);
    ok(`// text-[13px] в комментарии не нарушение\n<p className="text-caption">x</p>`);
  });
  test('в app/globals.css font-size только в переменных шкалы и в правиле 16px для полей на сенсорных', () => {
    const lines = css.split('\n').filter((line) => /font-size\s*:/.test(line));
    assert.deepEqual(lines.map((l) => l.trim()), ['font-size: 16px !important;']);
    assert.equal(/--fs-[a-z]+:/.test(css), true);
  });
  test('замер в браузере: scripts/measure-type-scale.ts проверяет 11 ключевых страниц на ноутбуке и телефоне, в обеих темах, читает шкалу из lib/type-scale.ts и держит поля на сенсорных на 16px', () => {
    const script = src('scripts/measure-type-scale.ts');
    assert.equal((script.match(/\{ key: '/g) ?? []).length, 11);
    assert.match(script, /from '\.\.\/lib\/type-scale'/);
    assert.match(script, /opt\('widths', '1280,375'\)/);
    assert.match(script, /opt\('scheme', 'light'\)/);
    assert.match(script, /const TOUCH_FIELD_PX = 16;/);
    // поле на сенсорном замеряется отдельно от шкалы: ровно 16px, пустые поля тоже
    assert.match(script, /f\.size === TOUCH_FIELD_PX/);
    for (const path of ["'/'", "'/login'", "'/register'", "'/help'", "'/institutions/rating'", "'/institutions'", "'/legal/privacy'", "'/feed'", "'/profile'", "'/applications'"]) {
      assert.ok(script.includes(`path: ${path}`), `нет страницы ${path}`);
    }
  });
  test('README (раздел «Шкала шрифтов»): таблица ступеней совпадает с lib/type-scale.ts', () => {
    const readme = src('README.md');
    const start = readme.indexOf('## Шкала шрифтов');
    assert.ok(start >= 0, 'нет раздела «Шкала шрифтов»');
    const end = readme.indexOf('\n---', start);
    const section = readme.slice(start, end > 0 ? end : undefined);
    const rows = [...section.matchAll(/^\|\s*`(\w+)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gm)].map((m) => [m[1], Number(m[2]), Number(m[3]), Number(m[4])] as const);
    assert.deepEqual(rows.map((r) => r[0]), stepNames);
    for (const [name, ...px] of rows) assert.deepEqual(px, [...FONT_STEPS[name as keyof typeof FONT_STEPS]], name);
  });
}

// ----- иерархия: заголовки разделов и шапка карточки ---------------------------------------------
console.log('Иерархия: заголовки разделов крупнее абзаца и не faint, текст шапки карточки — роль paper');
{
  test('SectionTitle: основной цвет и ступень sub (18px) — крупнее абзацев страницы (15px); роль h2 по умолчанию', () => {
    const code = stripComments(src('components/ui/SectionTitle.tsx'));
    assert.match(code, /as: Tag = 'h2'/);
    assert.match(code, /text-paper/);
    assert.equal(/text-paper-(faint|dim)|text-eyebrow|uppercase/.test(code), false);
    assert.match(code, /text-sub\b/);
    // размер один: двух ступеней между 16 и 24 в шкале нет, прежнего 17px внутри карточки больше нет
    assert.equal(/\bsize\b/.test(code), false, 'у SectionTitle нет prop size');
    // 18 к 15 — ровно 1,2: считаем целыми числами, чтобы дробь не округлилась вниз
    assert.ok(Math.min(...FONT_STEPS.sub) * 5 >= 6 * Math.max(...FONT_STEPS.body), 'подзаголовок не меньше чем в 1,2 раза крупнее основного текста');
  });
  test('/help и /institutions/rating: h2 — SectionTitle, а не подпись капсом третьего уровня', () => {
    for (const file of ['app/help/page.tsx', 'app/institutions/rating/page.tsx', 'app/institutions/page.tsx', 'app/institutions/[slug]/page.tsx']) {
      const code = stripComments(src(file));
      assert.ok(code.includes('<SectionTitle'), `${file}: нет SectionTitle`);
      for (const m of code.matchAll(/<h2\b[^>]*className="([^"]*)"/g)) {
        assert.equal(/text-eyebrow|text-paper-faint|uppercase/.test(m[1]), false, `${file}: h2 «${m[1]}»`);
      }
    }
  });
  test('шапка карточки вакансии: имя, город и число совпадения — роль paper, не фиксированный белый', () => {
    for (const file of ['components/swipe/SwipeCard.tsx', 'components/swipe/VacancyDetail.tsx', 'components/swipe/MatchRing.tsx']) {
      assert.equal(/text-white|#fff\b|#71D9AC|#8DA3B9/i.test(stripComments(src(file))), false, file);
    }
    // белые инициалы остаются только там, где подложка сплошная и всегда тёмная
    assert.match(src('components/ui/Avatar.tsx'), /text-white\/90/);
  });
}

// ----- поиск и превью ссылок -----------------------------------------------------------------------
console.log('Поиск: robots.txt, sitemap.xml, canonical, Open Graph, noindex');
{
  const withOrigin = <T>(fn: () => T): T => {
    const before = process.env.APP_URL;
    process.env.APP_URL = 'https://students.example.ru/';
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = before;
    }
  };

  test('адрес берётся из APP_URL (без хвостового слэша), а не зашит', () => {
    assert.equal(withOrigin(() => absoluteUrl('/help')), 'https://students.example.ru/help');
    assert.equal(withOrigin(() => absoluteUrl('/')), 'https://students.example.ru/');
  });
  test('robots.txt: открыто всё, закрыты кабинеты, API и служебное; Sitemap — абсолютным адресом', () => {
    const robots = withOrigin(() => buildRobots());
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    assert.equal(rule.userAgent, '*');
    assert.equal(rule.allow, '/');
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const path of ['/api/', '/admin', '/employer', '/feed', '/applications', '/skipped', '/messages', '/profile', '/logout', '/forgot', '/reset/']) {
      assert.ok(disallow.includes(path), `не закрыт ${path}`);
    }
    assert.equal(robots.sitemap, 'https://students.example.ru/sitemap.xml');
    // вход и регистрация закрыты метой noindex, а не robots.txt: краулеру надо открыть страницу, чтобы её увидеть
    assert.equal(disallow.some((p) => p.startsWith('/login') || p.startsWith('/register')), false);
    assert.ok(ROBOTS_DISALLOW.every((p) => isNoindexPath(p.replace(/\/$/, ''))), 'всё, что закрыто в robots.txt, закрыто и от индекса');
  });
  test('sitemap.xml: абсолютные адреса от APP_URL, публичные страницы и вузы; закрытых путей нет', () => {
    const map = withOrigin(() => buildSitemap(['kpfu', 'kai', 'kpfu']));
    const urls = map.map((entry) => entry.url);
    for (const path of ['/', '/help', '/institutions', '/institutions/rating', '/legal/terms', '/legal/privacy', '/institutions/kpfu', '/institutions/kai']) {
      assert.ok(urls.includes(`https://students.example.ru${path}`), `нет ${path}`);
    }
    assert.ok(urls.every((u) => u.startsWith('https://students.example.ru/')), 'не все адреса абсолютные');
    assert.equal(new Set(urls).size, urls.length, 'повторы');
    for (const url of urls) assert.equal(isNoindexPath(new URL(url).pathname), false, `закрытый путь в sitemap: ${url}`);
    assert.equal(urls.some((u) => /localhost/.test(u)), false);
  });
  test('каждая публичная страница из PUBLIC_PAGES — не из закрытых', () => {
    for (const page of PUBLIC_PAGES) assert.equal(isNoindexPath(page), false, page);
  });
  test('pageMetadata: canonical, og:title/description/url/site_name/type/locale, картинка 1200×630, Twitter-карточка', () => {
    const meta = withOrigin(() => pageMetadata({ title: 'Помощь', description: 'Описание страницы', path: '/help' }));
    assert.equal(meta.alternates?.canonical, 'https://students.example.ru/help');
    const og = meta.openGraph as Record<string, unknown> & { images: Array<{ url: string; width: number; height: number; alt: string }> };
    assert.equal(og.title, 'Помощь · Fattakhov HR Agency');
    assert.equal(og.description, 'Описание страницы');
    assert.equal(og.url, 'https://students.example.ru/help');
    assert.equal(og.siteName, 'Fattakhov HR Agency');
    assert.equal(og.type, 'website');
    assert.equal(og.locale, 'ru_RU');
    assert.deepEqual([og.images[0].width, og.images[0].height], [1200, 630]);
    assert.equal(og.images[0].url, 'https://students.example.ru/brand/og-students.png');
    assert.ok(og.images[0].alt.length > 10);
    const tw = meta.twitter as Record<string, unknown>;
    assert.equal(tw.card, 'summary_large_image');
    assert.equal(tw.title, 'Помощь · Fattakhov HR Agency');
    const home = withOrigin(() => pageMetadata({ path: '/' }));
    assert.deepEqual(home.title, { absolute: 'Fattakhov HR Agency — работа для студентов' });
    assert.equal((home.openGraph as { title: string }).title, 'Fattakhov HR Agency — работа для студентов');
  });
  test('картинка для превью: PNG ровно 1200×630 и меньше 1 МБ', () => {
    const file = path.join(rootDir, 'public', OG_IMAGE.path);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [OG_IMAGE.width, OG_IMAGE.height]);
    assert.ok(bytes.length < 1024 * 1024, `${bytes.length} байт`);
  });

  // страницы: обходим app/**/page.tsx и сверяем каждую с правилом по её адресу
  const routeOf = (file: string) =>
    '/' + file.replace(/^app\//, '').replace(/\/?page\.tsx$/, '').split('/').filter((part) => part && !/^\(.*\)$/.test(part)).join('/');
  const pages = listFiles('app', /^page\.tsx$/).map((file) => ({ file, route: routeOf(file) === '/' ? '/' : routeOf(file).replace(/\/$/, '') }));

  test('каждая закрытая страница (кабинеты, вход, регистрация, сброс) закрыта noindex — своей меткой или макетом выше', () => {
    const open: string[] = [];
    for (const { file, route } of pages) {
      if (!isNoindexPath(route)) continue;
      const chain = [file];
      for (let dir = path.dirname(file); dir.startsWith('app'); dir = path.dirname(dir)) chain.push(`${dir}/layout.tsx`);
      // метка должна быть присвоена метаданным, а не просто импортирована
      const covered = chain.some((candidate) => {
        try {
          return /metadata\s*=\s*NOINDEX_METADATA|\.\.\.NOINDEX_METADATA/.test(stripComments(src(candidate)));
        } catch {
          return false;
        }
      });
      if (!covered) open.push(route);
    }
    assert.deepEqual(open, []);
    assert.ok(pages.filter((p) => isNoindexPath(p.route)).length >= 15, 'обход нашёл слишком мало закрытых страниц');
  });
  test('каждая публичная страница: canonical и og через pageMetadata, адрес на запрос (force-dynamic)', () => {
    const bad: string[] = [];
    const publicPages = pages.filter((p) => !isNoindexPath(p.route));
    for (const { file, route } of publicPages) {
      const code = stripComments(src(file));
      if (!code.includes('pageMetadata(')) bad.push(`${route}: нет pageMetadata`);
      if (!/export const dynamic = 'force-dynamic'/.test(code)) bad.push(`${route}: не force-dynamic — адрес запомнится при сборке`);
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(publicPages.map((p) => p.route).sort(), ['/', '/companies/[id]', '/help', '/institutions', '/institutions/[slug]', '/institutions/rating', '/legal/[slug]']);
  });
  test('canonical каждой публичной страницы указывает на неё саму: path совпадает с маршрутом (для [param] — строится из params)', () => {
    const bad: string[] = [];
    for (const { file, route } of pages.filter((p) => !isNoindexPath(p.route))) {
      const sf = ts.createSourceFile(file, src(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const paths: ts.Expression[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText() === 'pageMetadata' && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
          for (const prop of node.arguments[0].properties) {
            if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'path') paths.push(prop.initializer);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      if (paths.length === 0) {
        bad.push(`${route}: в pageMetadata нет path`);
        continue;
      }
      for (const expr of paths) {
        if (!route.includes('[')) {
          if (!ts.isStringLiteralLike(expr) || expr.text !== route) bad.push(`${route}: path ${expr.getText()} не совпадает с адресом страницы`);
        } else {
          // /institutions/[slug] → шаблон `/institutions/${…}`: голова совпадает с маршрутом до [param], хвост — подстановка
          const head = route.slice(0, route.indexOf('['));
          if (!ts.isTemplateExpression(expr) || expr.head.text !== head || expr.templateSpans.length !== 1 || expr.templateSpans[0].literal.text !== '') {
            bad.push(`${route}: path ${expr.getText()} не строится как «${head}» + параметр`);
          }
        }
      }
    }
    assert.deepEqual(bad, []);
  });
  test('сторож canonical зрячий: path от чужого маршрута (/help → /) он бы заметил', () => {
    // сверка та же, что выше, на заготовке: страница /help с path '/'
    const expr = (code: string) => {
      const sf = ts.createSourceFile('x.ts', `const v = ${code};`, ts.ScriptTarget.Latest, true);
      return (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0].initializer as ts.Expression;
    };
    const matches = (route: string, code: string) => {
      const e = expr(code);
      return ts.isStringLiteralLike(e) && e.text === route;
    };
    assert.equal(matches('/help', `'/help'`), true);
    assert.equal(matches('/help', `'/'`), false);
    assert.equal(matches('/help', `'/helpx'`), false);
  });
  test('robots.ts и sitemap.ts собирают ответ из lib/seo и считаются на запрос', () => {
    const robots = stripComments(src('app/robots.ts'));
    const sitemap = stripComments(src('app/sitemap.ts'));
    assert.match(robots, /buildRobots\(\)/);
    assert.match(sitemap, /buildSitemap\(/);
    for (const code of [robots, sitemap]) assert.match(code, /export const dynamic = 'force-dynamic'/);
  });
  testAsync('сохранённый вход открывает кабинет, а закрытые разделы сохраняют защиту', async () => {
    for (const role of ['STUDENT', 'EMPLOYER'] as const) {
      const token = await signSession({ accountId: 'header-test', profileId: null, name: 'Demo', role });
      const headers = { cookie: `${SESSION_COOKIE}=${token}` };
      const landing = await proxy(new NextRequest('http://localhost:3400/', { headers }));
      assert.equal(new URL(landing.headers.get('location')!).pathname, HOME_BY_ROLE[role]);
      const explicitLanding = await proxy(new NextRequest('http://localhost:3400/?landing=1', { headers }));
      assert.equal(new URL(explicitLanding.headers.get('location')!).pathname, HOME_BY_ROLE[role]);
      const login = await proxy(new NextRequest('http://localhost:3400/login', { headers }));
      assert.equal(new URL(login.headers.get('location')!).pathname, HOME_BY_ROLE[role]);
      const wrongRole = await proxy(new NextRequest(`http://localhost:3400/${role === 'STUDENT' ? 'employer' : 'profile'}`, { headers }));
      assert.equal(new URL(wrongRole.headers.get('location')!).pathname, '/switch-account');
      assert.equal(new URL(wrongRole.headers.get('location')!).searchParams.get('role'), role === 'STUDENT' ? 'employer' : 'student');
    }
    const guest = await proxy(new NextRequest('http://localhost:3400/profile'));
    assert.equal(new URL(guest.headers.get('location')!).pathname, '/login');
  });
  testAsync('выбор другой роли требует подтверждения, своя роль открывает кабинет', async () => {
    for (const role of ['STUDENT', 'EMPLOYER'] as const) {
      const token = await signSession({ accountId: 'role-entry-test', profileId: null, name: 'Demo', role });
      const headers = { cookie: `${SESSION_COOKIE}=${token}` };
      for (const [path, target] of [['/register', 'STUDENT'], ['/register/company', 'EMPLOYER'], ['/login?role=student', 'STUDENT'], ['/login?role=employer', 'EMPLOYER']] as const) {
        const response = await proxy(new NextRequest(`http://localhost:3400${path}`, { headers }));
        const url = new URL(response.headers.get('location')!);
        assert.equal(url.pathname, target === role ? HOME_BY_ROLE[role] : '/switch-account', path);
        if (target !== role) assert.equal(url.searchParams.get('role'), target.toLowerCase());
        assert.equal(response.cookies.get(SESSION_COOKIE), undefined, 'navigation must not sign out');
      }
      const admin = await proxy(new NextRequest('http://localhost:3400/admin', { headers }));
      assert.equal(new URL(admin.headers.get('location')!).pathname, HOME_BY_ROLE[role]);
    }
    for (const path of ['/', '/register', '/register/company', '/login?role=employer']) {
      const response = await proxy(new NextRequest(`http://localhost:3400${path}`));
      assert.equal(response.headers.get('location'), null, path);
    }
  });
  testAsync('закрытые разделы закрыты и заголовком X-Robots-Tag из proxy; публичные страницы и карта сайта — нет', async () => {
    for (const prefix of NOINDEX_PREFIXES) {
      for (const pathname of [prefix, `${prefix}/x`]) {
        const response = await proxy(new NextRequest(`http://localhost:3400${pathname}`));
        assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/, pathname);
      }
    }
    for (const pathname of ['/', '/help', '/institutions', '/institutions/kpfu', '/legal/privacy', '/robots.txt', '/sitemap.xml', '/applicationsx']) {
      const response = await proxy(new NextRequest(`http://localhost:3400${pathname}`));
      assert.equal(response.headers.get('x-robots-tag'), null, pathname);
    }
  });
  test('метка NOINDEX_METADATA — index и follow выключены', () => {
    assert.deepEqual(NOINDEX_METADATA.robots, { index: false, follow: false });
  });
}

// ----- схемы zod: сообщения по-русски (zod 3.x закреплён в package.json) -------------------------
console.log('Схемы zod: сообщения об ошибках по-русски');
{
  const messages = (result: { success: boolean; error?: { issues: Array<{ message: string; path: PropertyKey[] }> } }, path?: string) =>
    result.success ? [] : (result.error?.issues ?? []).filter((i) => path === undefined || i.path.join('.') === path).map((i) => i.message);

  test('ИНН, телефон, дата рождения: пустое или не строка — русский текст, а не «Invalid input: expected string»', () => {
    assert.deepEqual(messages(innSchema.safeParse(null)), ['Укажите ИНН']);
    assert.deepEqual(messages(requiredPhoneSchema.safeParse(null)), ['Укажите телефон']);
    assert.deepEqual(messages(birthDateSchema.safeParse(null)), ['Укажите дату рождения']);
  });
  test('согласие и соглашение: без галочки — русский текст отказа', () => {
    const { consent, terms } = consentFields();
    assert.deepEqual(messages(consent.safeParse(false)), ['Без согласия на обработку персональных данных регистрация невозможна']);
    assert.deepEqual(messages(terms.safeParse(false)), ['Примите пользовательское соглашение']);
    assert.equal(consent.safeParse(true).success, true);
    assert.equal(terms.safeParse(true).success, true);
  });
  test('вакансия: вилка и часы в неделю — не число (пустое поле формы даёт NaN) → «Укажите число»', () => {
    const result = vacancyInputSchema.safeParse({ salaryFrom: Number.NaN, salaryTo: 'много', hoursPerWeek: Number.NaN });
    for (const field of ['salaryFrom', 'salaryTo', 'hoursPerWeek']) assert.deepEqual(messages(result, field), ['Укажите число'], field);
  });
}

// ----- декоративный текст и кольцо вокруг поля ----------------------------------------------------
console.log('Декоративный текст скрыт от чтения; кольцо поля не двоится с кольцом кнопки внутри него');
{
  /** Не-интерактивные теги с текстом, окрашенным прозрачнее половины: контраст у него ниже нормы намеренно — значит, это узор. */
  const decorativeProblems = (file: string, code: string): string[] => {
    const bad: string[] = [];
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const PLAIN = new Set(['span', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'dt', 'dd', 'strong', 'em', 'b', 'i', 'small', 'time']);
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningLikeElement(node) && PLAIN.has(node.tagName.getText())) {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const className = attrs.find((a) => a.name.getText() === 'className')?.getText() ?? '';
        const hidden = attrs.some((a) => a.name.getText() === 'aria-hidden');
        // text-paper/[0.07] и text-paper/25; варианты hover:/group-hover: не считаются — они только усиливают цвет
        for (const m of className.matchAll(/(?<![:\w-])text-(?:paper|ink)\/(?:\[(0?\.\d+)\]|(\d+))/g)) {
          const alpha = m[1] !== undefined ? Number(m[1]) : Number(m[2]) / 100;
          if (alpha < 0.5 && !hidden) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            bad.push(`${file}:${line + 1} <${node.tagName.getText()}>: ${m[0]} без aria-hidden`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return bad;
  };
  test('текст прозрачнее половины (номера шагов 01–03 на главной) — узор, он скрыт от чтения: aria-hidden', () => {
    const bad: string[] = [];
    for (const file of uiFiles) bad.push(...decorativeProblems(file, src(file)));
    assert.deepEqual(bad, []);
  });
  test('сторож узора зрячий: прозрачная цифра без aria-hidden — нарушение, с ним и обычный текст — нет', () => {
    assert.equal(decorativeProblems('f.tsx', `export const A = () => <span className="text-headline text-paper/[0.07] group-hover:text-paper/[0.13]">01</span>;`).length, 1);
    assert.equal(decorativeProblems('f.tsx', `export const A = () => <span aria-hidden className="text-headline text-paper/[0.07]">01</span>;`).length, 0);
    assert.equal(decorativeProblems('f.tsx', `export const A = () => <p className="text-paper/70">Текст</p>;`).length, 0);
    assert.equal(decorativeProblems('f.tsx', `export const A = () => <p className="text-paper-faint">Текст</p>;`).length, 0);
  });
  test('рамка поля: когда Tab стоит на кнопке внутри неё (отправка в чате), кольцо рамки гасится — остаётся одно, у кнопки', () => {
    const css = src('app/globals.css');
    assert.match(css, /\.field-focus:has\(button:focus-visible[^)]*\)\s*\{\s*outline-style:\s*none;/);
    // кольцо самой рамки при этом остаётся правилом по умолчанию
    assert.match(css, /\.field-focus:focus-within\s*\{\s*outline:\s*2px solid var\(--focus-ring-color\)/);
  });
}


// ----- сверка 16.10.2026: гидратация при «уменьшении движения», выбор месяца, кнопка темы на регистрации ----
console.log('Уменьшение движения: сервер и первый клиентский рендер совпадают');
{
  type FakeWindow = { matchMedia: (query: string) => Record<string, unknown> };
  const g = globalThis as unknown as { window?: FakeWindow };
  /** Страница, где в системе включено «уменьшение движения»: matchMedia отвечает «да» на любой запрос об этом. */
  const reduceWindow = (): FakeWindow => ({
    matchMedia: (query: string) => ({
      matches: /prefers-reduced-motion/.test(query),
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  });

  /** Серверная разметка пяти компонентов в отдельном процессе: с окном «уменьшение движения» с загрузки модулей (как в браузере) и без окна (как на сервере). */
  const renderInProcess = (reduce: boolean): Record<string, string> =>
    JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', 'tests/ssr-reduced-motion.ts'], {
        cwd: rootDir,
        env: { ...process.env, REDUCE: reduce ? '1' : '0' },
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  test('при включённом режиме разметка первого клиентского рендера = серверной (иначе React выбрасывает HTML: ошибка #418)', () => {
    const server = renderInProcess(false);
    const browser = renderInProcess(true);
    assert.deepEqual(Object.keys(browser).sort(), ['CountUp', 'CubeMark', 'MatchRing', 'SplitTextInView', 'SwipeCard']);
    const differ = Object.keys(server).filter((name) => server[name] !== browser[name]);
    assert.deepEqual(differ, [], `компоненты, чья разметка зависит от matchMedia уже при первом рендере: ${differ.join(', ')}`);
  });

  test('серверный снимок хука — всегда false, настоящее значение читается только на клиенте после гидратации', () => {
    const before = g.window;
    try {
      g.window = reduceWindow();
      assert.equal(getReducedMotionServerSnapshot(), false);
      assert.equal(getReducedMotionSnapshot(), true);
      delete g.window;
      assert.equal(getReducedMotionSnapshot(), false, 'без matchMedia (сервер, тестовая среда) движение считается разрешённым');
    } finally {
      if (before) g.window = before;
      else delete g.window;
    }
  });

  test('подписка на смену режима: слушатель вешается на тот же медиазапрос и снимается; без matchMedia — пустая отписка', () => {
    const before = g.window;
    const calls: string[] = [];
    try {
      g.window = {
        matchMedia: (query: string) => ({
          matches: false,
          addListener() {},
          removeListener() {},
          addEventListener: (type: string) => calls.push(`add ${query} ${type}`),
          removeEventListener: (type: string) => calls.push(`remove ${query} ${type}`),
        }),
      };
      const unsubscribe = subscribeReducedMotion(() => {});
      assert.deepEqual(calls, [`add ${REDUCED_MOTION_QUERY} change`]);
      unsubscribe();
      assert.deepEqual(calls, [`add ${REDUCED_MOTION_QUERY} change`, `remove ${REDUCED_MOTION_QUERY} change`]);
      delete g.window;
      assert.doesNotThrow(() => subscribeReducedMotion(() => {})());
    } finally {
      if (before) g.window = before;
      else delete g.window;
    }
  });

  const libAndUi = [...uiFiles, ...listFiles('lib', /\.tsx?$/)];
  test('нигде нет useReducedMotion из framer-motion: в компонентах — useReducedMotionSafe (иначе гидратация снова расходится)', () => {
    const offenders = libAndUi.filter((file) => /\buseReducedMotion\b/.test(stripComments(src(file))));
    assert.deepEqual(offenders, []);
  });
  test('семь мест, где режим учитывался, берут безопасный хук', () => {
    const users = [
      'components/motion/SplitText.tsx',
      'components/swipe/SwipeCard.tsx',
      'components/brand/CubeMark.tsx',
      'components/swipe/MatchRing.tsx',
      'components/motion/CountUp.tsx',
      'components/motion/RouteCurtain.tsx',
      'components/screens/DemoDeck.tsx',
    ];
    for (const file of users) {
      const code = stripComments(src(file));
      assert.match(code, /import \{ useReducedMotionSafe \} from '@\/lib\/hooks\/useReducedMotionSafe'/, file);
      assert.match(code, /useReducedMotionSafe\(\)/, file);
    }
  });
  test('MatchRing и CubeMark пересоздают анимируемый элемент по режиму (key): initial запоминается при монтировании, хук на гидратации ещё false', () => {
    // без key у человека с «уменьшением движения» после гидратации дуга и каркас всё равно играют:
    // 1,1 с на /feed и нарастание opacity у куба на главной (замер 16.10.2026: 109 и 21 разных значений вместо 2)
    assert.match(stripComments(src('components/swipe/MatchRing.tsx')), /<motion\.circle\s+key=\{reduced \? 'still' : 'draw'\}/);
    assert.match(stripComments(src('components/brand/CubeMark.tsx')), /<svg\s+key=\{shouldAnimate \? 'draw' : 'still'\}/);
  });
  test('общее правило: если initial зависит от режима, у того же компонента есть key по режиму', () => {
    const offenders = libAndUi.filter((file) => {
      const code = stripComments(src(file));
      if (!/useReducedMotionSafe\(\)/.test(code)) return false;
      const initialDependsOnMode = /\binitial[=:]\s*\{?[^\n]*\b(reduced|shouldAnimate)\b/.test(code);
      const keyed = /\bkey=\{[^}]*\b(reduced|shouldAnimate)\b[^}]*\}/.test(code);
      return initialDependsOnMode && !keyed;
    });
    assert.deepEqual(offenders, []);
  });
  test('хук держится на useSyncExternalStore с серверным снимком false', () => {
    const code = stripComments(src('lib/hooks/useReducedMotionSafe.ts'));
    assert.match(code, /useSyncExternalStore\(\s*subscribeReducedMotion,\s*getReducedMotionSnapshot,\s*getReducedMotionServerSnapshot\s*\)/);
    assert.match(code, /getReducedMotionServerSnapshot\(\): boolean \{\s*return false;/);
  });
}

console.log('Поле «Дата рождения» и список выбора: название месяца не обрезается, шеврон не лежит на тексте');
{
  const field = stripComments(src('components/ui/Field.tsx'));
  const birth = stripComments(src('components/forms/BirthDateField.tsx'));
  /** Tailwind-шаг отступа в px: 2.5 → 10, 7 → 28 */
  const px = (step: string) => Number(step) * 4;

  test('SelectField: правый отступ списка не меньше, чем шеврон занимает от края (right + size) — на телефоне, от 640px и у обычного', () => {
    // compact ? 'pl-3 pr-6 sm:pl-4 sm:pr-10' : 'pl-4 pr-10'  и  compact ? 'right-2 size-3.5 sm:right-4 sm:size-4' : 'right-4 size-4'
    const padding = field.match(/compact \? '(pl-[\d.]+ pr-[\d.]+) sm:(pl-[\d.]+) sm:(pr-[\d.]+)' : '(pl-[\d.]+ pr-[\d.]+)'/);
    const chevron = field.match(/compact \? '(right-[\d.]+) (size-[\d.]+) sm:(right-[\d.]+) sm:(size-[\d.]+)' : '(right-[\d.]+) (size-[\d.]+)'/);
    assert.ok(padding && chevron, 'не найдены классы отступа и шеврона');
    const variants = [
      { name: 'узкий, до 640px', padding: padding[1], right: chevron[1], size: chevron[2] },
      { name: 'узкий, от 640px', padding: `${padding[2]} ${padding[3]}`, right: chevron[3], size: chevron[4] },
      { name: 'обычный', padding: padding[4], right: chevron[5], size: chevron[6] },
    ];
    for (const v of variants) {
      const pr = px(v.padding.match(/pr-([\d.]+)/)![1]);
      const right = px(v.right.match(/right-([\d.]+)/)![1]);
      const size = px(v.size.match(/size-([\d.]+)/)![1]);
      assert.ok(pr >= right + size, `${v.name}: pr ${pr}px < шеврон ${right + size}px от края`);
    }
    // от 640px узкий вид совпадает с обычным: на ноутбуке и планшете вид поля не менялся
    assert.equal(variants[1].padding, variants[2].padding);
    assert.equal(`${variants[1].right} ${variants[1].size}`, `${variants[2].right} ${variants[2].size}`);
  });
  test('SelectField: подпись («МЕСЯЦ») встаёт на левый отступ значения, в обоих видах и на обоих размерах', () => {
    assert.match(field, /compact \? 'left-3 sm:left-4' : 'left-4'/);
    assert.match(field, /compact \? 'pl-3 pr-6 sm:pl-4 sm:pr-10' : 'pl-4 pr-10'/);
  });
  test('«Дата рождения»: три списка в ряд, который переносится, без колонок с потолком minmax(0,5.5rem)/(0,6.75rem)', () => {
    assert.equal(/minmax\(0,\s*5\.5rem\)|minmax\(0,\s*6\.75rem\)/.test(birth), false, 'вернулась сетка с потолком у дня и года');
    assert.match(birth, /className="flex flex-wrap /);
    assert.equal((birth.match(/<SelectField\s+compact/g) ?? []).length, 3, 'все три списка — узкого вида');
  });
  test('«Дата рождения»: месяц забирает остаток (grow 1000 против 1 у года), его минимум вмещает «Сентябрь» с отступами', () => {
    const month = birth.match(/className="([^"]*)"\s+label="Месяц"/);
    const year = birth.match(/className="([^"]*)"\s+label="Год"/);
    const day = birth.match(/className="([^"]*)"\s+label="День"/);
    assert.ok(month && year && day, 'не найдены классы трёх списков');
    assert.match(month[1], /grow-\[1000\]/);
    assert.match(year[1], /\bgrow\b/);
    assert.match(day[1], /grow-0/);
    const rem = (classes: string) => Number(classes.match(/basis-\[([\d.]+)rem\]/)![1]) * 16;
    // ширина поля = рамка 2 + отступы 12 и 24 + самое длинное значение + запас 3px на округление:
    // «Сентябрь» в 16px Inter — 75,4px (замер canvas в Chromium; на сенсорном экране, где это важно, поле 16px по правилу
    // globals.css, а не 15px основного текста), «31» — 20px, «2008» — 40px
    const need = (text: number) => 2 + 12 + 24 + text + 3;
    assert.ok(rem(month[1]) >= need(75.4), `минимум месяца ${rem(month[1])}px меньше нужных ${need(75.4)}px`);
    assert.ok(rem(day[1]) >= need(20), `день ${rem(day[1])}px, нужно ${need(20)}px`);
    assert.ok(rem(year[1]) >= need(40), `год ${rem(year[1])}px, нужно ${need(40)}px`);
    // и в одну строку все три помещаются на 375px у «Профиля» (блок 279px: на 6px зазоров два промежутка)
    assert.ok(rem(day[1]) + rem(month[1]) + rem(year[1]) + 12 <= 279, 'на 375px у «Профиля» три списка перестали помещаться в одну строку');
    // порядок в разметке — день, месяц, год: так идёт Tab и на узком экране, где год переходит на вторую строку
    assert.ok(birth.indexOf('label="День"') < birth.indexOf('label="Месяц"') && birth.indexOf('label="Месяц"') < birth.indexOf('label="Год"'));
    assert.equal(/\border-\d|\border-\[/.test(birth), false, 'order меняет визуальный порядок, но не порядок Tab');
  });
  test('«Дата рождения»: от 640px — прежние ширины дня и года и зазор 8px (на ноутбуке вид не менялся)', () => {
    const day = birth.match(/className="([^"]*)"\s+label="День"/);
    const year = birth.match(/className="([^"]*)"\s+label="Год"/);
    assert.ok(day && year);
    // до правки: колонки minmax(0,5.5rem) / 1fr / minmax(0,6.75rem) и gap-2
    assert.match(day[1], /\bsm:basis-\[5\.5rem\]/);
    assert.match(year[1], /\bsm:basis-\[6\.75rem\]/);
    assert.match(birth, /className="flex flex-wrap [^"]*\bsm:gap-x-2\b/);
  });
}

console.log('Регистрация: кнопка темы — в шапке мастера, а не плавающей над рядом «Назад / Далее»');
{
  const css = src('app/globals.css');
  const toggle = stripComments(src('components/theme/ThemeToggle.tsx'));
  const wizard = stripComments(src('components/screens/RegistrationWizard.tsx'));

  test('мастер: <ThemeToggle inline /> стоит в <header>, рядом с «Шаг N из 5»', () => {
    const header = wizard.match(/<header[\s\S]*?<\/header>/);
    assert.ok(header, 'нет <header> у мастера');
    assert.match(header[0], /<ThemeToggle inline \/>/);
    assert.match(wizard, /import \{ ThemeToggle \} from '@\/components\/theme\/ThemeToggle'/);
  });
  test('ThemeToggle inline: в потоке страницы (relative), с пометкой data-theme-toggle-inline; fixed и углы — только у плавающей', () => {
    assert.match(toggle, /data-theme-toggle-inline=\{inline \? '' : undefined\}/);
    const cls = toggle.match(/inline\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/);
    assert.ok(cls, 'нет ветвления классов по inline');
    assert.match(cls[1], /\brelative\b/);
    assert.equal(/\bfixed\b|\bbottom-|\bright-/.test(cls[1]), false, 'у встроенной не должно быть fixed и углов');
    assert.match(cls[2], /\bfixed\b/);
    assert.match(cls[2], /bottom-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/);
  });
  test('globals.css: плавающую кнопку прячет правило «на странице есть встроенная» — вне @layer, иначе fixed/grid из утилит его перебьют', () => {
    const rule = /body:has\(\[data-theme-toggle-inline\]\) \[data-theme-toggle\]:not\(\[data-theme-toggle-inline\]\)\s*\{\s*display:\s*none;\s*\}/.exec(css);
    assert.ok(rule, 'нет правила, прячущего плавающую кнопку');
    const before = css.slice(0, rule.index).replace(/\/\*[\s\S]*?\*\//g, '');
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    assert.equal(depth, 0, 'правило вложено в @layer или @media — слоёные утилиты его перебьют, а @media сузит');
  });
  test('прежний обходной путь убран: нет .clear-theme-toggle-bottom ни в CSS, ни в компонентах', () => {
    assert.equal(css.includes('clear-theme-toggle-bottom'), false);
    const users = uiFiles.filter((file) => src(file).includes('clear-theme-toggle-bottom'));
    assert.deepEqual(users, []);
  });
  test('мастер регистрации: <main> обрезает сдвиг шага по горизонтали (overflow-x-clip), иначе въезжающий шаг растягивает страницу на 24px', () => {
    // шаги въезжают с x = ±44px (stepVariants); на мобильном Chrome страница на шагах «График» и «Навыки»
    // становилась шире окна (innerWidth 399 при 375), и кнопки уезжали вправо
    const main = wizard.match(/<main className="([^"]*)"/);
    assert.ok(main);
    assert.match(main[1], /\boverflow-x-clip\b/);
    assert.match(src('lib/motion.ts'), /x: dir >= 0 \? 44 : -44/);
  });
}

console.log('Кнопка темы: прибита к окну, а не к содержимому');
{
  const layout = stripComments(src('app/layout.tsx'));
  // без stripComments: он обрезает строку по «//» внутри классов и теряет хвост файла
  const toggle = src('components/theme/ThemeToggle.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
  const landing = stripComments(src('components/screens/Landing.tsx'));
  const css = stripComments(src('app/globals.css'));

  test('плавающая кнопка стоит в корневом layout рядом с RouteCurtain, а не внутри него: ни PageTransition, ни AppShell, ни экран её не обёртывают', () => {
    const curtain = layout.match(/<RouteCurtain>[\s\S]*?<\/RouteCurtain>/);
    assert.ok(curtain, 'нет <RouteCurtain> в layout');
    assert.equal(curtain[0].includes('ThemeToggle'), false, 'кнопка внутри RouteCurtain/children — у предков с transform fixed привяжется к ним');
    assert.match(layout, /<\/ToastProvider>\s*<ThemeToggle \/>/);
  });
  test('ThemeToggle: у плавающей нет transform/filter/will-change/contain на самой кнопке и нет предков-обёрток в компоненте', () => {
    assert.equal(/(?:^|[\s'"])(?:transform|will-change|contain|filter)(?:[\s'"]|$)/.test(toggle.replace(/backdrop-blur-glass/g, '')), false);
  });
  test('ThemeToggle: подпись aria-label и касание не меньше 44px (size-11)', () => {
    assert.match(toggle, /aria-label="Переключить тему"/);
    assert.match(toggle, /size-11/);
  });
  test('лендинг: корень обрезает выход колоды по горизонтали (overflow-x-clip), иначе улетающая карточка растягивает страницу вширь', () => {
    assert.match(landing, /<div className="relative overflow-x-clip">/);
  });
  test('зерно .grain::before: фиксированный слой ровно по окну (inset: 0), без выхода за край', () => {
    const rule = css.match(/\.grain::before\s*\{[^}]*\}/);
    assert.ok(rule);
    assert.match(rule[0], /inset:\s*0;/);
  });
}

console.log('Инициалы аватара и подписи в несколько строк');
{
  test('инициалы: кавычки и знаки не попадают в аватар («К«» у «Кофейни «Север»»)', () => {
    assert.equal(initials('Кофейня «Север»'), 'КС');
    assert.equal(initials('Даркстор «Ближний»'), 'ДБ');
    assert.equal(initials('Агентство «Формат»'), 'АФ');
    assert.equal(initials('ООО "Вектор Плюс"'), 'ОВ');
    assert.equal(initials('«Север» кофе'), 'СК');
  });
  test('инициалы: слова без букв пропускаются, обычные имена и пустая строка — как раньше', () => {
    assert.equal(initials('Иван Петров'), 'ИП');
    assert.equal(initials('  иван   петров сергеевич '), 'ИП');
    assert.equal(initials('Alpha & Beta'), 'AB');
    assert.equal(initials('Яндекс'), 'Я');
    assert.equal(initials('2ГИС Групп'), '2Г');
    assert.equal(initials(''), '');
    assert.equal(initials('«»'), '');
  });
  test('Chip: min-h вместо h — подпись в две строки не упирается в рамку', () => {
    const chip = stripComments(src('components/ui/Chip.tsx'));
    assert.equal(/'h-10 px-4|'h-8 px-3/.test(chip), false, 'вернулась фиксированная высота');
    assert.match(chip, /'min-h-10 px-4 py-1\.5 text-small'/);
    assert.match(chip, /'min-h-8 px-3 py-1 text-caption'/);
  });
}

console.log('Документация: README описывает ту версию zod, что закреплена');
{
  test('README: раздел про схемы zod называет мажорную версию из package.json и не предписывает параметр zod 4', () => {
    const pkg = JSON.parse(src('package.json')) as { dependencies: Record<string, string> };
    const major = pkg.dependencies.zod.replace(/^[^\d]*/, '').split('.')[0];
    const readme = src('README.md');
    assert.match(readme, new RegExp(`\\*\\*Схемы zod ${major}\\.`), `в README нет пункта «Схемы zod ${major}»`);
    const other = ['3', '4'].filter((v) => v !== major)[0];
    assert.equal(new RegExp(`\\*\\*Схемы zod ${other}\\.`).test(readme), false, `в README остался пункт «Схемы zod ${other}»`);
    // инструкция «ошибку задавать через { error: '…' }» для zod 3 неверна: он её молча игнорирует
    if (major === '3') assert.equal(/z\.string\(\{ error: '…' \}\)\`,/.test(readme), false);
  });
}

void Promise.all(pending).then(() => {
  console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
  if (failures.length) process.exitCode = 1;
});
