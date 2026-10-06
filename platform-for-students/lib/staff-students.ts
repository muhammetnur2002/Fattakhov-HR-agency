import 'server-only';
import { z } from 'zod';
import { getStore } from '@/lib/db';
import { studentAge } from '@/lib/db/mappers';
import type { StudentSearchFilter, StudentSearchRow } from '@/lib/db/types';
import { todayInMoscow } from '@/lib/age';
import { visibleLastSeen } from '@/lib/presence';
import { decryptSafe } from '@/lib/security/crypto';
import { clientIp } from '@/lib/security/rate-limit';
import type { Gender, LookingFor, StudentPortfolio, StudentStatus, StudyLevel, Weekday } from '@/lib/types';

/**
 * Поиск студентов для сотрудников агентства (раздел «Студенты» в CRM).
 *
 * ФИО, почта и телефон лежат зашифрованными, поэтому поиск устроен в два
 * шага: база отсеивает по открытым колонкам (вуз, специальность, курс, город,
 * пол, год рождения, статусы), а ФИО расшифровывается уже у ограниченного
 * набора, и по подстроке ищут в памяти. Если набор больше SEARCH_SCAN_LIMIT,
 * имя не ищем, а просим уточнить фильтры: расшифровывать всю базу ради одного
 * запроса нельзя.
 *
 * Контакты (почта, телефон) отсюда уходят только по явному запросу профиля
 * с contacts=1, и каждый такой запрос остаётся в журнале.
 */

/** Сколько анкет расшифровываем ради поиска по имени, навыкам и точному возрасту. */
export const SEARCH_SCAN_LIMIT = 2000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
/** «О себе» в списке — только начало: целиком оно в профиле. */
export const ABOUT_PREVIEW_LENGTH = 200;
/** Повторный просмотр той же анкеты тем же сотрудником в это окно в журнал не пишется. */
export const PROFILE_AUDIT_WINDOW_MS = 10 * 60_000;

export const STAFF_SORTS = ['new', 'seen', 'name', 'university'] as const;
export type StaffSort = (typeof STAFF_SORTS)[number];

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const text = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const int = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());

