/**
 * Проверки «персональные данные студентов»: повторное согласие, журнал аудита без ФИО,
 * файлы-сироты, видео по подписанной ссылке, журнал чтения документов.
 *
 * Подключается из tests/security.ts (npm run test:security): те же правила проходят
 * на хранилище в памяти и, с DATABASE_URL, на настоящем Postgres. Хранилище файлов —
 * временный каталог на диске и поддельный S3 в памяти; настоящему облаку здесь не место.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { STUDENT_CONSENT_VERSION } from '../lib/legal';
import { recordAudit as audit } from '../lib/security/audit-log';
import { auditFileRead, FILE_READ_DEDUPE_MS } from '../lib/file-read-audit';
import { AUDIT_RETENTION_MONTHS, auditCutoff } from '../lib/audit-retention';
import { listAuditEntries } from '../lib/services';
import { runNotificationJobs } from '../lib/notify';
import {
  ORPHAN_GRACE_MS,
  ORPHAN_SWEEP_LIMIT,
  collectReferencedFiles,
  releaseReplacedFiles,
  sweepOrphanFiles,
} from '../lib/stored-files';
import { presignUpload, storageTestHooks, storeUpload, verifyUploadedVideo } from '../lib/storage';
import type { DataStore, NewStudentInput } from '../lib/db/types';
import type { SessionUser } from '../lib/types';

type TestFn = (name: string, fn: () => Promise<void> | void) => Promise<void>;

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const HEAD = new Headers({ 'x-forwarded-for': '203.0.113.9', 'user-agent': 'pii-test-browser' });
const DAY = 86_400_000;
/** Свои имена событий у каждого запуска: на настоящей базе записи прежних запусков остаются */
const RUN = unique();

/** Поддельный S3: объекты в памяти, страницы по 2 ключа — чтобы пагинация была настоящей. */
class FakeS3 {
  objects = new Map<string, { body: Buffer; modified: Date; type?: string }>();
  log: Array<{ op: string; key?: string; range?: string }> = [];

  put(key: string, body: Buffer, modified = new Date(), type?: string) {
    this.objects.set(key, { body, modified, type });
  }

  async send(command: { constructor: { name: string }; input: Record<string, unknown> }): Promise<Record<string, unknown>> {
    const op = command.constructor.name;
    const input = command.input;
    const key = input.Key as string | undefined;
    this.log.push({ op, key, range: input.Range as string | undefined });
    switch (op) {
      case 'PutObjectCommand':
        this.put(key!, Buffer.from(input.Body as Buffer), new Date(), input.ContentType as string);
        return {};
      case 'DeleteObjectCommand':
        this.objects.delete(key!);
        return {};
      case 'HeadObjectCommand': {
        const o = this.objects.get(key!);
        if (!o) throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        return { ContentLength: o.body.length, ContentType: o.type };
      }
      case 'GetObjectCommand': {
        const o = this.objects.get(key!);
        if (!o) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
        let body = o.body;
        const range = /^bytes=(\d+)-(\d+)$/.exec(String(input.Range ?? ''));
        if (range) body = body.subarray(Number(range[1]), Number(range[2]) + 1);
        return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
      }
      case 'ListObjectsV2Command': {
        const prefix = String(input.Prefix ?? '');
        const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const start = input.ContinuationToken ? Number(input.ContinuationToken) : 0;
        const page = keys.slice(start, start + 2);
        const more = start + 2 < keys.length;
        return {
          Contents: page.map((k) => ({ Key: k, LastModified: this.objects.get(k)!.modified, Size: this.objects.get(k)!.body.length })),
          IsTruncated: more,
          NextContinuationToken: more ? String(start + 2) : undefined,
        };
      }
      default:
        throw new Error(`FakeS3: неожиданная команда ${op}`);
    }
  }
}

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64, 1)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 2)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)]);
const PDF = Buffer.from('%PDF-1.4\n' + 'x'.repeat(64));

