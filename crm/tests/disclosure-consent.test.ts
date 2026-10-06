/**
 * Подтверждение передачи данных конкретному работодателю (§4.2 согласия).
 *
 * Общее согласие кандидата разрешает обработку у нас. Передача данных
 * клиенту — отдельное действие, и документ юриста требует спрашивать
 * на него отдельно, на каждого работодателя и каждую вакансию.
 *
 * Здесь проверяется то, ради чего всё это и делалось: подтверждение
 * по одной вакансии не открывает представление по другой, а истёкшее
 * не открывает вовсе.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  OPERATOR_INN,
  OPERATOR_NAME,
  OPERATOR_OGRNIP,
} from "@/lib/legal/consent-texts";
import {
  DISCLOSURE_CONSENT_TEXT,
  DISCLOSURE_CONSENT_TTL_DAYS,
  DISCLOSURE_CONSENT_VERSION,
} from "@/lib/legal/disclosure-consent";
import { addToVacancy } from "@/lib/services/applications";
import {
  createDisclosureLink,
  disclosureIsValid,
  DisclosureError,
  findValidDisclosure,
  getDisclosureRequest,
  giveDisclosure,
  markDisclosureManually,
} from "@/lib/services/disclosure-consent";
import { expireDisclosureConsents } from "@/lib/services/pdn-retention";

const ORG = "org_fattakhov";
const VACANCY_A = "vac_1";
const VACANCY_B = "vac_2";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const PREFIX = "test_disc_";
let candidateId: string;

async function cleanup() {
  const ids = (
    await db.candidate.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (ids.length === 0) return;

  const appIds = (
    await db.application.findMany({
      where: { candidateId: { in: ids } },
      select: { id: true },
    })
  ).map((a) => a.id);

  await db.stageTransition.deleteMany({
    where: { applicationId: { in: appIds } },
  });
  await db.disclosureConsent.deleteMany({ where: { candidateId: { in: ids } } });
  await db.personalDataAccessLog.deleteMany({
    where: { candidateId: { in: ids } },
  });
  await db.application.deleteMany({ where: { candidateId: { in: ids } } });
  await db.candidate.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  candidateId = `${PREFIX}${Date.now()}`;
  await db.candidate.create({
    data: {
      id: candidateId,
      organizationId: ORG,
      fullName: "Тестовый Кандидат",
      createdById: recruiter.id,
    },
  });
});

describe("текст документа", () => {
  it("оператор в тексте — тот же, что в реквизитах сайта", () => {
    // Текст переносится дословно и целиком, а реквизиты оператора на сайте
    // и в письмах живут в consent-texts.ts. Оператор однажды уже менялся
    // (ошибочный первый комплект документов): разъедутся — кандидат
    // подтвердит передачу от имени не того лица, что указано везде ещё.
    // Пробелы сводим к одному: в шапке документа слова разделены
    // разрывами строк из исходника (U+2028), а текст правке не подлежит
    const text = DISCLOSURE_CONSENT_TEXT.replace(/\s+/g, " ");
    expect(text).toContain(OPERATOR_NAME);
    expect(text).toContain(`ИНН ${OPERATOR_INN}`);
    expect(text).toContain(`ОГРНИП ${OPERATOR_OGRNIP}`);
  });
});

describe("действует ли подтверждение", () => {
  it("только GIVEN и только со сроком в будущем", () => {
    const later = new Date(Date.now() + 86_400_000);
    const earlier = new Date(Date.now() - 86_400_000);

    expect(disclosureIsValid("GIVEN", later)).toBe(true);
    expect(disclosureIsValid("GIVEN", earlier)).toBe(false);
    expect(disclosureIsValid("PENDING", later)).toBe(false);
    expect(disclosureIsValid("REVOKED", later)).toBe(false);
  });

  it("запись без срока недействующая", () => {
    // Толковать «срока нет» как «действует бессрочно» в вопросе
    // о персональных данных нельзя
    expect(disclosureIsValid("GIVEN", null)).toBe(false);
  });
});

describe("привязка к работодателю и вакансии (§8.1)", () => {
  it("подтверждение по одной вакансии не действует для другой", async () => {
    const a = await addToVacancy(recruiter, VACANCY_A, candidateId);
    await addToVacancy(recruiter, VACANCY_B, candidateId);

    await markDisclosureManually(recruiter, a.id, "VIA_AGENCY");

    expect(await findValidDisclosure(candidateId, VACANCY_A)).not.toBeNull();
    expect(await findValidDisclosure(candidateId, VACANCY_B)).toBeNull();
  });

  it("повторно просить подтверждение, когда оно есть, не даём", async () => {
    const a = await addToVacancy(recruiter, VACANCY_A, candidateId);
    await markDisclosureManually(recruiter, a.id, "DIRECT");

    await expect(createDisclosureLink(recruiter, a.id)).rejects.toThrow(
      DisclosureError,
    );
  });
});

describe("подтверждение кандидатом по ссылке", () => {
  it("записывает версию, режим контактов, срок и след", async () => {
    const a = await addToVacancy(recruiter, VACANCY_A, candidateId);
    const token = await createDisclosureLink(recruiter, a.id);

    const request = await getDisclosureRequest(token);
    expect(request, "форма должна открываться по свежему токену").not.toBeNull();
    expect(request?.vacancyTitle).toContain("№");

    await giveDisclosure({
      token,
      contactMode: "DIRECT",
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 (тестовый браузер)",
    });

    const saved = await db.disclosureConsent.findFirst({
      where: { candidateId, vacancyId: VACANCY_A },
    });

    expect(saved?.status).toBe("GIVEN");
    expect(saved?.version).toBe(DISCLOSURE_CONSENT_VERSION);
    expect(saved?.contactMode).toBe("DIRECT");
    expect(saved?.ip).toBe("203.0.113.10");
    expect(saved?.userAgent).toContain("тестовый браузер");
    // Подтверждено самим кандидатом — значит отметки рекрутера нет
    expect(saved?.confirmedById).toBeNull();

    const days = Math.round(
      (saved!.expiresAt!.getTime() - saved!.givenAt!.getTime()) / 86_400_000,
    );
    expect(days, "§6.1: не более 90 дней").toBe(DISCLOSURE_CONSENT_TTL_DAYS);
  });

  it("ссылка одноразовая", async () => {
    const a = await addToVacancy(recruiter, VACANCY_A, candidateId);
    const token = await createDisclosureLink(recruiter, a.id);
    await giveDisclosure({ token, contactMode: "VIA_AGENCY" });

    expect(await getDisclosureRequest(token)).toBeNull();
    await expect(
      giveDisclosure({ token, contactMode: "VIA_AGENCY" }),
    ).rejects.toThrow(DisclosureError);
  });

  it("негодный токен не открывает форму", async () => {
    expect(await getDisclosureRequest("нет-такого-токена")).toBeNull();
  });
});

describe("ручная отметка рекрутером", () => {
  it("видно, кто отметил, и что следа кандидата нет", async () => {
    const a = await addToVacancy(recruiter, VACANCY_A, candidateId);
    await markDisclosureManually(recruiter, a.id, "VIA_AGENCY");

    const saved = await db.disclosureConsent.findFirst({
      where: { candidateId, vacancyId: VACANCY_A },
    });

    expect(saved?.confirmedById).toBe(recruiter.id);
    expect(saved?.ip).toBeNull();
    expect(saved?.userAgent).toBeNull();
  });
});

describe("истечение срока", () => {
  it("просроченное подтверждение перестаёт действовать и помечается задачей", async () => {
    const a = await addToVacancy(recruiter, VACANCY_A, candidateId);
    await markDisclosureManually(recruiter, a.id, "VIA_AGENCY");

    await db.disclosureConsent.updateMany({
      where: { candidateId, vacancyId: VACANCY_A },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });

    expect(await findValidDisclosure(candidateId, VACANCY_A)).toBeNull();

    await expireDisclosureConsents();

    const saved = await db.disclosureConsent.findFirst({
      where: { candidateId, vacancyId: VACANCY_A },
    });
    expect(saved?.status).toBe("EXPIRED");
  });
});
