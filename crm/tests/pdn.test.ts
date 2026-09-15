/**
 * ПДн-контур: согласия, сроки хранения, удаление (BR-33 … BR-36).
 *
 * Проверяется главное обещание: после удаления персональных данных
 * не остаётся нигде, а статистика при этом не рассыпается.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  consentIsValid,
  ConsentError,
  createConsentLink,
  getConsentRequest,
  giveConsent,
  revokeConsent,
} from "@/lib/services/consent";
import {
  erasePersonalData,
  expireConsents,
  listAccessLog,
  listForRetention,
} from "@/lib/services/pdn-retention";

const ORG = "org_fattakhov";
const PREFIX = "test_pdn_";

const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

let candidateId: string;

async function cleanup() {
  const ids = (
    await db.candidate.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (ids.length === 0) return;

  const apps = await db.application.findMany({
    where: { candidateId: { in: ids } },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);

  await db.stageTransition.deleteMany({ where: { applicationId: { in: appIds } } });
  await db.personalDataAccessLog.deleteMany({ where: { candidateId: { in: ids } } });
  await db.attachment.deleteMany({ where: { candidateId: { in: ids } } });
  await db.application.deleteMany({ where: { candidateId: { in: ids } } });
  await db.candidate.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  await cleanup();

  candidateId = `${PREFIX}${Date.now()}`;
  await db.candidate.create({
    data: {
      id: candidateId,
      organizationId: ORG,
      fullName: "Пробный Кандидат",
      phone: "79990001122",
      email: "probny@example.com",
      city: "Казань",
      currentPosition: "Менеджер",
      summary: "Внутренняя заметка рекрутера",
      skills: ["Продажи", "CRM"],
      createdById: owner.id,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("согласие по ссылке (BR-33)", () => {
  it("ссылка открывает форму с именем и агентством", async () => {
    const token = await createConsentLink(owner, candidateId);
    const request = await getConsentRequest(token);

    expect(request?.fullName).toBe("Пробный Кандидат");
    expect(request?.organization.name.length).toBeGreaterThan(0);
  });

  it("подтверждение фиксирует время, версию текста и адрес", async () => {
    const token = await createConsentLink(owner, candidateId);
    await giveConsent({ token, ip: "203.0.113.7" });

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: {
        consentStatus: true,
        consentGivenAt: true,
        consentExpiresAt: true,
        consentVersion: true,
        consentToken: true,
      },
    });

    expect(candidate?.consentStatus).toBe("GIVEN");
    expect(candidate?.consentGivenAt).not.toBeNull();
    expect(candidate?.consentVersion).not.toBeNull();
    // Ссылка гасится: подтверждать повторно нечего
    expect(candidate?.consentToken).toBeNull();

    const log = await db.personalDataAccessLog.findFirst({
      where: { candidateId, action: "consent_given" },
    });
    expect(log?.ip).toBe("203.0.113.7");
  });

  it("срок согласия — год вперёд", async () => {
    const token = await createConsentLink(owner, candidateId);
    await giveConsent({ token });

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { consentGivenAt: true, consentExpiresAt: true },
    });

    const months =
      (candidate!.consentExpiresAt!.getTime() -
        candidate!.consentGivenAt!.getTime()) /
      (30 * 86_400_000);
    expect(months).toBeGreaterThan(11);
    expect(months).toBeLessThan(13);
  });

  it("ссылка не работает повторно", async () => {
    const token = await createConsentLink(owner, candidateId);
    await giveConsent({ token });

    await expect(giveConsent({ token })).rejects.toThrow(/недействительна/);
  });

  it("истёкшая ссылка не открывается", async () => {
    const token = await createConsentLink(owner, candidateId);
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getConsentRequest(token)).toBeNull();
  });

  it("выдуманный токен ничего не открывает", async () => {
    expect(await getConsentRequest("подобранный")).toBeNull();
  });

  it("повторную ссылку при готовом согласии не выдаём", async () => {
    const token = await createConsentLink(owner, candidateId);
    await giveConsent({ token });

    await expect(createConsentLink(owner, candidateId)).rejects.toThrow(
      ConsentError,
    );
  });

  it("статус ещё GIVEN, но срок вышел — новую ссылку выдаём", async () => {
    /*
      Статус на EXPIRED переводит фоновая задача (expireConsents), не
      сам факт истечения срока — до её прохода запись остаётся GIVEN.
      Раньше createConsentLink проверял голый статус и в этом окне
      отказывал в новой ссылке кандидату, у которого согласие уже
      фактически недействительно и обновить его нечем.
    */
    const token = await createConsentLink(owner, candidateId);
    await giveConsent({ token });
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(createConsentLink(owner, candidateId)).resolves.toEqual(
      expect.any(String),
    );
  });
});