export async function runPiiFixTests(test: TestFn, store: DataStore) {
  const root = mkdtempSync(path.join(tmpdir(), 'fhr-pii-'));
  process.env.UPLOAD_DIR = root;
  storageTestHooks.reset();

  async function mkStudent(extra: Partial<NewStudentInput> = {}) {
    return store.students.createWithAccount({
      email: `pii-${unique()}@example.test`,
      password: 'Tuman-Zakat-4821',
      fullName: 'Секретов Иван Петрович',
      phone: '+79991112233',
      gender: 'MALE',
      birthYear: 2003,
      birthDate: '2003-04-05',
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
      consentVersion: '2026-09-30',
      consentIp: '198.51.100.1',
      termsVersion: 'test',
      marketingConsent: false,
      ...extra,
    });
  }
  const sessionOf = (account: { id: string; role: 'STUDENT' | 'EMPLOYER' | 'ADMIN' }, name: string): SessionUser => ({
    accountId: account.id,
    role: account.role,
    profileId: null,
    name,
  });
  const fileOnDisk = (url: string) => {
    const m = /^\/api\/files\/([A-Za-z]+)\/(.+)$/.exec(url)!;
    return path.join(root, m[1], m[2]);
  };
  const upload = async (kind: 'photo' | 'resume' | 'study' | 'studentVideo', bytes: Buffer, type: string) =>
    (await storeUpload(kind, new File([new Uint8Array(bytes)], 'f.bin', { type }))).url;
  const age = (url: string, ms: number) => {
    const when = new Date(Date.now() - ms);
    utimesSync(fileOnDisk(url), when, when);
  };

  // ---------- A. Повторное согласие ----------
  console.log('Повторное согласие студента');
  await test('acceptConsent записывает версию, время и IP; прежний профиль не трогает', async () => {
    const { student } = await mkStudent();
    assert.equal(student.consentVersion, '2026-09-30');
    const updated = await store.students.acceptConsent(student.id, { version: STUDENT_CONSENT_VERSION, ip: '203.0.113.77' });
    assert.ok(updated);
    assert.equal(updated.consentVersion, STUDENT_CONSENT_VERSION);
    assert.equal(updated.consentIp, '203.0.113.77');
    assert.ok(updated.consentAt.getTime() >= student.consentAt.getTime());
    const fresh = await store.students.findById(student.id);
    assert.equal(fresh?.consentVersion, STUDENT_CONSENT_VERSION);
    assert.equal(fresh?.university, 'Тестовый вуз');
  });
  await test('acceptConsent: студента нет — null', async () => {
    assert.equal(await store.students.acceptConsent(randomUUID(), { version: STUDENT_CONSENT_VERSION, ip: null }), null);
  });

  // ---------- B. Журнал аудита без ФИО ----------
  console.log('Журнал аудита: без ФИО, стирание при удалении, срок хранения');
  await test('подпись актора — роль и accountId: ФИО в журнал не попадает', async () => {
    const { account } = await mkStudent();
    await audit(sessionOf(account, 'Секретов Иван Петрович'), { action: `pii.test.label.${RUN}`, entity: 'Student', entityId: 'x' }, HEAD);
    const row = (await store.audit.list(50)).find((e) => e.action === `pii.test.label.${RUN}` && e.accountId === account.id);
    assert.ok(row, 'запись не найдена');
    assert.equal(row.actorLabel, `STUDENT:${account.id}`);
    assert.ok(!JSON.stringify(row).includes('Секретов'));
  });
  await test('удаление профиля стирает подпись, IP и user-agent у записей этого аккаунта, чужие не трогает', async () => {
    const mine = await mkStudent();
    const other = await mkStudent();
    await audit(sessionOf(mine.account, 'Секретов'), { action: `pii.test.mine.${RUN}` }, HEAD);
    await audit(sessionOf(mine.account, 'Секретов'), { action: 'student.profile.deleted', entity: 'Student', entityId: mine.student.id }, HEAD);
    await audit(sessionOf(other.account, 'Другой'), { action: `pii.test.other.${RUN}` }, HEAD);

    await store.students.deleteByAccountId(mine.account.id);

    const rows = await store.audit.list(500);
    const mineRows = rows.filter((e) => e.action === `pii.test.mine.${RUN}` || (e.action === 'student.profile.deleted' && e.entityId === mine.student.id));
    assert.equal(mineRows.length, 2, 'сам факт удаления и прочие события остаются в журнале');
    for (const row of mineRows) {
      assert.equal(row.accountId, null);
      assert.equal(row.actorLabel, 'DELETED');
      assert.equal(row.ip, null);
      assert.equal(row.userAgent, null);
    }
    const otherRow = rows.find((e) => e.action === `pii.test.other.${RUN}` && e.accountId === other.account.id);
    assert.equal(otherRow?.actorLabel, `STUDENT:${other.account.id}`);
    assert.equal(otherRow?.ip, '203.0.113.9');
    assert.equal(await store.students.findById(mine.student.id), null, 'вместе с профилем ушёл и consentIp');
  });
  await test('в админке имя подтягивается из аккаунта, пока он есть; удалённого показываем без имени', async () => {
    const live = await mkStudent();
    const gone = await mkStudent();
    await audit(sessionOf(live.account, 'x'), { action: `pii.test.shown.${RUN}` }, HEAD);
    await audit(sessionOf(gone.account, 'x'), { action: `pii.test.hidden.${RUN}` }, HEAD);
    await store.students.deleteByAccountId(gone.account.id);

    const entries = await listAuditEntries(500);
    const shown = entries.find((e) => e.action === `pii.test.shown.${RUN}`);
    assert.equal(shown?.actorLabel, 'STUDENT:Секретов Иван Петрович');
    const hidden = entries.find((e) => e.action === `pii.test.hidden.${RUN}`);
    assert.ok(hidden && !/Секретов/.test(hidden.actorLabel) && !hidden.ip);
  });
  await test('срок хранения журнала — 12 месяцев: граница считается по календарю', () => {
    assert.equal(AUDIT_RETENTION_MONTHS, 12);
    assert.equal(auditCutoff(new Date('2026-10-05T10:00:00Z')).toISOString(), '2025-10-05T10:00:00.000Z');
    assert.equal(auditCutoff(new Date('2028-02-29T00:00:00Z')).toISOString().slice(0, 7), '2027-02');
  });
  await test('ночная задача удаляет записи старше 12 месяцев и не трогает свежие', async () => {
    const now = new Date();
    const tag = unique();
    const old = new Date(now.getTime() - 400 * DAY);
    const nearEdge = new Date(now.getTime() - 360 * DAY);
    const entry = (action: string, createdAt: Date) => ({
      accountId: null,
      actorLabel: 'ANONYMOUS',
      action,
      entity: null,
      entityId: null,
      ip: '203.0.113.9',
      userAgent: null,
      meta: null,
      createdAt,
    });
    await store.audit.log(entry(`pii.old.${tag}`, old));
    await store.audit.log(entry(`pii.edge.${tag}`, nearEdge));
    await store.audit.log(entry(`pii.new.${tag}`, now));

    const result = await runNotificationJobs(now, { forceMaintenance: true });
    assert.equal(result.maintenanceRan, true);
    assert.ok(result.auditPurged >= 1, `удалено ${result.auditPurged}`);
    const actions = (await store.audit.list(5000)).map((e) => e.action);
    assert.ok(!actions.includes(`pii.old.${tag}`), 'старая запись осталась');
    assert.ok(actions.includes(`pii.edge.${tag}`));
    assert.ok(actions.includes(`pii.new.${tag}`));
  });

  await test('суточная уборка не чаще одного раза в сутки: следующие проходы напоминаний её пропускают', async () => {
    const now = new Date();
    const again = await runNotificationJobs(new Date(now.getTime() + 60 * 60_000));
    assert.equal(again.maintenanceRan, false);
    assert.equal(again.auditPurged, 0);
    assert.equal(again.orphanFilesDeleted, 0);
  });

  // ---------- C. Файлы-сироты ----------
  console.log('Файлы: замена и сироты');
  await test('при замене фото старый файл удаляется, новый и прочие остаются', async () => {
    const oldPhoto = await upload('photo', JPEG, 'image/jpeg');
    const newPhoto = await upload('photo', JPEG, 'image/jpeg');
    const resume = await upload('resume', PDF, 'application/pdf');
    const { student } = await mkStudent({ photoUrl: oldPhoto, resumeUrl: resume });
    // как в PATCH /api/students/me: сначала запись в базу, потом уборка прежнего
    await store.students.update(student.id, { ...baseUpdate(), photoUrl: newPhoto, resumeUrl: resume });
    const after = (await store.students.findById(student.id))!;
    await releaseReplacedFiles(store, student, after);
    assert.equal(existsSync(fileOnDisk(oldPhoto)), false);
    assert.equal(existsSync(fileOnDisk(newPhoto)), true);
    assert.equal(existsSync(fileOnDisk(resume)), true);
  });
  await test('замена резюме и видео-файла: прежние удаляются; внешняя ссылка на видео не трогается', async () => {
    const resume1 = await upload('resume', PDF, 'application/pdf');
    const resume2 = await upload('resume', PDF, 'application/pdf');
    const video1 = await upload('studentVideo', MP4, 'video/mp4');
    const { student } = await mkStudent({ resumeUrl: resume1 });
    await store.students.update(student.id, { ...baseUpdate(), resumeUrl: resume1, videoUrl: video1 });
    const withVideo = (await store.students.findById(student.id))!;

    await store.students.update(student.id, { ...baseUpdate(), resumeUrl: resume2, videoUrl: 'https://youtu.be/abcdefghijk' });
    const after = (await store.students.findById(student.id))!;
    await releaseReplacedFiles(store, withVideo, after);
    assert.equal(existsSync(fileOnDisk(resume1)), false);
    assert.equal(existsSync(fileOnDisk(video1)), false);
    assert.equal(existsSync(fileOnDisk(resume2)), true);

    // обратный переход: с внешней ссылки на файл — удалять нечего, ошибки нет
    await releaseReplacedFiles(store, after, { ...after, videoUrl: null });
  });
  await test('файл, на который ссылается другой профиль, при замене не удаляется', async () => {
    const shared = await upload('photo', JPEG, 'image/jpeg');
    const next = await upload('photo', JPEG, 'image/jpeg');
    const a = await mkStudent({ photoUrl: shared });
    await mkStudent({ photoUrl: shared });
    await store.students.update(a.student.id, { ...baseUpdate(), photoUrl: next });
    const after = (await store.students.findById(a.student.id))!;
    await releaseReplacedFiles(store, a.student, after);
    assert.equal(existsSync(fileOnDisk(shared)), true, 'общий файл удалён');
  });
  await test('сбой удаления при замене не роняет сохранение профиля', async () => {
    const gone = '/api/files/photo/00000000-0000-4000-8000-000000000000.jpg';
    const { student } = await mkStudent({ photoUrl: gone });
    await releaseReplacedFiles(store, student, { ...student, photoUrl: null });
  });

  const sweepNow = () => new Date();
  await test('сирота старше суток удаляется, свежая загрузка остаётся', async () => {
    const orphan = await upload('photo', JPEG, 'image/jpeg');
    const fresh = await upload('photo', JPEG, 'image/jpeg');
    age(orphan, ORPHAN_GRACE_MS + 60_000);
    age(fresh, ORPHAN_GRACE_MS - 60 * 60_000);
    const result = await sweepOrphanFiles(store, { now: sweepNow() });
    assert.equal(existsSync(fileOnDisk(orphan)), false);
    assert.equal(existsSync(fileOnDisk(fresh)), true);
    assert.ok(result.deleted >= 1);
  });
  await test('используемый файл не удаляется: фото, резюме, справка и видео профиля', async () => {
    const photo = await upload('photo', JPEG, 'image/jpeg');
    const resume = await upload('resume', PDF, 'application/pdf');
    const study = await upload('study', PDF, 'application/pdf');
    const video = await upload('studentVideo', MP4, 'video/mp4');
    const { student } = await mkStudent({ photoUrl: photo, resumeUrl: resume });
    await store.students.update(student.id, { ...baseUpdate(), photoUrl: photo, resumeUrl: resume, videoUrl: video });
    await store.students.setStudyDocument(student.id, { url: study, name: 'справка.pdf' });
    for (const url of [photo, resume, study, video]) age(url, 40 * DAY);

    await sweepOrphanFiles(store, { now: sweepNow() });
    for (const url of [photo, resume, study, video]) assert.equal(existsSync(fileOnDisk(url)), true, url);
  });
  await test('файл, упомянутый только в тексте анкеты (портфолио), тоже считается используемым', async () => {
    const mentioned = await upload('photo', JPEG, 'image/jpeg');
    const { student } = await mkStudent();
    await store.students.update(student.id, {
      ...baseUpdate(),
      about: `Моё фото: ${mentioned}`,
    });
    age(mentioned, 40 * DAY);
    const refs = await collectReferencedFiles(store);
    assert.ok(refs.has(`photo/${path.basename(mentioned)}`));
    await sweepOrphanFiles(store, { now: sweepNow() });
    assert.equal(existsSync(fileOnDisk(mentioned)), true);
  });
  await test('чужие виды и чужие имена не трогаем: файлы компании, не-UUID, посторонние каталоги', async () => {
    mkdirSyncSafe(path.join(root, 'company'));
    mkdirSyncSafe(path.join(root, 'photo'));
    mkdirSyncSafe(path.join(root, 'elsewhere'));
    const files = [
      path.join(root, 'company', `${randomUUID()}.jpg`),
      path.join(root, 'companyVideo', `${randomUUID()}.mp4`),
      path.join(root, 'photo', 'readme.txt'),
      path.join(root, 'elsewhere', `${randomUUID()}.jpg`),
    ];
    mkdirSyncSafe(path.join(root, 'companyVideo'));
    for (const f of files) {
      writeFileSync(f, JPEG);
      const when = new Date(Date.now() - 90 * DAY);
      utimesSync(f, when, when);
    }
    await sweepOrphanFiles(store, { now: sweepNow() });
    for (const f of files) assert.equal(existsSync(f), true, f);
  });
  await test('лимит за запуск: удаляются самые старые, остальное ждёт следующей ночи', async () => {
    // Сироты от прошлых проверок убраны заранее — считаем только своих шестерых
    await sweepOrphanFiles(store, { now: sweepNow() });
    const orphans: string[] = [];
    for (let i = 0; i < 6; i++) {
      const url = await upload('resume', PDF, 'application/pdf');
      age(url, 10 * DAY - i * 60_000); // чем больше i, тем моложе
      orphans.push(url);
    }
    const result = await sweepOrphanFiles(store, { now: sweepNow(), limit: 3 });
    assert.equal(result.deleted, 3);
    assert.equal(result.truncated, true);
    const left = orphans.filter((u) => existsSync(fileOnDisk(u)));
    assert.equal(left.length, 3);
    // Остались самые молодые — i = 3, 4, 5
    assert.deepEqual(left.sort(), [orphans[3], orphans[4], orphans[5]].sort());
    assert.equal(ORPHAN_SWEEP_LIMIT, 500);
  });
  await test('в базе нет ни одной ссылки — подозрение на чужую базу: ничего не удаляем', async () => {
    const orphan = await upload('photo', JPEG, 'image/jpeg');
    age(orphan, 30 * DAY);
    const empty = {
      students: { list: async () => [], findByFileUrl: async () => null },
      employers: { list: async () => [] },
      audit: { log: async () => undefined },
    } as unknown as DataStore;
    const result = await sweepOrphanFiles(empty, { now: sweepNow() });
    assert.equal(result.deleted, 0);
    assert.match(result.skipped ?? '', /ссыл/);
    assert.equal(existsSync(fileOnDisk(orphan)), true);
  });
  await test('пробный режим: список сирот есть, удаления нет', async () => {
    const orphan = await upload('photo', JPEG, 'image/jpeg');
    age(orphan, 30 * DAY);
    const result = await sweepOrphanFiles(store, { now: sweepNow(), dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.deleted, 0);
    assert.ok(result.orphans >= 1);
    assert.equal(existsSync(fileOnDisk(orphan)), true);
    await sweepOrphanFiles(store, { now: sweepNow() });
    assert.equal(existsSync(fileOnDisk(orphan)), false);
  });
  await test('перед удалением ссылка перепроверяется: файл, который успели сохранить в профиль, остаётся', async () => {
    const orphan = await upload('photo', JPEG, 'image/jpeg');
    age(orphan, 30 * DAY);
    const { student } = await mkStudent();
    // Профиль сохранили уже после того, как набор ссылок собран: имитируем подменой списка
    const racing = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === 'students') {
          return new Proxy(target.students, {
            get(s, p, r) {
              if (p === 'list') {
                return async () => {
                  const rows = await s.list();
                  await s.update(student.id, { ...baseUpdate(), photoUrl: orphan });
                  return rows;
                };
              }
              return Reflect.get(s, p, r);
            },
          });
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as DataStore;
    const result = await sweepOrphanFiles(racing, { now: sweepNow() });
    assert.equal(existsSync(fileOnDisk(orphan)), true);
    assert.ok(result.skippedInUse >= 1);
  });
  await test('сводка запуска пишется в журнал без имён файлов-владельцев и ПДн', async () => {
    const orphan = await upload('photo', JPEG, 'image/jpeg');
    age(orphan, 30 * DAY);
    await sweepOrphanFiles(store, { now: sweepNow() });
    const row = (await store.audit.list(100)).find((e) => e.action === 'files.orphans.swept');
    assert.ok(row);
    assert.equal(row.actorLabel, 'SYSTEM');
    assert.equal(row.accountId, null);
    assert.equal(typeof (row.meta as Record<string, unknown>).deleted, 'number');
  });
  await test('выключатель ORPHAN_FILE_SWEEP=off: ночная уборка файлов ничего не делает', async () => {
    const orphan = await upload('photo', JPEG, 'image/jpeg');
    age(orphan, 30 * DAY);
    process.env.ORPHAN_FILE_SWEEP = 'off';
    try {
      const result = await sweepOrphanFiles(store, { now: sweepNow() });
      assert.equal(result.deleted, 0);
      assert.match(result.skipped ?? '', /выключ/);
    } finally {
      delete process.env.ORPHAN_FILE_SWEEP;
    }
    assert.equal(existsSync(fileOnDisk(orphan)), true);
    await sweepOrphanFiles(store, { now: sweepNow() });
  });

  // Тот же обход в S3: страницы по два ключа, дата из LastModified
  await test('S3: сирота удаляется, используемый, свежий и чужой префикс остаются (с пагинацией)', async () => {
    const s3 = new FakeS3();
    storageTestHooks.useS3(s3, 'test-bucket');
    try {
      const old = new Date(Date.now() - 30 * DAY);
      const used = `${randomUUID()}.jpg`;
      const orphanName = `${randomUUID()}.jpg`;
      const freshName = `${randomUUID()}.jpg`;
      const companyName = `${randomUUID()}.jpg`;
      s3.put(`photo/${used}`, JPEG, old);
      s3.put(`photo/${orphanName}`, JPEG, old);
      s3.put(`photo/${freshName}`, JPEG, new Date());
      s3.put(`company/${companyName}`, JPEG, old);
      for (let i = 0; i < 5; i++) s3.put(`resume/${randomUUID()}.pdf`, PDF, new Date());
      await mkStudent({ photoUrl: `/api/files/photo/${used}` });

      const result = await sweepOrphanFiles(store, { now: sweepNow() });
      assert.ok(s3.objects.has(`photo/${used}`), 'используемый удалён');
      assert.ok(!s3.objects.has(`photo/${orphanName}`), 'сирота осталась');
      assert.ok(s3.objects.has(`photo/${freshName}`));
      assert.ok(s3.objects.has(`company/${companyName}`));
      assert.equal(result.deleted, 1);
      assert.ok(s3.log.filter((l) => l.op === 'ListObjectsV2Command').length > 4, 'листинг шёл постранично');
      assert.ok(s3.log.every((l) => l.op !== 'DeleteObjectCommand' || l.key === `photo/${orphanName}`));
    } finally {
      storageTestHooks.reset();
      process.env.UPLOAD_DIR = root;
    }
  });

  // ---------- D. Видео по подписанной ссылке ----------
  console.log('Видео: подпись и проверка содержимого');
  const S3_ENV = {
    S3_ENDPOINT: 'https://storage.example.test',
    S3_BUCKET: 'pii-bucket',
    S3_ACCESS_KEY_ID: 'AKIATEST',
    S3_SECRET_ACCESS_KEY: 'secret-test',
  };
  async function withS3Env<T>(fn: () => Promise<T>): Promise<T> {
    const saved = Object.fromEntries(Object.keys(S3_ENV).map((k) => [k, process.env[k]]));
    Object.assign(process.env, S3_ENV);
    storageTestHooks.reset();
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      storageTestHooks.reset();
      process.env.UPLOAD_DIR = root;
    }
  }
  await test('подписанная ссылка привязана к размеру и типу: Content-Length и Content-Type в подписи', async () => {
    await withS3Env(async () => {
      const a = await presignUpload('studentVideo', 'video/mp4', 1_000_000);
      const b = await presignUpload('studentVideo', 'video/mp4', 2_000_000);
      assert.ok(a && b);
      const signed = (u: string) => new URL(u).searchParams.get('X-Amz-SignedHeaders')!.split(';');
      assert.ok(signed(a.uploadUrl).includes('content-length'), signed(a.uploadUrl).join(','));
      assert.ok(signed(a.uploadUrl).includes('content-type'));
      assert.notEqual(new URL(a.uploadUrl).searchParams.get('X-Amz-Signature'), new URL(b.uploadUrl).searchParams.get('X-Amz-Signature'));
      // Контрольная сумма пустого тела в ссылке сломала бы настоящую загрузку
      assert.equal([...new URL(a.uploadUrl).searchParams.keys()].some((k) => /checksum/i.test(k)), false);
      assert.match(a.url, /^\/api\/files\/studentVideo\/[0-9a-f-]{36}\.mp4$/);
    });
  });
  await test('ссылка не выдаётся на пустой файл и на файл больше лимита вида', async () => {
    await withS3Env(async () => {
      await assert.rejects(presignUpload('studentVideo', 'video/mp4', 0));
      await assert.rejects(presignUpload('studentVideo', 'video/mp4', 50 * 1024 * 1024 + 1));
      await assert.rejects(presignUpload('studentVideo', 'application/pdf', 1000));
      assert.ok(await presignUpload('studentVideo', 'video/webm', 50 * 1024 * 1024));
    });
  });

  const videoUrl = (kind: 'studentVideo' | 'companyVideo', ext = 'mp4') => `/api/files/${kind}/${randomUUID()}.${ext}`;
  const keyOf = (url: string) => url.replace('/api/files/', '');
  async function videoCheck(body: Buffer, url: string, claimedSize = body.length) {
    const s3 = new FakeS3();
    storageTestHooks.useS3(s3, 'test-bucket');
    s3.put(keyOf(url), body);
    // «Раздутый» объект: HEAD отдаёт заявленный размер, не выделяя гигабайты памяти
    if (claimedSize !== body.length) {
      const original = s3.send.bind(s3);
      s3.send = async (command) => {
        const result = await original(command);
        return command.constructor.name === 'HeadObjectCommand' ? { ...result, ContentLength: claimedSize } : result;
      };
    }
    try {
      await verifyUploadedVideo(url);
      return { s3, error: null as unknown };
    } catch (error) {
      return { s3, error };
    } finally {
      storageTestHooks.reset();
      process.env.UPLOAD_DIR = root;
    }
  }
  await test('видео: настоящий mp4 и webm проходят проверку; читается только начало файла', async () => {
    const mp4 = videoUrl('studentVideo');
    const ok = await videoCheck(MP4, mp4);
    assert.equal(ok.error, null);
    assert.ok(ok.s3.objects.has(keyOf(mp4)));
    const get = ok.s3.log.find((l) => l.op === 'GetObjectCommand');
    assert.match(get?.range ?? '', /^bytes=0-\d+$/, 'файл читается целиком, а не по Range');
    assert.ok(Number(get!.range!.split('-')[1]) <= 64 * 1024);

    const webm = videoUrl('studentVideo', 'webm');
    assert.equal((await videoCheck(WEBM, webm)).error, null);
  });
  await test('видео: под видом mp4 лежит HTML — отказ и объект удалён', async () => {
    const url = videoUrl('studentVideo');
    const { s3, error } = await videoCheck(Buffer.from('<html><script>alert(1)</script></html>' + ' '.repeat(100)), url);
    assert.ok(error, 'проверка пропустила HTML');
    assert.equal((error as { status?: number }).status, 400);
    assert.equal(s3.objects.has(keyOf(url)), false);
  });
  await test('видео: webm под именем mp4 и наоборот — отказ (тип по имени не совпал с содержимым)', async () => {
    const a = videoUrl('studentVideo', 'mp4');
    const r1 = await videoCheck(WEBM, a);
    assert.ok(r1.error);
    assert.equal(r1.s3.objects.has(keyOf(a)), false);
    const b = videoUrl('studentVideo', 'webm');
    const r2 = await videoCheck(MP4, b);
    assert.ok(r2.error);
    assert.equal(r2.s3.objects.has(keyOf(b)), false);
  });
  await test('видео: размер больше лимита вида — отказ и удаление, содержимое не читается', async () => {
    const url = videoUrl('studentVideo');
    const { s3, error } = await videoCheck(MP4, url, 50 * 1024 * 1024 + 1);
    assert.ok(error);
    assert.equal(s3.objects.has(keyOf(url)), false);
    assert.equal(s3.log.some((l) => l.op === 'GetObjectCommand'), false);
  });
  await test('видео: пустой объект — отказ; объекта нет — отказ без ошибки сервера', async () => {
    const url = videoUrl('studentVideo');
    const empty = await videoCheck(Buffer.alloc(0), url);
    assert.ok(empty.error);
    assert.equal(empty.s3.objects.has(keyOf(url)), false);

    const s3 = new FakeS3();
    storageTestHooks.useS3(s3, 'test-bucket');
    try {
      await assert.rejects(verifyUploadedVideo(videoUrl('studentVideo')), (e: { status?: number }) => e.status === 400);
    } finally {
      storageTestHooks.reset();
      process.env.UPLOAD_DIR = root;
    }
  });
  await test('видео: внешняя ссылка (YouTube) и чужой вид файла проверке не подлежат', async () => {
    await verifyUploadedVideo('https://youtu.be/abcdefghijk');
    await verifyUploadedVideo(null);
    await verifyUploadedVideo('/api/files/photo/00000000-0000-4000-8000-000000000000.jpg');
  });
  await test('видео на диске (разработка): те же правила — настоящее проходит, подделка удаляется', async () => {
    const good = await upload('studentVideo', MP4, 'video/mp4');
    await verifyUploadedVideo(good);
    assert.equal(existsSync(fileOnDisk(good)), true);

    const name = `${randomUUID()}.mp4`;
    mkdirSyncSafe(path.join(root, 'studentVideo'));
    writeFileSync(path.join(root, 'studentVideo', name), Buffer.from('MZ-not-a-video'.repeat(20)));
    await assert.rejects(verifyUploadedVideo(`/api/files/studentVideo/${name}`), (e: { status?: number }) => e.status === 400);
    assert.equal(existsSync(path.join(root, 'studentVideo', name)), false);
  });

  // ---------- E. Журнал чтения документов ----------
  console.log('Журнал чтения документов');
  const adminAccount = await store.accounts.createStaff(`staff-${unique()}@example.test`);
  const adminAccount2 = await store.accounts.createStaff(`staff-${unique()}@example.test`);
  await test('чтение студенческого файла администратором пишется: роль, accountId, вид, владелец, IP — без имён', async () => {
    const { student } = await mkStudent();
    const url = await upload('study', PDF, 'application/pdf');
    await store.students.setStudyDocument(student.id, { url, name: 'справка.pdf' });
    const name = path.basename(url);

    await auditFileRead({ session: sessionOf(adminAccount, 'Менеджер Мария'), service: false, kind: 'study', name, headers: HEAD });
    const rows = (await store.audit.list(200)).filter((e) => e.action === 'student.file.read' && e.entityId === `study/${name}`);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.actorLabel, `ADMIN:${adminAccount.id}`);
    assert.equal(row.accountId, adminAccount.id);
    assert.equal(row.ip, '203.0.113.9');
    assert.equal((row.meta as Record<string, unknown>).kind, 'study');
    assert.equal((row.meta as Record<string, unknown>).ownerStudentId, student.id);
    assert.equal((row.meta as Record<string, unknown>).via, 'admin');
    const dump = JSON.stringify(row);
    assert.ok(!/Секретов|Менеджер|Мария/.test(dump), 'в записи есть имя');
  });
  await test('служебное чтение CRM пишется как SERVICE', async () => {
    const { student } = await mkStudent();
    const url = await upload('photo', JPEG, 'image/jpeg');
    await store.students.update(student.id, { ...baseUpdate(), photoUrl: url });
    const name = path.basename(url);
    await auditFileRead({ session: null, service: true, kind: 'photo', name, headers: HEAD });
    const row = (await store.audit.list(200)).find((e) => e.action === 'student.file.read' && e.entityId === `photo/${name}`);
    assert.equal(row?.actorLabel, 'SERVICE');
    assert.equal((row?.meta as Record<string, unknown>).via, 'service');
    assert.equal((row?.meta as Record<string, unknown>).ownerStudentId, student.id);
  });
  await test('не чаще одной записи на (актор, файл) за 10 минут; другой актор и другой файл — отдельные записи', async () => {
    assert.equal(FILE_READ_DEDUPE_MS, 10 * 60_000);
    const name = `${randomUUID()}.pdf`;
    const other = `${randomUUID()}.pdf`;
    const t0 = new Date();
    const read = (session: SessionUser | null, service: boolean, file: string, at: Date) =>
      auditFileRead({ session, service, kind: 'resume', name: file, headers: HEAD, now: at });
    const count = async (file: string) =>
      (await store.audit.list(500)).filter((e) => e.action === 'student.file.read' && e.entityId === `resume/${file}`).length;

    const adminA = sessionOf(adminAccount, 'A');
    await read(adminA, false, name, t0);
    await read(adminA, false, name, new Date(t0.getTime() + 5 * 60_000));
    await read(adminA, false, name, new Date(t0.getTime() + 9 * 60_000));
    assert.equal(await count(name), 1);
    await read(adminA, false, other, new Date(t0.getTime() + 1000));
    assert.equal(await count(other), 1);
    await read(sessionOf(adminAccount2, 'B'), false, name, new Date(t0.getTime() + 2000));
    await read(null, true, name, new Date(t0.getTime() + 3000));
    assert.equal(await count(name), 3, 'другой администратор и служебный вызов — свои записи');
    await read(adminA, false, name, new Date(t0.getTime() + 11 * 60_000));
    assert.equal(await count(name), 4, 'через 10 минут запись пишется снова');
  });
  await test('своё чтение студентом, просмотр работодателем и файлы компании в журнал не попадают', async () => {
    const name = `${randomUUID()}.jpg`;
    const before = (await store.audit.list(1000)).length;
    await auditFileRead({ session: sessionOf({ id: randomUUID(), role: 'STUDENT' }, 'S'), service: false, kind: 'photo', name, headers: HEAD });
    await auditFileRead({ session: sessionOf({ id: randomUUID(), role: 'EMPLOYER' }, 'E'), service: false, kind: 'photo', name, headers: HEAD });
    await auditFileRead({ session: sessionOf(adminAccount, 'A'), service: false, kind: 'company', name, headers: HEAD });
    await auditFileRead({ session: null, service: true, kind: 'companyVideo', name, headers: HEAD });
    const rows = (await store.audit.list(1000)).filter((e) => e.action === 'student.file.read' && e.entityId?.endsWith(name));
    assert.equal(rows.length, 0);
    assert.ok((await store.audit.list(1000)).length >= before - 5);
  });

  function baseUpdate() {
    return {
      fullName: 'Секретов Иван Петрович',
      phone: '+79991112233',
      gender: 'MALE' as const,
      birthYear: 2003,
      birthDate: '2003-04-05',
      photoUrl: null,
      resumeUrl: null,
      resumeName: null,
      university: 'Тестовый вуз',
      institutionId: null,
      speciality: 'Тест',
      studyYear: 2,
      city: null,
      workDays: ['MON' as const],
      hoursPerWeek: 10,
      skills: [],
      about: null,
    };
  }
  function mkdirSyncSafe(dir: string) {
    mkdirSync(dir, { recursive: true });
  }
}
