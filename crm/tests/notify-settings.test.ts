/**
 * Сохранение настроек уведомлений: что происходит с ВКонтакте.
 *
 * Галочка ВК стоит в форме только при ключе сообщества на сервере. Страницу
 * человека форма не принимает вовсе: её даёт только код, написанный
 * сообществу (tests/vk-link-db.test.ts). Иначе сохранение настроек до подключения ВК записывало бы
 * «выключен», и после подключения человек, вписав страницу, ничего бы
 * не получал. Второе — что страница хранится числом и отказ ВК не
 * превращается в сохранённый мусор.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const USER = "usr_rec1";

const session = vi.hoisted(() => ({
  actor: {
    id: "usr_rec1",
    organizationId: "org_fattakhov",
    role: "RECRUITER",
    clientId: null,
    grants: [],
  } as unknown,
}));

vi.mock("@/lib/auth/session", () => ({ requireActor: async () => session.actor }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  issueVkLinkCodeAction,
  saveNotifySettingsAction,
  unlinkVkAction,
  vkLinkStatusAction,
} from "@/app/actions/notifications";
import { prismaRaw as db } from "@/lib/db/prisma";

let original: {
  notifyPrefs: unknown;
  vkUserId: string | null;
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function stored() {
  const user = await db.user.findUniqueOrThrow({
    where: { id: USER },
    select: { notifyPrefs: true, vkUserId: true },
  });
  return {
    vkUserId: user.vkUserId,
    prefs: user.notifyPrefs as Record<string, unknown>,
  };
}

beforeAll(async () => {
  original = await db.user.findUniqueOrThrow({
    where: { id: USER },
    select: { notifyPrefs: true, vkUserId: true },
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // Коды привязки, выданные тестами, не должны копиться в базе
  await db.vkLinkCode.deleteMany({ where: { userId: USER } });
});

afterAll(async () => {
  await db.user.update({
    where: { id: USER },
    data: {
      notifyPrefs: original.notifyPrefs as never,
      vkUserId: original.vkUserId,
    },
  });
  await db.$disconnect();
});

describe("ВКонтакте не подключён на сервере — поля в форме нет", () => {
  it("сохранённые страница и снятая галочка остаются как были", async () => {
    await db.user.update({
      where: { id: USER },
      data: {
        vkUserId: "400500600",
        notifyPrefs: { email: true, vk: false },
      },
    });

    const result = await saveNotifySettingsAction({}, form({ email: "on" }));

    expect(result).toEqual({ ok: "Настройки сохранены" });
    const user = await stored();
    expect(user.vkUserId).toBe("400500600");
    expect(user.prefs.vk).toBe(false);
  });

  it("нетронутая галочка не превращается в «выключено»", async () => {
    await db.user.update({
      where: { id: USER },
      data: { vkUserId: null, notifyPrefs: { email: true, telegram: true } },
    });

    await saveNotifySettingsAction({}, form({ email: "on" }));

    const user = await stored();
    // Ключа нет — значит «включено», как у любого канала по умолчанию
    expect(user.prefs.vk).toBeUndefined();
    // А то, что в форме было, сохраняется как обычно
    expect(user.prefs.email).toBe(true);
    // Старый ключ telegram (бот убран) при сохранении не переносится
    expect(user.prefs.telegram).toBeUndefined();
  });
});

describe("ВКонтакте: страница из формы не принимается — привязка только кодом", () => {
  beforeEach(() => {
    vi.stubEnv("VK_BOT_TOKEN", "test-vk-token");
    vi.stubEnv("VK_GROUP_ID", "123");
  });

  it("страница, вписанная в форму, не сохраняется и ВК не спрашивает", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await saveNotifySettingsAction(
      {},
      form({ vk: "on", vkInForm: "1", vkProfile: "https://vk.com/id777" }),
    );

    const user = await stored();
    expect(user.vkUserId).toBeNull();
    expect(user.prefs.vk).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("снятая галочка выключает ВК и не трогает привязку", async () => {
    await db.user.update({ where: { id: USER }, data: { vkUserId: "777" } });

    await saveNotifySettingsAction({}, form({ vkInForm: "1" }));

    const user = await stored();
    expect(user.vkUserId).toBe("777");
    expect(user.prefs.vk).toBe(false);
  });

  it("отвязка снимает страницу", async () => {
    await db.user.update({ where: { id: USER }, data: { vkUserId: "777" } });

    await unlinkVkAction();

    expect((await stored()).vkUserId).toBeNull();
  });

  it("без ключа сообщества код привязки не выдаётся", async () => {
    vi.stubEnv("VK_BOT_TOKEN", "");

    const result = await issueVkLinkCodeAction();

    expect(result).toEqual({ error: "ВКонтакте на сервере ещё не подключён." });
  });

  it("опрос состояния: выданный код ждёт сообщения, чужой и мусор — expired", async () => {
    vi.stubEnv("AUTH_SECRET", "z".repeat(40));

    const issued = await issueVkLinkCodeAction();
    const code = "code" in issued ? issued.code : "";

    expect((await vkLinkStatusAction(code)).status).toBe("waiting");
    expect((await vkLinkStatusAction("не код")).status).toBe("expired");
  });

  it("с ключом выдаётся шестизначный код с сроком", async () => {
    vi.stubEnv("AUTH_SECRET", "z".repeat(40));

    const result = await issueVkLinkCodeAction();

    expect("code" in result && result.code).toMatch(/^\d{6}$/);
    expect("expiresAt" in result && Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
  });
});