describe("действующее согласие", () => {
  const now = new Date("2026-09-11T12:00:00Z");

  it("выданное и не истёкшее — действует", () => {
    expect(consentIsValid("GIVEN", new Date("2026-12-01"), now)).toBe(true);
  });

  it("выданное, но истёкшее — нет", () => {
    expect(consentIsValid("GIVEN", new Date("2026-09-01"), now)).toBe(false);
  });

  it("любой другой статус — нет, даже со сроком в будущем", () => {
    for (const status of ["PENDING", "EXPIRED", "REVOKED"] as const) {
      expect(consentIsValid(status, new Date("2026-12-01"), now), status).toBe(
        false,
      );
    }
  });

  it("без срока — не действует", () => {
    // Все согласия из giveConsent срок имеют; запись без него — это
    // данные, про которые нельзя сказать, действуют они или нет,
    // и толковать такое в свою пользу в вопросе о ПДн не стоит
    expect(consentIsValid("GIVEN", null, now)).toBe(false);
  });

  /*
    Раньше перед представлением клиенту проверялся только статус,
    а GIVEN превращается в EXPIRED фоновой задачей. Между наступлением
    срока и её проходом — а если обработчик не запущен, то и сколько
    угодно долго — кандидата можно было представить работодателю
    с истёкшим согласием, и ничто бы об этом не сказало.
  */
  it("кандидата с истёкшим согласием не представить, пока статус ещё GIVEN", async () => {
    const expired = new Date();
    expired.setDate(expired.getDate() - 1);

    await db.candidate.update({
      where: { id: candidateId },
      data: { consentStatus: "GIVEN", consentExpiresAt: expired },
    });

    // Статус в базе всё ещё GIVEN: задача не проходила
    const before = await db.candidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { consentStatus: true },
    });
    expect(before.consentStatus).toBe("GIVEN");

    expect(consentIsValid("GIVEN", expired)).toBe(false);
  });
});

describe("сроки хранения (BR-34)", () => {
  it("просроченное согласие помечается истёкшим", async () => {
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        consentStatus: "GIVEN",
        consentGivenAt: new Date("2025-01-01"),
        consentExpiresAt: new Date("2026-01-01"),
      },
    });

    await expireConsents();

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { consentStatus: true },
    });
    expect(candidate?.consentStatus).toBe("EXPIRED");
  });

  it("согласие без срока тоже помечается истёкшим", async () => {
    // Предикат считает такую запись недействующей; если задача её
    // не трогает, в интерфейсе висит GIVEN, а представить кандидата
    // нельзя — и понять почему неоткуда
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentStatus: "GIVEN", consentExpiresAt: null },
    });

    await expireConsents();

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { consentStatus: true },
    });
    expect(candidate?.consentStatus).toBe("EXPIRED");
  });

  it("действующее согласие не трогается", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);

    await db.candidate.update({
      where: { id: candidateId },
      data: {
        consentStatus: "GIVEN",
        consentGivenAt: new Date(),
        consentExpiresAt: future,
      },
    });

    await expireConsents();

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { consentStatus: true },
    });
    expect(candidate?.consentStatus).toBe("GIVEN");
  });

  it("истёкшие попадают в список на удаление", async () => {
    await db.candidate.update({
      where: { id: candidateId },
      data: { consentStatus: "EXPIRED" },
    });

    const list = await listForRetention(owner);
    expect(list.map((c) => c.id)).toContain(candidateId);
  });

  it("ничего не удаляется само — только помечается", async () => {
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        consentStatus: "GIVEN",
        consentExpiresAt: new Date("2020-01-01"),
      },
    });

    await expireConsents();

    // Кандидат на месте, данные на месте: удаляет человек, не таймер
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { fullName: true, phone: true },
    });
    expect(candidate?.fullName).toBe("Пробный Кандидат");
    expect(candidate?.phone).not.toBeNull();
  });
});

