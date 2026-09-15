/**
 * Движок уведомлений: каналы, схлопывание, настройки.
 *
 * Проверяется по состоянию в БД, а не по фактической отправке: в тестах
 * каналы работают в режиме лога, и единственный надёжный признак
 * «ушло / не ушло» — отметки sentEmailAt, sentTelegramAt и очередь
 * pendingChannels.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { channelsForSide, plural } from "@/lib/notifications/events";
import { flushCollapsed, notify } from "@/lib/notifications/notify";

const ORG = "org_fattakhov";
const RECRUITER = "usr_rec1";
const CLIENT_ADMIN = "usr_cl_admin";

async function cleanup() {
  await db.notification.deleteMany({ where: { organizationId: ORG } });
  // Возвращаем пользователям исходные настройки
  await db.user.updateMany({
    where: { id: { in: [RECRUITER, CLIENT_ADMIN] } },
    data: { telegramChatId: null },
  });
  await db.user.update({
    where: { id: RECRUITER },
    data: { notifyPrefs: { email: true, telegram: true } },
  });
  await db.user.update({
    where: { id: CLIENT_ADMIN },
    data: { notifyPrefs: { email: true, telegram: false } },
  });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function notificationsFor(userId: string) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

describe("доставка", () => {
  it("уведомление появляется в интерфейсе всегда", async () => {
    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "CLIENT_DECISION_MADE",
      title: "Клиент отказал по кандидату",
      linkUrl: "/a/applications/app_13",
    });

    const items = await notificationsFor(RECRUITER);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Клиент отказал по кандидату");
    expect(items[0].isRead).toBe(false);
  });

  it("письмо уходит, если событие настроено на почту", async () => {
    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "CANDIDATE_PRESENTED",
      title: "Новый кандидат",
    });

    const [item] = await notificationsFor(CLIENT_ADMIN);
    expect(item.sentEmailAt).not.toBeNull();
  });

  it("в Telegram не уходит, пока чат не привязан", async () => {
    // Событие настроено на telegram, но слать некуда
    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "INTERVIEW_SLOTS_REQUESTED",
      title: "Нужно предложить время",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentTelegramAt).toBeNull();
  });

  it("с привязанным чатом уходит", async () => {
    await db.user.update({
      where: { id: RECRUITER },
      data: { telegramChatId: "123456" },
    });

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "INTERVIEW_SLOTS_REQUESTED",
      title: "Нужно предложить время",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentTelegramAt).not.toBeNull();
  });

  it("отключённый канал уважается", async () => {
    await db.user.update({
      where: { id: CLIENT_ADMIN },
      data: { notifyPrefs: { email: false } },
    });

    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "CANDIDATE_PRESENTED",
      title: "Новый кандидат",
    });

    const [item] = await notificationsFor(CLIENT_ADMIN);
    // В интерфейсе осталось, письмом не ушло
    expect(item).toBeTruthy();
    expect(item.sentEmailAt).toBeNull();
  });

  it("битые настройки не роняют отправку", async () => {
    await db.user.update({
      where: { id: CLIENT_ADMIN },
      data: { notifyPrefs: "мусор" },
    });

    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "CANDIDATE_PRESENTED",
      title: "Новый кандидат",
    });

    const [item] = await notificationsFor(CLIENT_ADMIN);
    expect(item.sentEmailAt).not.toBeNull();
  });

  it("отключённому пользователю не шлём", async () => {
    const items = await db.notification.count({
      where: { userId: "нет-такого" },
    });
    await notify({
      organizationId: ORG,
      userIds: ["нет-такого"],
      event: "CANDIDATE_PRESENTED",
      title: "Новый кандидат",
    });
    expect(await db.notification.count({ where: { userId: "нет-такого" } })).toBe(
      items,
    );
  });
});

describe("схлопывание (BR-30)", () => {
  async function present(n: number) {
    for (let i = 0; i < n; i++) {
      await notify({
        organizationId: ORG,
        userIds: [CLIENT_ADMIN],
        event: "CANDIDATE_PRESENTED",
        title: `Кандидат ${i + 1}`,
        groupKey: "vac_1",
        linkUrl: "/vacancies/vac_1",
      });
    }
  }

  it("первое уходит сразу, остальные ждут сводки", async () => {
    await present(5);

    const items = await notificationsFor(CLIENT_ADMIN);
    expect(items).toHaveLength(5);

    // Реакция важна, поэтому первое не задерживаем
    expect(items[0].sentEmailAt).not.toBeNull();
    expect(items[0].pendingChannels).toEqual([]);

    // Остальные четыре не превратились в четыре письма
    const held = items.slice(1);
    expect(held.every((i) => i.sentEmailAt === null)).toBe(true);
    expect(held.every((i) => i.pendingChannels.includes("email"))).toBe(true);
  });

  it("события с разными ключами не схлопываются", async () => {
    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "CANDIDATE_PRESENTED",
      title: "Кандидат по первой вакансии",
      groupKey: "vac_1",
    });
    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "CANDIDATE_PRESENTED",
      title: "Кандидат по второй вакансии",
      groupKey: "vac_2",
    });

    const items = await notificationsFor(CLIENT_ADMIN);
    // Разные вакансии — разные письма, это не спам
    expect(items.every((i) => i.sentEmailAt !== null)).toBe(true);
  });

  it("без ключа схлопывания каждое уходит отдельно", async () => {
    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "INVOICE_ISSUED",
      title: "Счёт №1",
    });
    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "INVOICE_ISSUED",
      title: "Счёт №2",
    });

    const items = await notificationsFor(CLIENT_ADMIN);
    expect(items.every((i) => i.sentEmailAt !== null)).toBe(true);
  });

  it("сводка уходит одним сообщением и очищает очередь", async () => {
    await present(5);

    // Обработчик ждёт закрытия окна — сдвигаем время назад
    await db.notification.updateMany({
      where: { userId: CLIENT_ADMIN },
      data: { createdAt: new Date(Date.now() - 5 * 60_000) },
    });

    const groups = await flushCollapsed();
    expect(groups).toBe(1);

    const items = await notificationsFor(CLIENT_ADMIN);
    expect(items.every((i) => i.pendingChannels.length === 0)).toBe(true);
  });

  it("свежие уведомления сводка не трогает — окно ещё не закрылось", async () => {
    await present(3);
    expect(await flushCollapsed()).toBe(0);
  });
});

describe("каналы по сторонам", () => {
  it("агентству Telegram доступен без привязки в настройках клиента", () => {
    expect(channelsForSide(["email", "telegram"], true, false)).toEqual([
      "email",
      "telegram",
    ]);
  });

  it("клиенту Telegram только по собственной привязке", () => {
    expect(channelsForSide(["email", "telegram"], false, false)).toEqual([
      "email",
    ]);
    expect(channelsForSide(["email", "telegram"], false, true)).toEqual([
      "email",
      "telegram",
    ]);
  });

  it("почта не зависит от стороны", () => {
    expect(channelsForSide(["email"], false, false)).toEqual(["email"]);
  });
});

describe("склонение в сводках", () => {
  it("считает по-русски", () => {
    const форма = (n: number) =>
      plural(n, "кандидат", "кандидата", "кандидатов");

    expect(форма(1)).toBe("кандидат");
    expect(форма(2)).toBe("кандидата");
    expect(форма(5)).toBe("кандидатов");
    expect(форма(11)).toBe("кандидатов");
    expect(форма(21)).toBe("кандидат");
    expect(форма(22)).toBe("кандидата");
    expect(форма(25)).toBe("кандидатов");
    expect(форма(112)).toBe("кандидатов");
  });
});
