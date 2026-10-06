/**
 * Приглашение сотрудника по ссылке из письма и отзыв неотвеченного.
 *
 * Перенесено из CRM агентства 01.10.2026 и встроено рядом с созданием
 * аккаунта с паролем, а не вместо него. Права те же, что у создания
 * и у отключения: роль не выше своей, доступы только свои (lib/access).
 *
 * Здесь три вещи. Приглашение доносит до учётной записи роль, должность
 * и доступы. Ссылку (пропуск с этой ролью и доступами) видит только тот,
 * кто мог бы позвать так сам, — иначе доверенный сотрудник раздавал бы
 * чужие права через чужую ссылку. И отзыв: ссылка гаснет, адрес
 * освобождается, а приглашение в кабинет клиента этим путём не достать.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { AccessDeniedError, type Actor } from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import {
  acceptInvitation,
  createInvitation,
  getInvitation,
  inviteResultMessage,
  InviteError,
} from "@/lib/services/invitations";
import {
  inviteStaff,
  listStaffInvitations,
  revokeStaffInvitation,
  StaffError,
} from "@/lib/services/staff";

const ORG = "org_fattakhov";
const MARK = "inv-staff-test";
const email = (suffix: string) => `${MARK}+${suffix}@example.com`;

const owner: Actor = { id: "usr_owner", organizationId: ORG, role: "OWNER", clientId: null };
const head = (grants: string[] = []): Actor => ({
  id: "usr_head",
  organizationId: ORG,
  role: "HEAD",
  clientId: null,
  grants,
});
const recruiter = (grants: string[] = []): Actor => ({
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
  grants,
});

async function cleanup() {
  await db.invitation.deleteMany({ where: { email: { startsWith: MARK } } });
  await db.user.deleteMany({ where: { email: { startsWith: MARK } } });
}

/** id приглашения по токену — его видит тот, кто зовёт, в списке. */
async function idOf(token: string): Promise<string> {
  const { id } = await db.invitation.findFirstOrThrow({ where: { token }, select: { id: true } });
  return id;
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("приглашение", () => {
  it("роль, должность и доступы доходят до учётной записи", async () => {
    const address = email("full");
    const { token } = await inviteStaff(owner, {
      email: address,
      role: "RECRUITER",
      position: "Старший рекрутер",
      grants: ["students.study"],
    });

    const pending = await db.invitation.findFirstOrThrow({ where: { token } });
    // Пустая компания — и это главное: без clientId человек сотрудник агентства
    expect(pending.clientId).toBeNull();

    await acceptInvitation({ token, fullName: "Приглашённый Сотрудник", password: "длинная фраза для входа" });

    const user = await db.user.findFirstOrThrow({ where: { email: address } });
    expect(user.clientId).toBeNull();
    expect(user.role).toBe("RECRUITER");
    expect(user.position).toBe("Старший рекрутер");
    expect(user.grants).toEqual(["students.study"]);
    // Ссылка одноразовая
    expect(await getInvitation(token)).toBeNull();
  });

  it("без права на команду позвать нельзя", async () => {
    await expect(
      inviteStaff(head(), { email: email("nope"), role: "RECRUITER", grants: [] }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("доверенный не зовёт на роль выше своей", async () => {
    await expect(
      inviteStaff(recruiter(["staff.manage"]), { email: email("up"), role: "HEAD", grants: [] }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("доверенный не выдаёт через приглашение доступ, которого нет у него самого", async () => {
    await expect(
      inviteStaff(head(["staff.manage"]), {
        email: email("escalate"),
        role: "RECRUITER",
        grants: ["students.moderation"],
      }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("занятый адрес — понятная ошибка ещё при приглашении", async () => {
    await expect(
      inviteStaff(owner, { email: "owner@fattakhov.hr", role: "RECRUITER", grants: [] }),
    ).rejects.toThrow(InviteError);
  });
});

describe("список «Ждут принятия»", () => {
  it("приглашения в кабинеты клиентов сюда не попадают", async () => {
    const { token } = await inviteStaff(owner, { email: email("staff"), role: "RECRUITER", grants: [] });
    const clientToken = await createInvitation({
      organizationId: ORG,
      email: email("client"),
      role: "CLIENT_HIRING",
      clientId: "cl_starfish",
      createdById: owner.id,
    });

    const ids = (await listStaffInvitations(owner)).map((i) => i.id);
    expect(ids).toContain(await idOf(token));
    expect(ids).not.toContain(await idOf(clientToken));
  });

  it("владелец видит ссылку и может отозвать", async () => {
    const { token } = await inviteStaff(owner, {
      email: email("owner-view"),
      role: "HEAD",
      grants: ["students.pilot"],
    });

    const pending = (await listStaffInvitations(owner)).find((i) => i.token === token);
    expect(pending?.revocable).toBe(true);
  });

  it("ссылку видит только тот, кто мог бы так позвать сам", async () => {
    const plain = await inviteStaff(owner, { email: email("plain"), role: "RECRUITER", grants: [] });
    const withGrant = await inviteStaff(owner, {
      email: email("grant"),
      role: "RECRUITER",
      grants: ["students.moderation"],
    });

    const seen = await listStaffInvitations(head(["staff.manage"]));
    const byId = new Map(seen.map((i) => [i.id, i]));

    // Такое приглашение руководитель с правом на команду выдал бы и сам
    expect(byId.get(await idOf(plain.token))?.token).toBe(plain.token);
    // А такое — нет: доступа к проверке компаний у него нет, и ссылка
    // стала бы способом выдать его кому угодно
    const hidden = byId.get(await idOf(withGrant.token));
    expect(hidden?.token).toBeNull();
    // Отозвать может: роль та, которой он управляет
    expect(hidden?.revocable).toBe(true);
  });

  it("приглашение на роль выше своей — ни ссылки, ни отзыва", async () => {
    const { token } = await inviteStaff(owner, { email: email("senior"), role: "HEAD", grants: [] });
    const id = await idOf(token);

    const row = (await listStaffInvitations(recruiter(["staff.manage"]))).find((i) => i.id === id);

    // В списке оно есть — кого позвали, видно, — но без пропуска и без кнопки
    expect(row).toBeDefined();
    expect(row?.token).toBeNull();
    expect(row?.revocable).toBe(false);
  });

  it("без права на команду список не отдаётся", async () => {
    await expect(listStaffInvitations(head())).rejects.toThrow(AccessDeniedError);
  });
});

describe("отзыв", () => {
  it("ссылка после отзыва ведёт туда же, куда истёкшая", async () => {
    const { token } = await inviteStaff(owner, { email: email("revoke"), role: "RECRUITER", grants: [] });
    expect(await getInvitation(token)).not.toBeNull();

    await revokeStaffInvitation(owner, await idOf(token));

    // getInvitation — то, что читает страница /invite: null на любой
    // негодный токен, одна и та же «Ссылка недействительна»
    expect(await getInvitation(token)).toBeNull();
    expect(await db.invitation.findFirst({ where: { token } })).toBeNull();
  });

  it("освобождает адрес: опечатку можно исправить сразу, а не через неделю", async () => {
    const address = email("typo");
    const { token } = await inviteStaff(owner, { email: address, role: "RECRUITER", grants: [] });

    await expect(
      inviteStaff(owner, { email: address, role: "RECRUITER", grants: [] }),
    ).rejects.toThrow(InviteError);

    await revokeStaffInvitation(owner, await idOf(token));

    await expect(
      inviteStaff(owner, { email: address, role: "RECRUITER", grants: [] }),
    ).resolves.toBeTruthy();
  });

  it("доверенный не отзывает приглашение на роль выше своей", async () => {
    const { token } = await inviteStaff(owner, { email: email("head-inv"), role: "HEAD", grants: [] });
    const id = await idOf(token);

    await expect(revokeStaffInvitation(recruiter(["staff.manage"]), id)).rejects.toThrow(
      AccessDeniedError,
    );
    expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
  });

  it("доверенный отзывает приглашение на свою роль", async () => {
    const { token } = await inviteStaff(owner, { email: email("rec-inv"), role: "RECRUITER", grants: [] });
    const id = await idOf(token);

    await revokeStaffInvitation(recruiter(["staff.manage"]), id);

    expect(await db.invitation.findFirst({ where: { id } })).toBeNull();
  });

  it("приглашение в кабинет клиента этим путём не отзывается — и не находится", async () => {
    const token = await createInvitation({
      organizationId: ORG,
      email: email("client-inv"),
      role: "CLIENT_HIRING",
      clientId: "cl_starfish",
      createdById: owner.id,
    });
    const id = await idOf(token);

    // Тот же ответ, что на выдуманный id: «не найдено», а не «нет прав»
    await expect(revokeStaffInvitation(owner, id)).rejects.toThrow(StaffError);
    await expect(revokeStaffInvitation(owner, "inv_несуществующее")).rejects.toThrow(StaffError);
    expect(await db.invitation.findFirst({ where: { id } })).not.toBeNull();
  });

  it("без права на команду — отказ до всякого поиска", async () => {
    const { token } = await inviteStaff(owner, { email: email("no-right"), role: "RECRUITER", grants: [] });

    await expect(revokeStaffInvitation(head(), await idOf(token))).rejects.toThrow(AccessDeniedError);
  });
});

describe("что сказать пригласившему", () => {
  const saved = { url: process.env.SMTP_URL, from: process.env.SMTP_FROM };

  afterEach(() => {
    if (saved.url === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = saved.url;
    if (saved.from === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = saved.from;
  });

  it("без почты на сервере — прямо: письмо не ушло, ссылку передайте сами", () => {
    delete process.env.SMTP_URL;
    delete process.env.SMTP_FROM;
    const message = inviteResultMessage("kto-to@example.com");
    expect(message).toContain("не ушло");
    expect(message).not.toContain("отправлено");
  });

  it("с почтой — отправлено, а ссылка остаётся в списке на всякий случай", () => {
    process.env.SMTP_URL = "smtp://localhost:2525";
    process.env.SMTP_FROM = "noreply@example.com";
    const message = inviteResultMessage("kto-to@example.com");
    expect(message).toContain("отправлено на kto-to@example.com");
    expect(message).toContain("«Ждут принятия»");
  });
});
