import {
  AccessDeniedError,
  assertCanDo,
  canDo,
  effectiveGrants,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { addToVacancy } from "@/lib/services/applications";
import { studyLine } from "@/lib/study-level";
import {
  fetchAgencyChat,
  fetchPlatformStudent,
  sendAgencyChatMessage,
  StudentsServiceError,
  type AgencyChatThread,
  type PlatformStudentProfile,
} from "@/lib/students-service";

/**
 * Студенты студенческой платформы как кандидаты CRM.
 *
 * Порядок работы сотрудника: открыл анкету студента, отметил «Подходит»,
 * добавил выбранных в кандидаты, затем предлагает вакансию. Из платформы
 * переносится только то, что студент разрешил показывать при подборе: имя,
 * город, учёба, навыки, «о себе». Телефон и почта не копируются: связь идёт
 * через переписку на платформе, и контакты остаются под её защитой.
 *
 * Кандидат помечается источником «Студплатформа» и хранит идентификатор
 * студента: по нему студента нельзя добавить дважды и находится переписка.
 * Это не сорсинг-лид: данные пришли не от третьего лица, а от самого
 * студента, так что 14-дневного режима нет. Согласие на хранение в базе
 * агентства остаётся «ожидает» (consentStatus PENDING) до отдельного
 * согласия, как у любого кандидата без него.
 */

export class StudentCandidateError extends Error {}

/** Сколько студентов добавляем за раз: на каждого — запрос к платформе (лимит на сотрудника). */
export const MAX_STUDENTS_PER_BATCH = 20;

const STUDENT_ID = /^[\w-]{1,64}$/;

export type AddStudentsResult = {
  added: { studentId: string; candidateId: string; fullName: string }[];
  /** Уже были в кандидатах — ссылка на существующую карточку. */
  existing: { studentId: string; candidateId: string; fullName: string }[];
  failed: { studentId: string; reason: string }[];
};

/** Права: раздел «Студенты» и возможность вести воронку (добавлять в вакансии). */
export function assertCanPickStudents(actor: Actor): void {
  assertCanDo(actor, "students.enter");
  assertCanDo(actor, "application.create");
  if (!effectiveGrants(actor).includes("students.search")) {
    throw new AccessDeniedError("students.enter");
  }
}

/** Можно ли показывать сотруднику добавление студентов, предложение работы и чат. */
export function canPickStudents(actor: Actor): boolean {
  try {
    assertCanPickStudents(actor);
    return true;
  } catch (error) {
    if (error instanceof AccessDeniedError) return false;
    throw error;
  }
}

/** Учёба одной строкой для поля «образование» кандидата. */
export function educationLine(student: Pick<
  PlatformStudentProfile,
  "university" | "speciality" | "studyYear" | "studyLevel"
>): string | null {
  const line = [
    student.university,
    student.speciality,
    student.studyYear > 0 ? studyLine(student.studyLevel, student.studyYear) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return line || null;
}

/** Какие из студентов уже кандидаты: для отметки в списке студентов. */
export async function candidateIdsByStudent(
  actor: Actor,
  studentIds: string[],
): Promise<Record<string, string>> {
  assertCanPickStudents(actor);
  const ids = studentIds.filter((id) => STUDENT_ID.test(id));
  if (ids.length === 0) return {};
  const rows = await prisma.candidate.findMany({
    where: { organizationId: actor.organizationId, studentPlatformId: { in: ids } },
    select: { id: true, studentPlatformId: true },
  });
  return Object.fromEntries(rows.map((r) => [r.studentPlatformId as string, r.id]));
}

export async function addStudentsAsCandidates(
  actor: Actor,
  studentIds: string[],
): Promise<AddStudentsResult> {
  assertCanPickStudents(actor);

  const unique = [...new Set(studentIds)];
  if (unique.length === 0) throw new StudentCandidateError("Никто не выбран");
  if (unique.length > MAX_STUDENTS_PER_BATCH) {
    throw new StudentCandidateError(
      `За один раз можно добавить не больше ${MAX_STUDENTS_PER_BATCH} студентов`,
    );
  }

  const result: AddStudentsResult = { added: [], existing: [], failed: [] };

  for (const studentId of unique) {
    if (!STUDENT_ID.test(studentId)) {
      result.failed.push({ studentId, reason: "Студент не найден" });
      continue;
    }

    // Уже добавленного, в том числе удалённого, заново не создаём
    const known = await prismaRaw.candidate.findFirst({
      where: { organizationId: actor.organizationId, studentPlatformId: studentId },
      select: { id: true, fullName: true, deletedAt: true },
    });
    if (known?.deletedAt) {
      result.failed.push({ studentId, reason: "Этот студент ранее был удалён из кандидатов" });
      continue;
    }
    if (known) {
      result.existing.push({ studentId, candidateId: known.id, fullName: known.fullName });
      continue;
    }

    let profile: PlatformStudentProfile | null;
    try {
      profile = await fetchPlatformStudent(studentId, { actorId: actor.id });
    } catch (error) {
      if (!(error instanceof StudentsServiceError)) throw error;
      result.failed.push({ studentId, reason: error.message });
      continue;
    }
    if (!profile) {
      result.failed.push({ studentId, reason: "Студент не найден" });
      continue;
    }

    try {
      const candidate = await prisma.candidate.create({
        data: {
          organizationId: actor.organizationId,
          fullName: profile.fullName,
          city: profile.city,
          education: educationLine(profile),
          skills: profile.skills,
          summary: profile.about,
          source: "STUDENT_PLATFORM",
          sourceDetails: "Студенческая платформа",
          studentPlatformId: studentId,
          createdById: actor.id,
        },
        select: { id: true, fullName: true },
      });

      await prisma.activityLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          entityType: "Candidate",
          entityId: candidate.id,
          action: "created_from_student_platform",
          diff: { studentId },
        },
      });

      result.added.push({ studentId, candidateId: candidate.id, fullName: candidate.fullName });
    } catch (error) {
      // Второй сотрудник успел добавить того же студента между проверкой и вставкой
      if ((error as { code?: string }).code === "P2002") {
        const again = await prismaRaw.candidate.findFirst({
          where: { organizationId: actor.organizationId, studentPlatformId: studentId },
          select: { id: true, fullName: true },
        });
        if (again) {
          result.existing.push({ studentId, candidateId: again.id, fullName: again.fullName });
          continue;
        }
      }
      throw error;
    }
  }

  return result;
}

