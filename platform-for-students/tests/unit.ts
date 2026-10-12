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
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
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
import { emailCodeSchema, passwordSchema, registrationSteps } from '../lib/validation';
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

void Promise.all(pending).then(() => {
  console.log(`\n${passed} проверок пройдено, ${failures.length} провалено`);
  if (failures.length) process.exitCode = 1;
});
