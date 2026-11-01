import 'server-only';
import { getStore } from '@/lib/db';
import { studentName } from '@/lib/db/mappers';
import { visibleLastSeen } from '@/lib/presence';
import { decryptSafe } from '@/lib/security/crypto';
import { studentFacingVacancy } from '@/lib/vacancy';
import type { ApplicationRecord, MessageRecord } from '@/lib/db/types';
import { studyLine } from '@/lib/types';
import type {
  ApplicationStatus,
  MessageAuthor,
  MessageDTO,
  SessionUser,
  ThreadDTO,
  ThreadSummaryDTO,
} from '@/lib/types';

/**
 * Переписка студента и работодателя.
 *
 * Диалог привязан к отклику, а не к паре «человек — компания»: люди
 * обсуждают конкретную вакансию, и переписка по бариста не должна
 * смешиваться с перепиской по помощнику управляющего.
 *
 * HR-менеджер агентства в переписку не входит. Он видит, что диалог
 * идёт, и по каким откликам движение есть, но не содержание: посредник
 * между людьми — не основание читать их личную переписку.
 */

/** Кто смотрит. Роль решает и что он видит, и может ли писать. */
export interface Viewer {
  role: MessageAuthor;
  profileId: string;
}

/**
 * Участник переписки из сессии. null — значит смотрящий вообще не сторона
 * диалога: гость или HR-менеджер агентства.
 */
export function viewerFromSession(session: SessionUser | null): Viewer | null {
  if (!session || !session.profileId) return null;
  if (session.role !== 'STUDENT' && session.role !== 'EMPLOYER') return null;
  return { role: session.role, profileId: session.profileId };
}

/**
 * Можно ли писать прямо сейчас.
 *
 * После отправки отклика студент может начать разговор сам.
 * После отказа переписка со стороны студента остаётся только для чтения.
 */
function writePermission(
  status: ApplicationStatus,
  role: MessageAuthor,
): { canWrite: boolean; lockedReason: string | null } {
  if (role === 'EMPLOYER') return { canWrite: true, lockedReason: null };
  if (status === 'REJECTED') {
    return { canWrite: false, lockedReason: 'Работодатель закрыл отклик — переписка в архиве' };
  }
  return { canWrite: true, lockedReason: null };
}

function toMessageDTO(m: MessageRecord, viewer: MessageAuthor): MessageDTO {
  return {
    id: m.id,
    author: m.author,
    body: decryptSafe(m.bodyEnc, '[сообщение не читается]'),
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    mine: m.author === viewer,
  };
}

/** Строка предпросмотра в списке. Режем здесь, а не в вёрстке: незачем
 *  гонять в браузер килобайты ради одной строки. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat;
}

/**
 * Загружает ветку вместе с проверкой прав. null — либо нет такой ветки,
 * либо она чужая; наружу эти два случая не различаются намеренно.
 */
async function loadContext(applicationId: string, viewer: Viewer) {
  const store = await getStore();
  const application = await store.applications.findById(applicationId);
  if (!application) return null;

  const vacancy = await store.vacancies.findById(application.vacancyId);
  if (!vacancy) return null;

  if (viewer.role === 'STUDENT' && application.studentId !== viewer.profileId) return null;
  if (viewer.role === 'EMPLOYER' && vacancy.employerId !== viewer.profileId) return null;

  const [student, employer] = await Promise.all([
    store.students.findById(application.studentId),
    store.employers.findById(vacancy.employerId),
  ]);
  if (!student || !employer) return null;

  // Учётка собеседника — ради «в сети». Берём её здесь, а не в вёрстке:
  // сюда доходят только участники этого отклика (проверки выше), и
  // показать статус постороннему отсюда технически невозможно.
  const counterpartAccountId = viewer.role === 'STUDENT' ? employer.accountId : student.accountId;
  const counterpartAccount = await store.accounts.findById(counterpartAccountId);

  return { store, application, vacancy, student, employer, counterpartAccount };
}

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

function buildSummary(
  ctx: Context,
  viewer: Viewer,
  last: MessageRecord | undefined,
  unread: number,
): ThreadSummaryDTO {
  const { application, vacancy, student, employer } = ctx;
  const permission = writePermission(application.status, viewer.role);

  // Собеседник — всегда противоположная сторона: студент видит компанию,
  // компания видит человека
  const counterpart =
    viewer.role === 'STUDENT'
      ? { name: employer.companyName, photoUrl: employer.logoUrl, subtitle: employer.contactName }
      : {
          name: studentName(student),
          photoUrl: student.photoUrl,
          subtitle: [student.university, studyLine(student.studyLevel, student.studyYear)].filter(Boolean).join(', '),
        };

  return {
    applicationId: application.id,
    vacancyId: vacancy.id,
    // Студенту — одобренное название, пока правка компании на проверке
    vacancyTitle: viewer.role === 'STUDENT' ? studentFacingVacancy(vacancy, employer).title : vacancy.title,
    company: employer.companyName,
    counterpartName: counterpart.name,
    counterpartPhotoUrl: counterpart.photoUrl,
    counterpartSubtitle: counterpart.subtitle,
    // Право видеть статус здесь уже доказано: loadContext пускает дальше
    // только участников отклика. Скрыть статус собеседник не может —
    // сохранённое showPresence не читается (lib/presence.ts)
    counterpartLastSeen:
      visibleLastSeen({ lastSeenAt: ctx.counterpartAccount?.lastSeenAt ?? null }, true)?.toISOString() ?? null,
    status: application.status,
    lastMessageBody: last ? preview(decryptSafe(last.bodyEnc, '…')) : null,
    lastMessageAuthor: last?.author ?? null,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
    unread,
    canWrite: permission.canWrite,
    lockedReason: permission.lockedReason,
  };
}

