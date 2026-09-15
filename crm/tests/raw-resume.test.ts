/**
 * Исходное резюме клиенту не отдаётся.
 *
 * Требование P0-5 юридического пакета и мера против угрозы T16
 * модели угроз. Исходный PDF или DOCX составлял кандидат, и в нём
 * бывает всё: домашний адрес, дата рождения, семейное положение,
 * фотография, иногда сведения о здоровье. Клиенту для рассмотрения
 * ничего этого не нужно - он работает с профилем из структурированных
 * полей карточки.
 *
 * Проверяется именно неотменяемость запрета. Пометка «общий» -
 * решение человека, а человек ошибается: достаточно один раз
 * поставить резюме общим, и лишние данные уедут клиенту навсегда.
 * Поэтому тест ставит резюме ровно в такое положение и убеждается,
 * что оно всё равно не отдаётся.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { visibleAttachmentsFilter } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";

const ORG = "org_fattakhov";
const MARK = "тест-исходное-резюме";

const агент: Actor = {
  id: "usr_recruiter",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const клиент: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

let резюмеId: string;
let сопроводительноеId: string;

beforeAll(async () => {
  const кандидат = await db.candidate.findFirst({
    where: { organizationId: ORG },
    select: { id: true },
  });
  if (!кандидат) throw new Error("В тестовой базе нет кандидатов");

  // Худший случай: резюме помечено общим, то есть рекрутер
  // сознательно или по ошибке открыл его клиенту
  const r = await db.attachment.create({
    data: {
      organizationId: ORG,
      kind: "RESUME",
      fileName: `${MARK}.pdf`,
      fileSize: 1024,
      mimeType: "application/pdf",
      storageKey: `${ORG}/candidates/${кандидат.id}/${MARK}.pdf`,
      visibility: "SHARED",
      candidateId: кандидат.id,
      uploadedById: агент.id,
    },
    select: { id: true },
  });
  резюмеId = r.id;

  // Контроль: другое общее вложение клиенту видно
  const c = await db.attachment.create({
    data: {
      organizationId: ORG,
      kind: "COVER_LETTER",
      fileName: `${MARK}-cover.pdf`,
      fileSize: 512,
      mimeType: "application/pdf",
      storageKey: `${ORG}/candidates/${кандидат.id}/${MARK}-cover.pdf`,
      visibility: "SHARED",
      candidateId: кандидат.id,
      uploadedById: агент.id,
    },
    select: { id: true },
  });
  сопроводительноеId = c.id;
});

afterAll(async () => {
  await db.attachment.deleteMany({ where: { fileName: { contains: MARK } } });
});

describe("исходное резюме и клиент", () => {
  it("клиент не видит резюме, даже помеченное общим", async () => {
    const найдено = await db.attachment.findFirst({
      where: { id: резюмеId, ...visibleAttachmentsFilter(клиент) },
      select: { id: true },
    });
    expect(найдено).toBeNull();
  });

  it("агентство резюме видит: оно нужно для работы", async () => {
    const найдено = await db.attachment.findFirst({
      where: { id: резюмеId, ...visibleAttachmentsFilter(агент) },
      select: { id: true },
    });
    expect(найдено?.id).toBe(резюмеId);
  });

  it("запрет не задевает другие общие вложения", async () => {
    // Иначе от клиента спрячется вообще всё, и порог видимости
    // перестанет работать в обе стороны
    const найдено = await db.attachment.findFirst({
      where: { id: сопроводительноеId, ...visibleAttachmentsFilter(клиент) },
      select: { id: true },
    });
    expect(найдено?.id).toBe(сопроводительноеId);
  });

  it("в выборке клиента по кандидату резюме отсутствует", async () => {
    const список = await db.attachment.findMany({
      where: {
        fileName: { contains: MARK },
        ...visibleAttachmentsFilter(клиент),
      },
      select: { kind: true },
    });
    expect(список.map((a) => a.kind)).not.toContain("RESUME");
  });

  it("резюме с внутренней пометкой клиенту тоже недоступно", async () => {
    await db.attachment.update({
      where: { id: резюмеId },
      data: { visibility: "INTERNAL" },
    });

    const найдено = await db.attachment.findFirst({
      where: { id: резюмеId, ...visibleAttachmentsFilter(клиент) },
      select: { id: true },
    });
    expect(найдено).toBeNull();

    await db.attachment.update({
      where: { id: резюмеId },
      data: { visibility: "SHARED" },
    });
  });
});
