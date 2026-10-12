/**
 * Студенты платформы как кандидаты CRM: добавление выбранных без контактов,
 * метка источника, защита от повторов, «Предложить работу» (воронка + сообщение
 * студенту), переписка из карточки, получатели ответа студента.
 *
 * Платформу студентов подменяем: проверяем наше поведение, а не её.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const platform = vi.hoisted(() => ({
  fetchPlatformStudent: vi.fn(),
  fetchAgencyChat: vi.fn(),
  sendAgencyChatMessage: vi.fn(),
}));
vi.mock("@/lib/students-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/students-service")>()),
  fetchPlatformStudent: platform.fetchPlatformStudent,
  fetchAgencyChat: platform.fetchAgencyChat,
  sendAgencyChatMessage: platform.sendAgencyChatMessage,
}));

import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { ApplicationError } from "@/lib/services/applications";
import { studentReplyRecipients } from "@/lib/notifications/recipients";
import {
  addStudentsAsCandidates,
  candidateIdsByStudent,
  canPickStudents,
  defaultOfferText,
  educationLine,
  listOfferableVacancies,
  loadStudentChat,
  MAX_STUDENTS_PER_BATCH,
  offerWorkToStudent,
  sendChatToStudent,
  shortStaffName,
  StudentCandidateError,
} from "@/lib/services/student-candidates";
import { createPipelineStages } from "@/lib/services/vacancies";
import { StudentsServiceError, type PlatformStudentProfile } from "@/lib/students-service";

const ORG = "org_fattakhov";
const MARK = "test_stud_";
const NUMBER = 93000 + Math.floor(Math.random() * 900);

const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null, grants: [] };
const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
  grants: ["students.search"],
};
const recruiterNoGrant: Actor = { ...recruiter, grants: [] };
const account: Actor = { id: "usr_account", organizationId: ORG, role: "ACCOUNT", clientId: null, grants: ["students.search"] };
const client: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark", grants: [] };

let vacancyId = "";
let secondVacancyId = "";

function profile(id: string, patch: Partial<PlatformStudentProfile> = {}): PlatformStudentProfile {
  return {
    id,
    fullName: `${MARK}Эльвира Гараева`,
    age: 19,
    gender: "FEMALE",
    university: "КНИТУ",
    speciality: "Менеджмент",
    studyYear: 2,
    studyLevel: "BACHELOR",
    city: "Казань",
    skills: ["Excel", "переговоры"],
    about: "Веду студенческий клуб",
    status: "ACTIVE",
    studyVerified: true,
    studyPending: false,
    paused: false,
    placed: false,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    institutionId: null,
    workDays: [],
    hoursPerWeek: null,
    lookingFor: [],
    goals: null,
    projects: [],
    achievements: [],
    activities: [],
    hobbies: null,
    links: [],
    videoUrl: null,
    hasPhoto: false,
    hasResume: false,
    resumeName: null,
    contacts: { email: "secret@example.com", phone: "+79990000000" },
    ...patch,
  };
}

async function cleanup() {
  const vacancies = await db.vacancy.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } });
  const vids = vacancies.map((v) => v.id);
  const candidates = await db.candidate.findMany({
    where: { OR: [{ studentPlatformId: { startsWith: MARK } }, { fullName: { startsWith: MARK } }] },
    select: { id: true },
  });
  const cids = candidates.map((c) => c.id);
  const apps = await db.application.findMany({
    where: { OR: [{ vacancyId: { in: vids } }, { candidateId: { in: cids } }] },
    select: { id: true },
  });
  const aids = apps.map((a) => a.id);
  await db.stageTransition.deleteMany({ where: { applicationId: { in: aids } } });
  await db.application.deleteMany({ where: { id: { in: aids } } });
  await db.activityLog.deleteMany({ where: { entityType: "Candidate", entityId: { in: cids } } });
  await db.pipelineStage.deleteMany({ where: { vacancyId: { in: vids } } });
  await db.vacancy.deleteMany({ where: { id: { in: vids } } });
  await db.candidate.deleteMany({ where: { id: { in: cids } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

beforeEach(async () => {
  await cleanup();
  platform.fetchPlatformStudent.mockReset();
  platform.fetchAgencyChat.mockReset();
  platform.sendAgencyChatMessage.mockReset();
  platform.fetchPlatformStudent.mockImplementation(async (id: string) => profile(id));
  platform.sendAgencyChatMessage.mockImplementation(async () => ({
    message: { id: "m1", author: "AGENCY", staffName: "Алина Г.", body: "x", createdAt: new Date().toISOString(), readAt: null },
  }));

  const make = async (suffix: string, number: number) => {
    const vacancy = await db.vacancy.create({
      data: {
        organizationId: ORG,
        clientId: "cl_technopark",
        number,
        title: `${MARK}вакансия ${suffix}`,
        status: "ACTIVE",
        createdById: "usr_owner",
      },
      select: { id: true },
    });
    await createPipelineStages(vacancy.id);
    return vacancy.id;
  };
  vacancyId = await make("A", NUMBER);
  secondVacancyId = await make("B", NUMBER + 1);
});

describe("права", () => {
  it("раздел открыт владельцу и тем, у кого есть доступ к студентам и воронка", () => {
    expect(canPickStudents(owner)).toBe(true);
    expect(canPickStudents(recruiter)).toBe(true);
  });

  it("не открыт без доступа к студентам, менеджеру без воронки и клиенту", async () => {
    expect(canPickStudents(recruiterNoGrant)).toBe(false);
    expect(canPickStudents(account)).toBe(false);
    expect(canPickStudents(client)).toBe(false);
    await expect(addStudentsAsCandidates(recruiterNoGrant, [`${MARK}1`])).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(addStudentsAsCandidates(client, [`${MARK}1`])).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(loadStudentChat(account, "x")).rejects.toBeInstanceOf(AccessDeniedError);
    expect(platform.fetchPlatformStudent).not.toHaveBeenCalled();
  });
});

describe("добавление студентов в кандидаты", () => {
  it("создаёт кандидата с меткой источника и без телефона и почты", async () => {
    const result = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    expect(result.added).toHaveLength(1);
    expect(result.existing).toHaveLength(0);
    expect(result.failed).toHaveLength(0);

    const candidate = await db.candidate.findFirstOrThrow({ where: { studentPlatformId: `${MARK}s1` } });
    expect(candidate.source).toBe("STUDENT_PLATFORM");
    expect(candidate.fullName).toBe(`${MARK}Эльвира Гараева`);
    expect(candidate.city).toBe("Казань");
    expect(candidate.skills).toEqual(["Excel", "переговоры"]);
    expect(candidate.summary).toBe("Веду студенческий клуб");
    expect(candidate.education).toContain("КНИТУ");
    expect(candidate.education).toContain("Менеджмент");
    // контакты платформа отдаёт только по явному запросу, а мы его не делаем
    expect(candidate.phone).toBeNull();
    expect(candidate.email).toBeNull();
    // данные пришли от самого студента: это не сорсинг-лид с 14-дневным сроком
    expect(candidate.sourcedAt).toBeNull();
    expect(candidate.consentStatus).toBe("PENDING");
    expect(candidate.createdById).toBe(recruiter.id);

    // запрос на профиль — без contacts
    expect(platform.fetchPlatformStudent).toHaveBeenCalledWith(`${MARK}s1`, { actorId: recruiter.id });
  });

  it("пишет в журнал карточки, кто и откуда добавил", async () => {
    await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    const candidate = await db.candidate.findFirstOrThrow({ where: { studentPlatformId: `${MARK}s1` } });
    const log = await db.activityLog.findMany({
      where: { entityType: "Candidate", entityId: candidate.id, action: "created_from_student_platform" },
    });
    expect(log).toHaveLength(1);
    expect(log[0].actorId).toBe(recruiter.id);
  });

  it("повторно того же студента не добавляет и ведёт к существующей карточке", async () => {
    const first = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    const second = await addStudentsAsCandidates(owner, [`${MARK}s1`]);
    expect(second.added).toHaveLength(0);
    expect(second.existing).toEqual([
      { studentId: `${MARK}s1`, candidateId: first.added[0].candidateId, fullName: `${MARK}Эльвира Гараева` },
    ]);
    expect(await db.candidate.count({ where: { studentPlatformId: `${MARK}s1` } })).toBe(1);
  });

  it("одинаковые идентификаторы в одном запросе считаются один раз", async () => {
    const result = await addStudentsAsCandidates(recruiter, [`${MARK}s1`, `${MARK}s1`]);
    expect(result.added).toHaveLength(1);
    expect(platform.fetchPlatformStudent).toHaveBeenCalledTimes(1);
  });

  it("студент, которого нет или платформа не ответила, попадает в список неудач, остальные добавляются", async () => {
    platform.fetchPlatformStudent.mockImplementation(async (id: string) => {
      if (id === `${MARK}gone`) return null;
      if (id === `${MARK}down`) throw new StudentsServiceError("Студенческая платформа не отвечает.");
      return profile(id, { fullName: `${MARK}Артур Хасанов` });
    });
    const result = await addStudentsAsCandidates(recruiter, [`${MARK}gone`, `${MARK}down`, `${MARK}ok`]);
    expect(result.added.map((a) => a.studentId)).toEqual([`${MARK}ok`]);
    expect(result.failed).toEqual([
      { studentId: `${MARK}gone`, reason: "Студент не найден" },
      { studentId: `${MARK}down`, reason: "Студенческая платформа не отвечает." },
    ]);
  });

  it("удалённого из кандидатов студента заново не создаёт", async () => {
    const first = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    await db.candidate.update({ where: { id: first.added[0].candidateId }, data: { deletedAt: new Date() } });
    const again = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    expect(again.added).toHaveLength(0);
    expect(again.failed[0].reason).toMatch(/удал/);
  });

  it("пустой выбор, чужой формат идентификатора и слишком большая пачка", async () => {
    await expect(addStudentsAsCandidates(recruiter, [])).rejects.toBeInstanceOf(StudentCandidateError);
    const bad = await addStudentsAsCandidates(recruiter, ["../../etc/passwd"]);
    expect(bad.failed).toHaveLength(1);
    expect(platform.fetchPlatformStudent).not.toHaveBeenCalled();
    const many = Array.from({ length: MAX_STUDENTS_PER_BATCH + 1 }, (_, i) => `${MARK}n${i}`);
    await expect(addStudentsAsCandidates(recruiter, many)).rejects.toBeInstanceOf(StudentCandidateError);
  });

  it("находит уже добавленных для отметки в списке студентов", async () => {
    const added = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    const map = await candidateIdsByStudent(recruiter, [`${MARK}s1`, `${MARK}s2`, "../bad"]);
    expect(map).toEqual({ [`${MARK}s1`]: added.added[0].candidateId });
  });

  it("учёба одной строкой", () => {
    expect(educationLine({ university: "КФУ", speciality: "ИТ", studyYear: 0, studyLevel: null })).toBe("КФУ · ИТ");
    expect(educationLine({ university: "", speciality: "", studyYear: 0, studyLevel: null })).toBeNull();
  });
});

describe("предложить работу", () => {
  async function addStudent(id = `${MARK}s1`) {
    const result = await addStudentsAsCandidates(recruiter, [id]);
    return result.added[0].candidateId;
  }

  it("ставит кандидата на первый этап воронки, пишет в журнал и отправляет сообщение", async () => {
    const candidateId = await addStudent();
    const result = await offerWorkToStudent(recruiter, candidateId, vacancyId, "Предлагаем вакансию");

    expect(result.messageSent).toBe(true);
    expect(result.studentId).toBe(`${MARK}s1`);
    const application = await db.application.findFirstOrThrow({
      where: { candidateId, vacancyId },
      include: { stage: true },
    });
    const first = await db.pipelineStage.findFirstOrThrow({ where: { vacancyId }, orderBy: { order: "asc" } });
    expect(application.stageId).toBe(first.id);
    expect(application.ownerId).toBe(recruiter.id);

    const log = await db.activityLog.findMany({
      where: { entityType: "Candidate", entityId: candidateId, action: "student_offered_vacancy" },
    });
    expect(log).toHaveLength(1);

    expect(platform.sendAgencyChatMessage).toHaveBeenCalledTimes(1);
    const call = platform.sendAgencyChatMessage.mock.calls[0][0];
    expect(call.studentId).toBe(`${MARK}s1`);
    expect(call.actorId).toBe(recruiter.id);
    expect(call.body).toBe("Предлагаем вакансию");
  });

  it("без текста сообщение не отправляется, кандидат всё равно в воронке", async () => {
    const candidateId = await addStudent();
    const result = await offerWorkToStudent(recruiter, candidateId, vacancyId, "   ");
    expect(result.messageSent).toBe(false);
    expect(platform.sendAgencyChatMessage).not.toHaveBeenCalled();
    expect(await db.application.count({ where: { candidateId, vacancyId } })).toBe(1);
  });

  it("платформа не приняла сообщение: предложение записано, причина возвращена", async () => {
    const candidateId = await addStudent();
    platform.sendAgencyChatMessage.mockResolvedValue({ error: "Студент не найден" });
    const result = await offerWorkToStudent(recruiter, candidateId, vacancyId, "Привет");
    expect(result.messageSent).toBe(false);
    expect(result.messageError).toBe("Студент не найден");
    expect(await db.application.count({ where: { candidateId, vacancyId } })).toBe(1);
    // журнал отправленных сообщений не пополняется
    expect(await db.activityLog.count({ where: { entityId: candidateId, action: "student_message_sent" } })).toBe(0);
  });

  it("платформа недоступна: то же самое, без падения", async () => {
    const candidateId = await addStudent();
    platform.sendAgencyChatMessage.mockRejectedValue(new StudentsServiceError("Студенческая платформа не отвечает."));
    const result = await offerWorkToStudent(recruiter, candidateId, vacancyId, "Привет");
    expect(result.messageSent).toBe(false);
    expect(result.messageError).toMatch(/не отвечает/);
    expect(await db.application.count({ where: { candidateId, vacancyId } })).toBe(1);
  });

  it("в ту же вакансию дважды нельзя; кандидат не из студплатформы и чужая вакансия отклоняются", async () => {
    const candidateId = await addStudent();
    await offerWorkToStudent(recruiter, candidateId, vacancyId, "");
    await expect(offerWorkToStudent(recruiter, candidateId, vacancyId, "")).rejects.toBeInstanceOf(ApplicationError);
    await expect(offerWorkToStudent(recruiter, candidateId, "no-such", "")).rejects.toBeInstanceOf(StudentCandidateError);

    const plain = await db.candidate.create({
      data: { organizationId: ORG, fullName: `${MARK}Обычный`, createdById: "usr_owner" },
      select: { id: true },
    });
    await expect(offerWorkToStudent(recruiter, plain.id, vacancyId, "")).rejects.toBeInstanceOf(StudentCandidateError);
  });

  it("без права вести воронку предложение недоступно", async () => {
    const candidateId = await addStudent();
    await expect(offerWorkToStudent(account, candidateId, vacancyId, "")).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(offerWorkToStudent(client, candidateId, vacancyId, "")).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("в списке вакансий для предложения нет тех, где кандидат уже стоит", async () => {
    const candidateId = await addStudent();
    const before = (await listOfferableVacancies(recruiter, candidateId)).map((v) => v.id);
    expect(before).toContain(vacancyId);
    expect(before).toContain(secondVacancyId);

    await offerWorkToStudent(recruiter, candidateId, vacancyId, "");
    const after = (await listOfferableVacancies(recruiter, candidateId)).map((v) => v.id);
    expect(after).not.toContain(vacancyId);
    expect(after).toContain(secondVacancyId);

    expect(await listOfferableVacancies(client, candidateId)).toEqual([]);
  });

  it("подпись для студента — имя и первая буква фамилии, текст по умолчанию называет вакансию", () => {
    expect(shortStaffName("Мария Каримова")).toBe("Мария К.");
    expect(shortStaffName("Мария")).toBe("Мария");
    expect(shortStaffName("   ")).toBe("Агентство");
    const text = defaultOfferText("Эльвира Гараева", "Менеджер по продажам");
    expect(text).toContain("Эльвира");
    expect(text).toContain("«Менеджер по продажам»");
    expect(text).not.toContain("Гараева");
  });
});

describe("переписка из карточки", () => {
  async function addStudent() {
    const result = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    return result.added[0].candidateId;
  }

  it("открывает беседу студента этого кандидата", async () => {
    const candidateId = await addStudent();
    const thread = { messages: [{ id: "1", author: "STUDENT", staffName: null, body: "Здравствуйте", createdAt: "2026-10-11T10:00:00Z", readAt: null }], unread: 1 };
    platform.fetchAgencyChat.mockResolvedValue(thread);

    const chat = await loadStudentChat(recruiter, candidateId);
    expect(chat?.studentId).toBe(`${MARK}s1`);
    expect(chat?.thread).toEqual(thread);
    expect(platform.fetchAgencyChat).toHaveBeenCalledWith(`${MARK}s1`, recruiter.id);
  });

  it("платформа не ответила: ошибка в результате, а не падение страницы", async () => {
    const candidateId = await addStudent();
    platform.fetchAgencyChat.mockRejectedValue(new StudentsServiceError("Студенческая платформа не отвечает."));
    const chat = await loadStudentChat(recruiter, candidateId);
    expect(chat?.thread).toBeNull();
    expect(chat?.error).toMatch(/не отвечает/);
  });

  it("обычный кандидат переписки не имеет", async () => {
    const plain = await db.candidate.create({
      data: { organizationId: ORG, fullName: `${MARK}Обычный`, createdById: "usr_owner" },
      select: { id: true },
    });
    expect(await loadStudentChat(recruiter, plain.id)).toBeNull();
    await expect(sendChatToStudent(recruiter, plain.id, "Привет")).rejects.toBeInstanceOf(StudentCandidateError);
    expect(platform.fetchAgencyChat).not.toHaveBeenCalled();
  });

  it("сообщение уходит с короткой подписью; в журнал попадает длина, а не текст", async () => {
    const candidateId = await addStudent();
    const result = await sendChatToStudent(recruiter, candidateId, "  Здравствуйте!  ");
    expect(result).toEqual({ ok: true });

    const call = platform.sendAgencyChatMessage.mock.calls[0][0];
    expect(call.body).toBe("  Здравствуйте!  ");
    expect(call.staffName).toMatch(/^\S+ \S\.$|^\S+$/);
    expect(call.staffName).not.toContain("undefined");

    const log = await db.activityLog.findMany({
      where: { entityType: "Candidate", entityId: candidateId, action: "student_message_sent" },
    });
    expect(log).toHaveLength(1);
    expect(log[0].actorId).toBe(recruiter.id);
    expect(JSON.stringify(log[0].diff)).not.toContain("Здравствуйте");
    expect(log[0].diff).toEqual({ length: "Здравствуйте!".length });
  });

  it("отказ платформы возвращается как ошибка и в журнал не пишется", async () => {
    const candidateId = await addStudent();
    platform.sendAgencyChatMessage.mockResolvedValue({ error: "Не длиннее 2000 символов" });
    expect(await sendChatToStudent(recruiter, candidateId, "x")).toEqual({ ok: false, error: "Не длиннее 2000 символов" });
    expect(await db.activityLog.count({ where: { entityId: candidateId, action: "student_message_sent" } })).toBe(0);
  });
});

describe("кому сообщить об ответе студента", () => {
  it("тем, кто завёл кандидата, ведёт его воронки и писал ему", async () => {
    const added = await addStudentsAsCandidates(recruiter, [`${MARK}s1`]);
    const candidateId = added.added[0].candidateId;

    // воронку ведёт руководитель подбора, студенту писал владелец
    const head: Actor = { id: "usr_head", organizationId: ORG, role: "HEAD", clientId: null, grants: ["students.search"] };
    await offerWorkToStudent(head, candidateId, vacancyId, "");
    await sendChatToStudent(owner, candidateId, "Привет");

    const target = await studentReplyRecipients(ORG, `${MARK}s1`);
    expect(target?.candidateId).toBe(candidateId);
    expect(new Set(target?.userIds)).toEqual(new Set([recruiter.id, head.id, owner.id]));
  });

  it("студента нет среди кандидатов — получателей нет", async () => {
    expect(await studentReplyRecipients(ORG, `${MARK}unknown`)).toBeNull();
  });

  it("никого из причастных не осталось — владелец и руководитель, а не пустой список", async () => {
    // Общих пользователей из seed не трогаем: параллельные тесты опираются на их вход
    const gone = await db.user.create({
      data: {
        id: `${MARK}gone`,
        organizationId: ORG,
        email: `${MARK}gone@example.test`,
        fullName: `${MARK}Уволенный`,
        role: "RECRUITER",
        isActive: false,
      },
      select: { id: true },
    });
    try {
      const candidate = await db.candidate.create({
        data: {
          organizationId: ORG,
          fullName: `${MARK}Кандидат уволенного`,
          source: "STUDENT_PLATFORM",
          studentPlatformId: `${MARK}s9`,
          createdById: gone.id,
        },
        select: { id: true },
      });
      const target = await studentReplyRecipients(ORG, `${MARK}s9`);
      expect(target?.candidateId).toBe(candidate.id);
      expect(target?.userIds.length).toBeGreaterThan(0);
      expect(target?.userIds).not.toContain(gone.id);
      expect(target?.userIds).toContain(owner.id);
    } finally {
      await db.candidate.deleteMany({ where: { studentPlatformId: `${MARK}s9` } });
      await db.user.delete({ where: { id: gone.id } });
    }
  });
});
