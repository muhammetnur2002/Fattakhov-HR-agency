/**
 * Отзыв неотвеченного приглашения пользователя клиента.
 *
 * Проверяется не «функция отработала», а границы. Отзывать зовут из двух
 * кабинетов с разными правами, а сам предмет один — строка приглашения,
 * id которой видно в разметке собственной страницы. Поэтому здесь
 * изоляция (BR-28): администратор одной компании не должен ни отозвать
 * чужое приглашение, ни узнать по ответу, что оно существует.
 *
 * И главное, ради чего всё: отозванная ссылка перестаёт пускать внутрь.
 * Пока её нельзя было отозвать, ошибка в адресе означала неделю, в течение
 * которой случайный получатель мог завести себе учётную запись в кабинете
 * клиента, а позвать нужного человека было нельзя — адрес занят.
 *
 * Перенесено из CRM агентства 01.10.2026. Здесь агентство людям клиента
 * приглашений не шлёт — заводит аккаунт с паролем, — но приглашения,
 * которые администратор клиента отправил сам, видит в карточке клиента
 * и может отозвать. Ссылку при этом не видит: последний блок держит,
 * что токен в агентскую карточку не уходит вовсе.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  getClient,
  listClientTeam,
  revokeClientInvitation,
} from "@/lib/services/clients";
import {
  createInvitation,
  getInvitation,
  InviteError,
} from "@/lib/services/invitations";

const ORG = "org_fattakhov";
const STARFISH = "cl_starfish";
const VECTOR = "cl_technopark";

/** Администратор первой компании — тот, кто зовёт коллег и отзывает. */
const starfishAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: STARFISH,
};
/** Администратор второй компании — ради него весь разговор об изоляции. */
const vectorAdmin: Actor = {
  id: "usr_cl2_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: VECTOR,
};
/** Нанимающий менеджер: в кабинете он есть, права управлять людьми — нет. */
const hiring: Actor = {
  id: "usr_cl_hiring1",
  organizationId: ORG,
  role: "CLIENT_HIRING",
  clientId: STARFISH,
};

/** Агентская сторона: ведёт пользователей любого своего клиента. */
const account: Actor = {
  id: "usr_account",
  organizationId: ORG,
  role: "ACCOUNT",
  clientId: null,
};
/** Рекрутёр учётными записями клиента не занимается (client.manage). */
const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};
const owner: Actor = {
  id: "usr_owner",
  organizationId: ORG,
  role: "OWNER",
  clientId: null,
};

const MARK = "test-client-invite";

async function cleanup() {
  await db.invitation.deleteMany({ where: { email: { startsWith: MARK } } });
}

let counter = 0;