/**
 * Предложить студенту вакансию: кандидат встаёт в воронку на первый этап,
 * в журнале остаётся запись «предложена вакансия». Сообщение студенту
 * отправляет вызывающий (переписка живёт на платформе и может быть недоступна;
 * тогда предложение всё равно записано, а сотрудник видит предупреждение).
 */
export async function offerWorkToStudent(
  actor: Actor,
  candidateId: string,
  vacancyId: string,
  /** Текст студенту; пусто или не передан — предложение без сообщения. */
  message?: string | null,
): Promise<{
  applicationId: string;
  studentId: string;
  fullName: string;
  vacancyTitle: string;
  /** Сообщение ушло студенту. */
  messageSent: boolean;
  /** Почему сообщение не ушло (предложение при этом записано). */
  messageError?: string;
}> {
  assertCanPickStudents(actor);

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true, fullName: true, studentPlatformId: true },
  });
  if (!candidate) throw new StudentCandidateError("Кандидат не найден");
  if (!candidate.studentPlatformId) {
    throw new StudentCandidateError("Кандидат не из студенческой платформы");
  }

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, organizationId: actor.organizationId },
    select: { id: true, title: true },
  });
  if (!vacancy) throw new StudentCandidateError("Вакансия не найдена");

  const application = await addToVacancy(actor, vacancyId, candidateId);

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Candidate",
      entityId: candidateId,
      action: "student_offered_vacancy",
      diff: { vacancyId, applicationId: application.id },
    },
  });

  let messageSent = false;
  let messageError: string | undefined;
  if (message && message.trim()) {
    const sent = await sendChatToStudent(actor, candidateId, message);
    messageSent = sent.ok;
    messageError = sent.error;
  }

  return {
    applicationId: application.id,
    studentId: candidate.studentPlatformId,
    fullName: candidate.fullName,
    vacancyTitle: vacancy.title,
    messageSent,
    messageError,
  };
}

