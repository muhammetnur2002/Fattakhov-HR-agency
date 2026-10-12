import 'server-only';
import { getStore } from '@/lib/db';
import type { AgencyMessageAuthor, AgencyMessageRecord } from '@/lib/db/types';
import { decryptSafe } from '@/lib/security/crypto';
import { MESSAGE_MAX_LENGTH } from '@/lib/types';

/**
 * Переписка студента с агентством.
 *
 * Отдельная от переписки с работодателями (lib/chat.ts): та привязана к
 * отклику на вакансию, а здесь беседа одна на студента и вакансии не
 * требует. Сотрудники и владелец агентства пишут из карточки кандидата в
 * CRM, студент отвечает в разделе «Сообщения».
 *
 * Начинает беседу агентство. Пока оно не написало, студенту писать некуда:
 * «позвонить в никуда» незачем, а поток писем от незнакомых людей в чужую
 * компанию — спам.
 *
 * Работодатель сюда не попадает ни при каких условиях: беседа не связана
 * с откликом, а её чтение и запись защищены служебным токеном CRM
 * (для сотрудников) и сессией студента (для самого студента).
 */

export class AgencyChatError extends Error {}

export interface AgencyMessageDTO {
  id: string;
  author: AgencyMessageAuthor;
  /** Как показан автор из агентства; у студента null */
  staffName: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface AgencyThreadDTO {
  messages: AgencyMessageDTO[];
  /** Непрочитанное смотрящим: от агентства для студента, от студента для CRM */
  unread: number;
  /** Студент может отвечать, когда агентство уже написало */
  canWrite: boolean;
}

function toDTO(m: AgencyMessageRecord): AgencyMessageDTO {
  return {
    id: m.id,
    author: m.author,
    staffName: m.staffName,
    body: decryptSafe(m.bodyEnc, '[сообщение не читается]'),
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
  };
}

/** Текст сообщения: без пробелов по краям, не пустой и не длиннее предела. */
export function cleanBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new AgencyChatError('Сообщение пустое');
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new AgencyChatError(`Не длиннее ${MESSAGE_MAX_LENGTH} символов`);
  }
  return body;
}

/** Подпись сотрудника для студента: имя без лишнего, не длиннее разумного. */
export function cleanStaffName(raw: string | undefined | null): string {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return name || 'Агентство';
}

async function studentExists(studentId: string): Promise<boolean> {
  const store = await getStore();
  const student = await store.students.findById(studentId);
  if (!student) return false;
  const account = await store.accounts.findById(student.accountId);
  return Boolean(account && account.isActive);
}

/** Сколько непрочитанного от агентства у студента — для значка в навигации. */
export async function countAgencyUnreadForStudent(studentId: string): Promise<number> {
  return (await getStore()).agencyMessages.unreadFor(studentId, 'STUDENT');
}

/**
 * Беседа глазами студента. `markRead` — открытие страницы: сообщения агентства
 * становятся прочитанными, и значок гаснет.
 */
export async function getStudentThread(
  studentId: string,
  options: { markRead?: boolean } = {},
): Promise<AgencyThreadDTO> {
  const store = await getStore();
  const unread = await store.agencyMessages.unreadFor(studentId, 'STUDENT');
  if (options.markRead && unread > 0) await store.agencyMessages.markRead(studentId, 'STUDENT');
  const records = await store.agencyMessages.listByStudent(studentId);
  return {
    messages: records.map(toDTO),
    unread,
    canWrite: records.some((m) => m.author === 'AGENCY'),
  };
}

/** Студент отвечает агентству. Только в уже начатую агентством беседу. */
export async function postStudentMessage(studentId: string, rawBody: string): Promise<AgencyMessageDTO> {
  const body = cleanBody(rawBody);
  const store = await getStore();
  const records = await store.agencyMessages.listByStudent(studentId);
  if (!records.some((m) => m.author === 'AGENCY')) {
    throw new AgencyChatError('Агентство ещё не писало вам: ответить можно после его сообщения');
  }
  return toDTO(await store.agencyMessages.create({ studentId, author: 'STUDENT', body }));
}

/**
 * Беседа глазами CRM. Чтение отмечает сообщения студента прочитанными
 * сотрудниками: колокольчик в CRM не должен напоминать о том, что уже открыли.
 */
export async function getStaffThread(studentId: string): Promise<AgencyThreadDTO | null> {
  if (!(await studentExists(studentId))) return null;
  const store = await getStore();
  const unread = await store.agencyMessages.unreadFor(studentId, 'AGENCY');
  if (unread > 0) await store.agencyMessages.markRead(studentId, 'AGENCY');
  const records = await store.agencyMessages.listByStudent(studentId);
  return { messages: records.map(toDTO), unread, canWrite: true };
}

/** Сотрудник агентства пишет студенту (первое сообщение открывает беседу). */
export async function postStaffMessage(
  studentId: string,
  staffName: string | undefined | null,
  rawBody: string,
): Promise<AgencyMessageDTO | null> {
  const body = cleanBody(rawBody);
  if (!(await studentExists(studentId))) return null;
  const store = await getStore();
  return toDTO(
    await store.agencyMessages.create({ studentId, author: 'AGENCY', staffName: cleanStaffName(staffName), body }),
  );
}