describe("удаление по запросу (BR-35)", () => {
  it("стирает контакты и профиль", async () => {
    await erasePersonalData(owner, candidateId);

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: {
        fullName: true,
        phone: true,
        email: true,
        telegram: true,
        city: true,
        currentPosition: true,
        currentCompany: true,
        education: true,
        summary: true,
        skills: true,
      },
    });

    expect(candidate?.phone).toBeNull();
    expect(candidate?.email).toBeNull();
    expect(candidate?.city).toBeNull();
    expect(candidate?.currentPosition).toBeNull();
    expect(candidate?.summary).toBeNull();
    expect(candidate?.skills).toEqual([]);
    // Имя заменено на обезличенное, а не удалено: иначе развалятся связи
    expect(candidate?.fullName).toMatch(/^Кандидат #/);
    expect(candidate?.fullName).not.toContain("Пробный");
  });

  it("удаляет вложения кандидата", async () => {
    await db.attachment.create({
      data: {
        organizationId: ORG,
        kind: "RESUME",
        fileName: "resume.pdf",
        fileSize: 100,
        mimeType: "application/pdf",
        storageKey: `${PREFIX}key_${Date.now()}`,
        candidateId,
        uploadedById: owner.id,
      },
    });

    await erasePersonalData(owner, candidateId);

    const left = await db.attachment.count({ where: { candidateId } });
    expect(left).toBe(0);
  });

  it("заявка остаётся для статистики, но без рассказа о человеке", async () => {
    const vacancy = await db.vacancy.findFirst({
      where: { organizationId: ORG, status: "ACTIVE" },
      select: {
        id: true,
        stages: { orderBy: { order: "asc" }, take: 1, select: { id: true } },
      },
    });

    const application = await db.application.create({
      data: {
        organizationId: ORG,
        vacancyId: vacancy!.id,
        candidateId,
        stageId: vacancy!.stages[0].id,
        ownerId: owner.id,
        presentationSummary: "Подробный рассказ о кандидате и его опыте",
      },
      select: { id: true },
    });

    await erasePersonalData(owner, candidateId);

    const after = await db.application.findUnique({
      where: { id: application.id },
      select: { id: true, presentationSummary: true },
    });

    // Запись жива — иначе воронка и конверсии переписали бы историю
    expect(after?.id).toBe(application.id);
    // Но саммари это тоже персональные данные
    expect(after?.presentationSummary).toBeNull();
  });

  it("удаление записывается в журнал", async () => {
    await erasePersonalData(owner, candidateId);

    const log = await db.personalDataAccessLog.findFirst({
      where: { candidateId, action: "erased" },
    });
    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(owner.id);
  });

  it("кандидат чужой организации не удаляется", async () => {
    await expect(
      erasePersonalData(
        { ...owner, organizationId: "чужая" },
        candidateId,
      ),
    ).rejects.toThrow(/не найден/);
  });
});

describe("отзыв согласия", () => {
  it("переводит в отозванное и пишет в журнал", async () => {
    await revokeConsent(owner, candidateId);

    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { consentStatus: true },
    });
    expect(candidate?.consentStatus).toBe("REVOKED");

    const log = await db.personalDataAccessLog.findFirst({
      where: { candidateId, action: "consent_revoked" },
    });
    expect(log).not.toBeNull();
  });
});

describe("журнал доступа (BR-36)", () => {
  it("показывает, кто и когда смотрел данные", async () => {
    await db.personalDataAccessLog.create({
      data: {
        organizationId: ORG,
        actorId: owner.id,
        candidateId,
        action: "view",
        ip: "198.51.100.1",
      },
    });

    const log = await listAccessLog(owner, { candidateId });

    expect(log.length).toBeGreaterThan(0);
    expect(log[0].actorName).toBe("Полина Фаттахова");
    expect(log[0].candidateName).toBe("Пробный Кандидат");
  });

  it("переживает удаление кандидата", async () => {
    await db.personalDataAccessLog.create({
      data: {
        organizationId: ORG,
        actorId: owner.id,
        candidateId,
        action: "view",
      },
    });

    await erasePersonalData(owner, candidateId);

    // Журнал должен остаться: он и нужен, чтобы показать историю доступа
    const log = await listAccessLog(owner, { candidateId });
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((e) => e.action === "erased")).toBe(true);
  });
});