/** Подпись для студента: «Мария К.» из «Мария Каримова». Фамилию целиком студенту не показываем. */
export function shortStaffName(fullName: string): string {
  const [first, last] = fullName.trim().split(/\s+/);
  if (!first) return "Агентство";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/** Текст предложения по умолчанию: сотрудник правит его перед отправкой. */
export function defaultOfferText(studentName: string, vacancyTitle: string): string {
  const first = studentName.trim().split(/\s+/)[0] || "";
  return `${first ? `${first}, здравствуйте` : "Здравствуйте"}! Предлагаем вам вакансию «${vacancyTitle}». Откликнетесь?`;
}

export type StudentChat = {
  studentId: string;
  /** null — платформа не ответила; беседа при этом не теряется, а откроется позже. */
  thread: AgencyChatThread | null;
  error?: string;
};

async function studentCandidate(actor: Actor, candidateId: string) {
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true, fullName: true, studentPlatformId: true },
  });
  if (!candidate?.studentPlatformId) return null;
  return { ...candidate, studentPlatformId: candidate.studentPlatformId };
}

/**
 * Беседа со студентом для карточки кандидата. Открытие отмечает сообщения студента
 * прочитанными, поэтому вызывается только со страницы карточки. null — кандидат не
 * из студенческой платформы.
 */
export async function loadStudentChat(actor: Actor, candidateId: string): Promise<StudentChat | null> {
  assertCanPickStudents(actor);
  const candidate = await studentCandidate(actor, candidateId);
  if (!candidate) return null;
  try {
    const thread = await fetchAgencyChat(candidate.studentPlatformId, actor.id);
    return { studentId: candidate.studentPlatformId, thread };
  } catch (error) {
    if (!(error instanceof StudentsServiceError)) throw error;
    return { studentId: candidate.studentPlatformId, thread: null, error: error.message };
  }
}

/**
 * Сообщение студенту от сотрудника. Следы: запись в журнале карточки (кто писал,
 * без текста) и платформенный журнал; студент видит имя и первую букву фамилии.
 */
export async function sendChatToStudent(
  actor: Actor,
  candidateId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  assertCanPickStudents(actor);
  const candidate = await studentCandidate(actor, candidateId);
  if (!candidate) throw new StudentCandidateError("Кандидат не из студенческой платформы");

  const user = await prisma.user.findFirst({
    where: { id: actor.id },
    select: { fullName: true },
  });

  let result;
  try {
    result = await sendAgencyChatMessage({
      studentId: candidate.studentPlatformId,
      actorId: actor.id,
      staffName: shortStaffName(user?.fullName ?? ""),
      body,
    });
  } catch (error) {
    if (!(error instanceof StudentsServiceError)) throw error;
    return { ok: false, error: error.message };
  }
  if (result.error || !result.message) return { ok: false, error: result.error ?? "Сообщение не отправлено" };

  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Candidate",
      entityId: candidateId,
      action: "student_message_sent",
      // Текст переписки в журнал не копируем: он принадлежит беседе на платформе
      diff: { length: body.trim().length },
    },
  });
  return { ok: true };
}

/** Вакансии, куда можно предложить этого кандидата: запущенные и ещё без него. */
export async function listOfferableVacancies(
  actor: Actor,
  candidateId: string,
): Promise<{ id: string; label: string; title: string }[]> {
  if (!canDo(actor, "application.create")) return [];
  const vacancies = await prisma.vacancy.findMany({
    where: {
      organizationId: actor.organizationId,
      status: "ACTIVE",
      ...visibleVacanciesFilter(actor),
      applications: { none: { candidateId } },
      stages: { some: {} },
    },
    orderBy: { number: "desc" },
    take: 100,
    select: { id: true, number: true, title: true, client: { select: { name: true } } },
  });
  return vacancies.map((v) => ({
    id: v.id,
    label: `№${v.number} ${v.title} · ${v.client.name}`,
    title: v.title,
  }));
}