/** Приглашение в указанную компанию; clientId: null — сотрудник агентства. */
async function invite(clientId: string | null, suffix = "") {
  const email = `${MARK}+${suffix || ++counter}@example.com`;
  const token = await createInvitation({
    organizationId: ORG,
    email,
    role: clientId ? "CLIENT_HIRING" : "RECRUITER",
    clientId,
    createdById: owner.id,
  });
  const { id } = await db.invitation.findFirstOrThrow({
    where: { token },
    select: { id: true },
  });
  return { id, token, email };
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("кабинет клиента", () => {
  it("администратор отзывает приглашение своего коллеги", async () => {
    const { id } = await invite(STARFISH);

    await revokeClientInvitation(starfishAdmin, id);

    expect(await db.invitation.findFirst({ where: { id } })).toBeNull();
  });

  it("ссылка после отзыва перестаёт открываться", async () => {
    const { id, token } = await invite(STARFISH);
    // До отзыва по ней заводят учётную запись с указанной ролью
    expect(await getInvitation(token)).not.toBeNull();

    await revokeClientInvitation(starfishAdmin, id);

    expect(await getInvitation(token)).toBeNull();
  });

  it("освобождает адрес: опечатку можно исправить сразу, а не через неделю",
    async () => {
      const { id, email } = await invite(STARFISH, "typo");

      // Пока приглашение живо, повторное на тот же адрес не создать
      await expect(
        createInvitation({
          organizationId: ORG,
          email,
          role: "CLIENT_HIRING",
          clientId: STARFISH,
          createdById: owner.id,
        }),
      ).rejects.toThrow(InviteError);

      await revokeClientInvitation(starfishAdmin, id);

      await expect(
        createInvitation({
          organizationId: ORG,
          email,
          role: "CLIENT_HIRING",
          clientId: STARFISH,
          createdById: owner.id,
        }),
      ).resolves.toBeTruthy();
    });

  it("чужую компанию не достать — и по ответу не отличить от несуществующей",
    async () => {
      const { id } = await invite(VECTOR);

      /*
        Именно «не найдено», а не «недостаточно прав»: отказ по правам
        подтвердил бы, что приглашение с таким id существует (BR-28).
        Тот же ответ приходит и на выдуманный id — сравнение ниже.
      */
      await expect(revokeClientInvitation(starfishAdmin, id)).rejects.toThrow(
        InviteError,
      );
      await expect(
        revokeClientInvitation(starfishAdmin, "inv_несуществующее"),
      ).rejects.toThrow(InviteError);

      expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
    });

  it("своё приглашение отзывает администратор своей же компании", async () => {
    const { id } = await invite(VECTOR);

    await revokeClientInvitation(vectorAdmin, id);

    expect(await db.invitation.findFirst({ where: { id } })).toBeNull();
  });

  it("нанимающему менеджеру права нет", async () => {
    const { id } = await invite(STARFISH);

    await expect(revokeClientInvitation(hiring, id)).rejects.toThrow(
      AccessDeniedError,
    );
    expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
  });

  it("приглашение сотрудника агентства через кабинет клиента не отозвать",
    async () => {
      const { id } = await invite(null);

      await expect(revokeClientInvitation(starfishAdmin, id)).rejects.toThrow(
        InviteError,
      );
      expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
    });
});

describe("кабинет агентства", () => {
  it("аккаунт-менеджер отзывает приглашение любого своего клиента",
    async () => {
      const starfish = await invite(STARFISH);
      const vector = await invite(VECTOR);

      await revokeClientInvitation(account, starfish.id);
      await revokeClientInvitation(account, vector.id);

      expect(
        await db.invitation.count({
          where: { id: { in: [starfish.id, vector.id] } },
        }),
      ).toBe(0);
    });

  it("рекрутёру права нет: учётными записями клиента он не занимается",
    async () => {
      const { id } = await invite(STARFISH);

      await expect(revokeClientInvitation(recruiter, id)).rejects.toThrow(
        AccessDeniedError,
      );
      expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
    });

  it("приглашение сотрудника агентства этим путём не отзывается — у него свой",
    async () => {
      const { id } = await invite(null);

      await expect(revokeClientInvitation(owner, id)).rejects.toThrow(
        InviteError,
      );
      expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
    });
});

describe("что уходит в данные страниц", () => {
  it("карточка клиента у агентства — без ссылки: токен не уходит вовсе", async () => {
    const { id } = await invite(STARFISH);

    const client = await getClient(account, STARFISH);
    const pending = client?.invitations.find((i) => i.id === id);

    // Видно, кого позвали, — но не пропуск в чужой кабинет: карточка
    // уходит в браузер целиком, и спрятать на экране было бы мало
    expect(pending).toBeDefined();
    expect(pending).not.toHaveProperty("token");
  });

  it("своя команда у администратора клиента — со ссылкой: её передают коллеге",
    async () => {
      const { id, token } = await invite(STARFISH);

      const team = await listClientTeam(STARFISH);

      expect(team.invitations.find((i) => i.id === id)?.token).toBe(token);
    });

  it("отозванное приглашение пропадает из обоих списков", async () => {
    const { id } = await invite(STARFISH);

    await revokeClientInvitation(starfishAdmin, id);

    const [team, client] = await Promise.all([
      listClientTeam(STARFISH),
      getClient(account, STARFISH),
    ]);
    expect(team.invitations.some((i) => i.id === id)).toBe(false);
    expect(client?.invitations.some((i) => i.id === id)).toBe(false);
  });
});