/** Параметры запроса списка. Всё необязательно; лишнего в запросе быть не должно — неизвестные поля игнорируются. */
export const staffSearchSchema = z
  .object({
    q: text(100),
    university: text(100),
    speciality: text(100),
    city: text(80),
    studyYear: int(1, 6),
    ageFrom: int(14, 99),
    ageTo: int(14, 99),
    gender: z.preprocess(emptyToUndefined, z.enum(['MALE', 'FEMALE', 'UNSPECIFIED']).optional()),
    skills: text(300),
    study: z.preprocess(emptyToUndefined, z.enum(['verified', 'pending', 'none']).optional()),
    status: z.preprocess(emptyToUndefined, z.enum(['active', 'paused', 'placed']).optional()),
    /** В сети за последние N минут */
    onlineWithin: int(1, 60 * 24 * 90),
    sort: z.preprocess(emptyToUndefined, z.enum(STAFF_SORTS).optional()),
    page: int(1, 100_000),
    // Больше максимума не ошибка, а предел: клиент мог не знать о нём
    pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  })
  .transform((v) => ({
    ...v,
    skills: (v.skills ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((s) => s.slice(0, 40)),
    sort: v.sort ?? ('new' as StaffSort),
    page: v.page ?? 1,
    pageSize: Math.min(v.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }));

export type StaffSearchQuery = z.output<typeof staffSearchSchema>;

export function parseStaffSearch(params: URLSearchParams): StaffSearchQuery {
  const query = staffSearchSchema.parse(Object.fromEntries(params));
  if (query.ageFrom !== undefined && query.ageTo !== undefined && query.ageFrom > query.ageTo) {
    throw new z.ZodError([{ code: 'custom', path: ['ageTo'], message: 'Возраст «до» меньше «от»' }]);
  }
  return query;
}

/** Строка списка: без почты, телефона, даты рождения, ссылок на фото и резюме. */
export interface StaffStudentListItem {
  id: string;
  fullName: string;
  age: number;
  gender: Gender;
  university: string;
  speciality: string;
  studyYear: number;
  studyLevel: StudyLevel | null;
  city: string | null;
  skills: string[];
  /** Начало «о себе», до ABOUT_PREVIEW_LENGTH символов */
  about: string | null;
  status: StudentStatus;
  studyVerified: boolean;
  /** Справка загружена и ждёт решения */
  studyPending: boolean;
  paused: boolean;
  placed: boolean;
  createdAt: string;
  /** null — не появлялся или скрыл показ: одно и то же для обоих случаев (lib/presence.ts) */
  lastSeenAt: string | null;
}

export interface StaffStudentSearchResult {
  items: StaffStudentListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Подсказка вместо результатов: набор слишком велик для поиска по имени */
  hint: string | null;
}

/** «ё» и «е» в поиске равны: так пишут и ищут. */
function fold(value: string): string {
  return value.toLowerCase().replaceAll('ё', 'е');
}

function truncate(value: string | null, length: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length <= length ? trimmed : `${trimmed.slice(0, length).trimEnd()}…`;
}

function toListItem(row: StudentSearchRow, fullName: string): StaffStudentListItem {
  return {
    id: row.id,
    fullName,
    age: studentAge(row),
    gender: row.gender,
    university: row.university,
    speciality: row.speciality,
    studyYear: row.studyYear,
    studyLevel: row.studyLevel,
    city: row.city,
    skills: row.skills,
    about: truncate(row.about, ABOUT_PREVIEW_LENGTH),
    status: row.status,
    studyVerified: row.studyVerified,
    studyPending: row.studyPending,
    paused: row.status === 'PAUSED',
    placed: row.status === 'PLACED',
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: visibleLastSeen({ lastSeenAt: row.lastSeenAt, showPresence: row.showPresence }, true)?.toISOString() ?? null,
  };
}

const STUDY_FILTER = { verified: 'VERIFIED', pending: 'PENDING', none: 'NONE' } as const;
const STATUS_FILTER = { active: 'ACTIVE', paused: 'PAUSED', placed: 'PLACED' } as const;

/**
 * Условия для базы. Возраст по году рождения грубый (±1 год): точный считается
 * по полной дате, а она зашифрована, — поэтому при возрасте точная проверка
 * идёт уже в памяти.
 */
function toFilter(query: StaffSearchQuery, now: Date): StudentSearchFilter {
  const year = todayInMoscow(now).year;
  return {
    university: query.university,
    speciality: query.speciality,
    city: query.city,
    studyYear: query.studyYear,
    gender: query.gender,
    birthYearTo: query.ageFrom !== undefined ? year - query.ageFrom : undefined,
    birthYearFrom: query.ageTo !== undefined ? year - query.ageTo - 1 : undefined,
    study: query.study ? STUDY_FILTER[query.study] : undefined,
    status: query.status ? STATUS_FILTER[query.status] : undefined,
    onlineSince: query.onlineWithin ? new Date(now.getTime() - query.onlineWithin * 60_000) : undefined,
  };
}

export async function searchStaffStudents(
  query: StaffSearchQuery,
  now: Date = new Date(),
  scanLimit: number = SEARCH_SCAN_LIMIT,
): Promise<StaffStudentSearchResult> {
  const store = await getStore();
  const filter = toFilter(query, now);
  const { page, pageSize } = query;
  const needsMemory = Boolean(query.q) || query.skills.length > 0 || query.ageFrom !== undefined || query.ageTo !== undefined;
  const sortNeedsMemory = query.sort === 'seen' || query.sort === 'name';

  // Путь 1: всё решает база, расшифровываются только строки текущей страницы
  const pageOrder = query.sort === 'university' ? 'university' : 'new';
  if (!needsMemory && !sortNeedsMemory) {
    const { rows, total } = await store.students.search(filter, {
      order: pageOrder,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: rows.map((row) => toListItem(row, decryptSafe(row.fullNameEnc, 'Без имени'))),
      total,
      page,
      pageSize,
      hint: null,
    };
  }

  // Путь 2: база отсеяла по открытым колонкам, дальше имя, навыки, возраст и сортировка — в памяти
  const scan = await store.students.search(filter, { order: 'new', skip: 0, take: scanLimit + 1 });
  if (scan.rows.length > scanLimit) {
    if (needsMemory) {
      return {
        items: [],
        total: scan.total,
        page,
        pageSize,
        hint: `Подходит больше ${scanLimit} анкет — уточните фильтры (вуз, специальность, курс, город): по имени, навыкам и возрасту ищем в ограниченной выборке.`,
      };
    }
    // Нужна была только сортировка по имени или входу — на большой выборке отдаём новых первыми
    const { rows, total } = await store.students.search(filter, { order: 'new', skip: (page - 1) * pageSize, take: pageSize });
    return {
      items: rows.map((row) => toListItem(row, decryptSafe(row.fullNameEnc, 'Без имени'))),
      total,
      page,
      pageSize,
      hint: `Анкет больше ${scanLimit}: сортировка по имени и по входу недоступна, показаны новые регистрации. Уточните фильтры.`,
    };
  }

  const tokens = fold(query.q ?? '').split(/\s+/).filter(Boolean);
  const skillTags = query.skills.map(fold);
  let candidates = scan.rows.map((row) => ({ row, fullName: decryptSafe(row.fullNameEnc, 'Без имени') }));

  if (tokens.length > 0) {
    candidates = candidates.filter(({ row, fullName }) => {
      const haystack = fold([fullName, row.university, row.speciality, row.city ?? '', ...row.skills].join(' '));
      return tokens.every((token) => haystack.includes(token));
    });
  }
  if (skillTags.length > 0) {
    candidates = candidates.filter(({ row }) => {
      const skills = row.skills.map(fold);
      return skillTags.every((tag) => skills.some((skill) => skill.includes(tag)));
    });
  }
  let items = candidates.map(({ row, fullName }) => toListItem(row, fullName));
  if (query.ageFrom !== undefined) items = items.filter((i) => i.age >= query.ageFrom!);
  if (query.ageTo !== undefined) items = items.filter((i) => i.age <= query.ageTo!);

  // ISO-даты и идентификаторы сравниваем побайтно: localeCompare тут ничего не добавляет
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byNew = (a: StaffStudentListItem, b: StaffStudentListItem) =>
    cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id);
  const byText = (a: string, b: string) => a.localeCompare(b, 'ru');
  if (query.sort === 'seen') {
    // Скрывшие показ уже с lastSeenAt = null: по порядку они не отличаются от тех, кто не заходил
    items.sort((a, b) => cmp(b.lastSeenAt ?? '', a.lastSeenAt ?? '') || byNew(a, b));
  } else if (query.sort === 'name') {
    items.sort((a, b) => byText(a.fullName, b.fullName) || byNew(a, b));
  } else if (query.sort === 'university') {
    items.sort((a, b) => byText(a.university, b.university) || byText(a.speciality, b.speciality) || byNew(a, b));
  } else {
    items.sort(byNew);
  }

  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    hint: null,
  };
}

/** Полный профиль студента для подбора. Контакты — только если они запрошены. */
export interface StaffStudentProfile extends StaffStudentListItem {
  /** «О себе» целиком */
  about: string | null;
  institutionId: string | null;
  workDays: Weekday[];
  hoursPerWeek: number | null;
  lookingFor: LookingFor[];
  goals: string | null;
  projects: StudentPortfolio['projects'];
  achievements: StudentPortfolio['achievements'];
  activities: StudentPortfolio['activities'];
  hobbies: string | null;
  links: StudentPortfolio['links'];
  videoUrl: string | null;
  /** Есть ли загруженные фото и резюме — сами файлы здесь не отдаются */
  hasPhoto: boolean;
  hasResume: boolean;
  resumeName: string | null;
  /** Заполнено только при contacts=1 */
  contacts: { email: string; phone: string | null } | null;
}

export async function getStaffStudentProfile(
  id: string,
  options: { contacts: boolean },
): Promise<StaffStudentProfile | null> {
  const store = await getStore();
  const student = await store.students.findById(id);
  if (!student) return null;
  const account = await store.accounts.findById(student.accountId);

  const row: StudentSearchRow = {
    id: student.id,
    fullNameEnc: student.fullNameEnc,
    gender: student.gender,
    birthYear: student.birthYear,
    birthDateEnc: student.birthDateEnc,
    university: student.university,
    speciality: student.speciality,
    studyYear: student.studyYear,
    studyLevel: student.studyLevel,
    city: student.city,
    skills: student.skills,
    about: student.about,
    status: student.status,
    studyVerified: student.studyVerified,
    studyPending: !student.studyVerified && student.studyDocUrl !== null,
    createdAt: student.createdAt,
    lastSeenAt: account?.lastSeenAt ?? null,
    showPresence: account?.showPresence ?? true,
  };
  const item = toListItem(row, decryptSafe(student.fullNameEnc, 'Без имени'));

  return {
    ...item,
    about: student.about?.trim() || null,
    institutionId: student.institutionId,
    workDays: student.workDays,
    hoursPerWeek: student.hoursPerWeek,
    lookingFor: student.lookingFor,
    goals: student.goals,
    projects: student.projects,
    achievements: student.achievements,
    activities: student.activities,
    hobbies: student.hobbies,
    links: student.links,
    videoUrl: student.videoUrl,
    hasPhoto: Boolean(student.photoUrl),
    hasResume: Boolean(student.resumeUrl),
    resumeName: student.resumeName,
    contacts: options.contacts
      ? { email: account ? decryptSafe(account.emailEnc) : '', phone: decryptSafe(student.phoneEnc, '') || null }
      : null,
  };
}

/** Идентификатор сотрудника из заголовка CRM: только он, без ФИО. */
export function parseCrmActor(request: Request): string | null {
  const raw = request.headers.get('x-crm-actor')?.trim() ?? '';
  return /^[\w-]{1,64}$/.test(raw) ? raw : null;
}

/**
 * Запись «сотрудник смотрел анкету студента». Не чаще одной на (сотрудник,
 * студент, вид просмотра) за PROFILE_AUDIT_WINDOW_MS.
 *
 * Ошибку записи не глушим, в отличие от прочих служебных записей: профиль
 * (особенно с контактами) без следа в журнале не отдаём.
 */
export async function auditStaffProfileRead(
  actor: string,
  studentId: string,
  options: { contacts: boolean },
  requestHeaders: Headers,
): Promise<void> {
  const store = await getStore();
  const actorLabel = `CRM:${actor}`;
  const action = options.contacts ? 'student.profile.read.contacts' : 'student.profile.read';
  if (await store.audit.recentExists({ actorLabel, action, entityId: studentId, withinMs: PROFILE_AUDIT_WINDOW_MS })) return;
  await store.audit.log({
    accountId: null,
    actorLabel,
    action,
    entity: 'Student',
    entityId: studentId,
    ip: clientIp(requestHeaders),
    userAgent: requestHeaders.get('user-agent'),
    meta: null,
  });
}