async function applicationsFor(viewer: Viewer): Promise<ApplicationRecord[]> {
  const store = await getStore();
  if (viewer.role === 'STUDENT') return store.applications.listByStudent(viewer.profileId);
  const vacancies = await store.vacancies.listByEmployer(viewer.profileId);
  return store.applications.listByVacancyIds(vacancies.map((v) => v.id));
}

/**
 * Список диалогов. Свежие сверху; отклики без переписки тоже показаны —
 * иначе студент не поймёт, где ещё ждать ответа.
 */
export async function listThreads(viewer: Viewer): Promise<ThreadSummaryDTO[]> {
  const store = await getStore();
  const profile = viewer.role === 'STUDENT' ? await store.students.findById(viewer.profileId) : await store.employers.findById(viewer.profileId);
  const markers = profile ? await store.markers.list(profile.accountId) : {};
  const applications = await applicationsFor(viewer);
  if (applications.length === 0) return [];

  const ids = applications.map((a) => a.id);
  const [unread, lastByApp] = await Promise.all([
    store.messages.unreadFor(ids, viewer.role),
    store.messages.lastFor(ids),
  ]);

  const out: ThreadSummaryDTO[] = [];
  for (const application of applications) {
    const ctx = await loadContext(application.id, viewer);
    if (!ctx) continue;
    const last = lastByApp[application.id];
    const hiddenAt = markers[`chat:${application.id}`];
    if (hiddenAt && (!last || last.createdAt <= hiddenAt)) continue;
    const unreadCount = hiddenAt
      ? (await store.messages.listByApplication(application.id)).filter(m => m.author !== viewer.role && !m.readAt && m.createdAt > hiddenAt).length
      : unread[application.id] ?? 0;
    out.push(buildSummary(ctx, viewer, last, unreadCount));
  }

  return out.sort((a, b) => {
    const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bt - at;
  });
}

export async function getThread(applicationId: string, viewer: Viewer): Promise<ThreadDTO | null> {
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return null;

  const messages = await ctx.store.messages.listByApplication(applicationId);
  const unread = messages.filter((m) => m.author !== viewer.role && !m.readAt).length;
  const summary = buildSummary(ctx, viewer, messages[messages.length - 1], unread);

  return { ...summary, messages: messages.map((m) => toMessageDTO(m, viewer.role)) };
}

/** Hide only in the current participant's list. A subsequent message brings the thread back. */
export async function hideThread(applicationId: string, viewer: Viewer): Promise<boolean> {
  const hiddenAt = new Date();
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return false;
  const profile = viewer.role === 'STUDENT'
    ? await ctx.store.students.findById(viewer.profileId)
    : await ctx.store.employers.findById(viewer.profileId);
  if (!profile) return false;
  await ctx.store.markers.set(profile.accountId, `chat:${applicationId}`, hiddenAt);
  return true;
}

export class ThreadLockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ThreadLockedError';
  }
}

/** Противоположная сторона ветки — адресат уведомления о событии. */
function counterpartOf(ctx: Context, viewer: Viewer): Viewer {
  return viewer.role === 'STUDENT'
    ? { role: 'EMPLOYER', profileId: ctx.vacancy.employerId }
    : { role: 'STUDENT', profileId: ctx.application.studentId };
}

export interface PostResult {
  message: MessageDTO;
  /** Кого разбудить живым обновлением */
  recipient: Viewer;
}

export async function postMessage(
  applicationId: string,
  viewer: Viewer,
  body: string,
): Promise<PostResult | null> {
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return null;

  const permission = writePermission(ctx.application.status, viewer.role);
  // Право писать проверяется здесь, а не только кнопкой в интерфейсе:
  // заблокированную кнопку обходит любой, кто откроет консоль
  if (!permission.canWrite) {
    throw new ThreadLockedError(permission.lockedReason ?? 'Переписка закрыта');
  }

  const record = await ctx.store.messages.create({ applicationId, author: viewer.role, body });

  // Первое сообщение работодателя двигает отклик из «нового»: он уже не
  // новый, раз с человеком заговорили
  if (viewer.role === 'EMPLOYER' && ctx.application.status === 'NEW') {
    await ctx.store.applications.markViewed(applicationId);
  }

  return { message: toMessageDTO(record, viewer.role), recipient: counterpartOf(ctx, viewer) };
}

export interface ReadResult {
  count: number;
  /** Автор прочитанных сообщений — ему и показываем «прочитано» */
  recipient: Viewer;
}

export async function markThreadRead(
  applicationId: string,
  viewer: Viewer,
): Promise<ReadResult | null> {
  const ctx = await loadContext(applicationId, viewer);
  if (!ctx) return null;
  const count = await ctx.store.messages.markRead(applicationId, viewer.role);
  return { count, recipient: counterpartOf(ctx, viewer) };
}

/** Счётчик для значка в навигации. */
export async function countUnread(viewer: Viewer): Promise<number> {
  const store = await getStore();
  // Студенту к непрочитанному по откликам добавляется переписка с агентством
  const agency = viewer.role === 'STUDENT' ? await store.agencyMessages.unreadFor(viewer.profileId, 'STUDENT') : 0;
  return agency + (await listThreads(viewer)).reduce((sum, thread) => sum + thread.unread, 0);
}
