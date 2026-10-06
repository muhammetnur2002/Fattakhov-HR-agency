/**
 * Журнал чтения документов студентов сотрудниками через CRM (152-ФЗ, BR-36).
 *
 * Прокси файлов отдаёт справку и фото студента сотруднику с правом «студенты»;
 * без записи в журнал такое чтение не оставляло следа. Здесь проверяется сама
 * запись: что в ней есть, чего нет (ФИО, содержимое), не чаще раза в 10 минут
 * на пару «пользователь — файл» и что сбой журнала не роняет выдачу файла.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { listAccessLog } from "@/lib/services/pdn-retention";
import {
  recordStudentFileRead,
  resetStudentFileAuditThrottle,
  STUDENT_FILE_THROTTLE_MS,
} from "@/lib/services/student-file-audit";

const ORG = "org_fattakhov";
const FILE = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_FILE = "123e4567-e89b-12d3-a456-426614174001";
const TARGET_PREFIX = "student-";

const owner = { id: "usr_owner", organizationId: ORG, role: "OWNER" as const, clientId: null };

async function entries(where: object = {}) {
  return db.personalDataAccessLog.findMany({
    where: { organizationId: ORG, candidateId: { startsWith: TARGET_PREFIX }, ...where },
    orderBy: { createdAt: "asc" },
  });
}

async function cleanup() {
  await db.personalDataAccessLog.deleteMany({ where: { candidateId: { startsWith: TARGET_PREFIX } } });
}

function headers(ip = "203.0.113.9") {
  return new Headers({ "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 test" });
}

beforeEach(async () => {
  resetStudentFileAuditThrottle();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("журнал чтения документов студентов", () => {
  it("пишет, кто, что и откуда открыл, без имени и содержимого", async () => {
    await recordStudentFileRead(owner, { kind: "study", objectId: FILE }, headers());

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: ORG,
      actorId: owner.id,
      action: "student_study_view",
      candidateId: `student-file:${FILE}`,
      ip: "203.0.113.9",
    });
  });

  it("отличает справку, фото, фото и резюме откликнувшегося", async () => {
    await recordStudentFileRead(owner, { kind: "photo", objectId: FILE }, headers());
    await recordStudentFileRead(owner, { kind: "applicant_photo", objectId: "app_1" }, headers());
    await recordStudentFileRead(owner, { kind: "applicant_resume", objectId: "app_1" }, headers());

    const rows = await entries();
    expect(rows.map((r) => r.action).sort()).toEqual([
      "student_applicant_photo_view",
      "student_applicant_resume_view",
      "student_photo_view",
    ]);
    expect(rows.find((r) => r.action === "student_applicant_photo_view")?.candidateId).toBe(
      "student-application:app_1",
    );
  });

  it("не чаще одной записи на пользователя и файл за 10 минут", async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(t0);
    await recordStudentFileRead(owner, { kind: "study", objectId: FILE }, headers());
    now.mockReturnValue(t0 + STUDENT_FILE_THROTTLE_MS - 1000);
    await recordStudentFileRead(owner, { kind: "study", objectId: FILE }, headers());
    expect(await entries()).toHaveLength(1);

    // Другой файл и другой пользователь — отдельные записи
    await recordStudentFileRead(owner, { kind: "study", objectId: OTHER_FILE }, headers());
    await recordStudentFileRead({ ...owner, id: "usr_head" }, { kind: "study", objectId: FILE }, headers());
    expect(await entries()).toHaveLength(3);

    // Через 10 минут — снова пишем
    now.mockReturnValue(t0 + STUDENT_FILE_THROTTLE_MS + 1000);
    await recordStudentFileRead(owner, { kind: "study", objectId: FILE }, headers());
    expect(await entries({ actorId: owner.id, candidateId: `student-file:${FILE}` })).toHaveLength(2);
    now.mockRestore();
  });

  it("сбой записи не бросает, а повторное чтение пробует записать снова", async () => {
    const spy = vi.spyOn(db.personalDataAccessLog, "create").mockRejectedValueOnce(new Error("база недоступна"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordStudentFileRead(owner, { kind: "photo", objectId: FILE }, headers())).resolves.toBeUndefined();
    spy.mockRestore();
    error.mockRestore();
    expect(await entries()).toHaveLength(0);

    await recordStudentFileRead(owner, { kind: "photo", objectId: FILE }, headers());
    expect(await entries()).toHaveLength(1);
  });

  it("без заголовков запроса пишет запись без адреса", async () => {
    await recordStudentFileRead(owner, { kind: "photo", objectId: FILE });
    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0].ip).toBeNull();
  });

  it("в просмотре журнала запись подписана по-русски, с ролью и без ФИО студента", async () => {
    await recordStudentFileRead(owner, { kind: "study", objectId: FILE }, headers());

    const log = await listAccessLog(owner, { limit: 50 });
    const entry = log.find((e) => e.action === "student_study_view");
    expect(entry).toBeDefined();
    expect(entry?.actorName).toBe("Полина Фаттахова");
    expect(entry?.actorRole).toBe("Владелец");
    expect(entry?.candidateName).toBe("Справка студента, файл 123e4567");
  });
});
