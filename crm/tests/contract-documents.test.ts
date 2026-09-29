/**
 * Договор для клиентов без договора: шаблон от агентства и подписанный скан от клиента.
 *
 * Важно, что файл клиента не смешивается с шаблоном (шаблон — общий и без клиента),
 * что скан привязывается к договору на подтверждении, если он есть, и что агентство
 * получает уведомление: без него присланный договор лежал бы незамеченным.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { AgreementError } from "@/lib/services/agreements";
import {
  deleteContractTemplate,
  getContractTemplate,
  listSubmittedContracts,
  listUnattachedClientContracts,
  submitSignedContract,
  uploadContractTemplate,
} from "@/lib/services/contract-documents";
import { FileValidationError } from "@/lib/storage";

const ORG = "org_fattakhov";
const CLIENT = "test_contract_client";
const CLIENT_USER = "test_contract_user";
const OWNER = "usr_owner";

const owner: Actor = { id: OWNER, organizationId: ORG, role: "OWNER", clientId: null, grants: [] };
const clientActor: Actor = { id: CLIENT_USER, organizationId: ORG, role: "CLIENT_ADMIN", clientId: CLIENT, grants: [] };

function pdf(name: string): File {
  return new File([Buffer.from("%PDF-1.4\n% тест\n")], name, { type: "application/pdf" });
}

async function cleanup() {
  await db.attachment.deleteMany({ where: { OR: [{ clientId: CLIENT }, { fileName: { startsWith: "[тест]" } }] } });
  await db.notification.deleteMany({ where: { title: { contains: "[тест] договор" } } });
  await db.agreement.deleteMany({ where: { clientId: CLIENT } });
  await db.user.deleteMany({ where: { id: CLIENT_USER } });
  await db.client.deleteMany({ where: { id: CLIENT } });
}

beforeEach(async () => {
  await cleanup();
  await db.client.create({
    data: { id: CLIENT, organizationId: ORG, name: "[тест] договор", status: "LEAD", accountManagerId: "usr_account" },
  });
  await db.user.create({
    data: {
      id: CLIENT_USER,
      organizationId: ORG,
      email: "contract.test@example.test",
      fullName: "Тест Договор",
      role: "CLIENT_ADMIN",
      clientId: CLIENT,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("шаблон договора", () => {
  it("последний загруженный файл становится шаблоном", async () => {
    await uploadContractTemplate(owner, pdf("[тест] шаблон-1.pdf"));
    await uploadContractTemplate(owner, pdf("[тест] шаблон-2.pdf"));
    const template = await getContractTemplate(ORG);
    expect(template?.fileName).toBe("[тест] шаблон-2.pdf");
    expect(template?.url).toContain("?");
  });

  it("файл клиента шаблоном не становится", async () => {
    await uploadContractTemplate(owner, pdf("[тест] шаблон.pdf"));
    await submitSignedContract(clientActor, pdf("[тест] подписанный.pdf"));
    expect((await getContractTemplate(ORG))?.fileName).toBe("[тест] шаблон.pdf");
  });

  it("удаление убирает шаблон совсем, файлы клиентов не трогает", async () => {
    await uploadContractTemplate(owner, pdf("[тест] шаблон.pdf"));
    await submitSignedContract(clientActor, pdf("[тест] подписанный.pdf"));
    await deleteContractTemplate(owner);
    expect(await getContractTemplate(ORG)).toBeNull();
    expect((await listSubmittedContracts(CLIENT)).map((f) => f.fileName)).toEqual(["[тест] подписанный.pdf"]);
  });

  it("после удаления можно загрузить новый шаблон", async () => {
    await uploadContractTemplate(owner, pdf("[тест] старый.pdf"));
    await deleteContractTemplate(owner);
    await uploadContractTemplate(owner, pdf("[тест] новый.pdf"));
    expect((await getContractTemplate(ORG))?.fileName).toBe("[тест] новый.pdf");
  });

  it("неподходящий тип файла отвергается", async () => {
    const script = new File(["<script>alert(1)</script>"], "[тест] x.html", { type: "text/html" });
    await expect(uploadContractTemplate(owner, script)).rejects.toThrow(FileValidationError);
  });
});

describe("подписанный договор от клиента", () => {
  it("без действующих условий скан остаётся у клиента и виден агентству отдельным списком", async () => {
    await submitSignedContract(clientActor, pdf("[тест] подписанный.pdf"));

    const mine = await listSubmittedContracts(CLIENT);
    expect(mine.map((f) => f.fileName)).toEqual(["[тест] подписанный.pdf"]);
    expect((await listUnattachedClientContracts(CLIENT)).map((f) => f.fileName)).toEqual(["[тест] подписанный.pdf"]);
  });

  it("если договор ждёт подтверждения, скан привязывается к нему", async () => {
    const agreement = await db.agreement.create({
      data: {
        organizationId: ORG,
        clientId: CLIENT,
        title: "[тест] условия",
        status: "PENDING",
        pricingModel: "FIXED_PER_HIRE",
        guaranteeDays: 30,
        prepaymentPercent: 0,
        startsAt: new Date(),
      },
    });
    await submitSignedContract(clientActor, pdf("[тест] подписанный.pdf"));

    const attached = await db.attachment.findFirst({ where: { clientId: CLIENT, kind: "CONTRACT" } });
    expect(attached?.agreementId).toBe(agreement.id);
    // Привязанный скан агентство видит в карточке договора, отдельный список ему не нужен
    expect(await listUnattachedClientContracts(CLIENT)).toHaveLength(0);
  });

  it("агентство получает уведомление о присланном договоре", async () => {
    await submitSignedContract(clientActor, pdf("[тест] подписанный.pdf"));
    const notified = await db.notification.findMany({
      where: { title: { contains: "[тест] договор" } },
      select: { userId: true },
    });
    expect(notified.map((n) => n.userId)).toContain("usr_account");
  });

  it("кабинет без компании договор прислать не может", async () => {
    await expect(submitSignedContract({ ...clientActor, clientId: null }, pdf("[тест] x.pdf"))).rejects.toThrow(
      AgreementError,
    );
  });
});
