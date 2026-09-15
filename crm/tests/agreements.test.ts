/**
 * Условия сотрудничества.
 *
 * От договора зависит цена найма: getActiveAgreement отдаёт его
 * в feePerHire и в выставление счёта. Поэтому важна не только
 * правильность полей, но и то, что действующий договор у клиента
 * ровно один — иначе findFirst выберет любой, и сумма в счёте будет
 * посчитана по чужим условиям. Ошибка молчаливая и правдоподобная:
 * счёт уйдёт клиенту, и заметят её не сразу.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { acceptTariff, AgreementError } from "@/lib/services/agreements";

const ORG = "org_fattakhov";
const CLIENT = "test_agr_client";
const OWNER = "usr_owner";
const PRESET = "monthly_2";

async function cleanup() {
  await db.agreement.deleteMany({ where: { clientId: CLIENT } });
  await db.client.deleteMany({ where: { id: CLIENT } });
}

beforeEach(async () => {
  await cleanup();
  await db.client.create({
    data: {
      id: CLIENT,
      organizationId: ORG,
      name: "[тест] выбор условий",
      status: "LEAD",
    },
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

function accept() {
  return acceptTariff({
    organizationId: ORG,
    clientId: CLIENT,
    presetKey: PRESET,
    acceptedByUserId: OWNER,
  });
}

describe("выбор условий сотрудничества", () => {
  it("первый выбор создаёт договор на согласовании", async () => {
    await accept();

    const agreements = await db.agreement.findMany({
      where: { clientId: CLIENT },
      select: { status: true },
    });

    expect(agreements).toHaveLength(1);
    expect(agreements[0].status).toBe("PENDING");
  });

  it("повторный выбор отклоняется", async () => {
    await accept();
    await expect(accept()).rejects.toThrow(AgreementError);
  });

  /*
    Теста на одновременный выбор здесь намеренно нет.

    Гонка настоящая: проверка «условия уже выбраны» и создание стояли
    порознь, и вручную (Promise.allSettled против реальной базы) два
    вызова стабильно заводили клиенту два договора с одинаковым номером.
    Подтверждение обоих давало два действующих договора, а
    getActiveAgreement берёт findFirst — цена найма начинала считаться
    по произвольному из двух.

    Но воспроизвести это тестом не удалось: под Vitest вызовы уходят
    в одно соединение и выстраиваются в очередь, так что тест проходил
    и на сломанном коде — проверено, в том числе на десяти одновременных
    вызовах. Тест, зелёный при живом баге, хуже отсутствия теста: он
    создаёт уверенность, которой нет.

    Поэтому здесь проверяется последовательный запрет (тест выше),
    а одновременный держится замком на строке организации внутри
    транзакции — тем же, что у номеров вакансий и счетов. У счетов
    гонка тестом воспроизводится, и там тест есть.
  */

  it("неизвестный тариф не создаёт ничего", async () => {
    await expect(
      acceptTariff({
        organizationId: ORG,
        clientId: CLIENT,
        presetKey: "такого-нет",
        acceptedByUserId: OWNER,
      }),
    ).rejects.toThrow(AgreementError);

    expect(await db.agreement.count({ where: { clientId: CLIENT } })).toBe(0);
  });
});
