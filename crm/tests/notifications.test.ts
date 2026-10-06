/**
 * Движок уведомлений: каналы, схлопывание, настройки.
 *
 * Проверяется по состоянию в БД, а не по фактической отправке: в тестах
 * каналы работают в режиме лога, и единственный надёжный признак
 * «ушло / не ушло» — отметки sentEmailAt, sentVkAt
 * и очередь pendingChannels.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import {
  channelsForSide,
  EVENTS,
  plural,
  type EventCode,
} from "@/lib/notifications/events";
import { flushCollapsed, notify } from "@/lib/notifications/notify";

const ORG = "org_fattakhov";
const RECRUITER = "usr_rec1";
const CLIENT_ADMIN = "usr_cl_admin";

async function cleanup() {
  await db.notification.deleteMany({ where: { organizationId: ORG } });
  // Возвращаем пользователям исходные настройки
  await db.user.updateMany({
    where: { id: { in: [RECRUITER, CLIENT_ADMIN] } },
    data: { vkUserId: null },
  });
  await db.user.update({
    where: { id: RECRUITER },
    data: { notifyPrefs: { email: true, vk: true } },
  });
  await db.user.update({
    where: { id: CLIENT_ADMIN },
    data: { notifyPrefs: { email: true, vk: false } },
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

  it("в ВК не уходит, пока страница не привязана", async () => {
    // Событие настроено на vk, но слать некуда
    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "INTERVIEW_SLOTS_REQUESTED",
      title: "Нужно предложить время",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentVkAt).toBeNull();
  });

  it("с привязанной страницей уходит", async () => {
    await db.user.update({
      where: { id: RECRUITER },
      data: { vkUserId: "400500600" },
    });

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "INTERVIEW_SLOTS_REQUESTED",
      title: "Нужно предложить время",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentVkAt).not.toBeNull();
  });

  it("старая настройка telegram у пользователя просто игнорируется", async () => {
    // Telegram-бот убран (04.10.2026); ключ в notifyPrefs у кого-то остался
    await db.user.update({
      where: { id: RECRUITER },
      data: {
        vkUserId: "400500600",
        notifyPrefs: { email: true, telegram: false },
      },
    });

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "INTERVIEW_SLOTS_REQUESTED",
      title: "Нужно предложить время",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentEmailAt).not.toBeNull();
    // Галочки «telegram: false» ВК не касается: у него своя
    expect(item.sentVkAt).not.toBeNull();
  });

  it("в ВК не уходит то, что не срочно", async () => {
    await db.user.update({
      where: { id: CLIENT_ADMIN },
      data: { vkUserId: "400500600" },
    });

    // Счёт — только почта: в мессенджер его нет ни в каком виде
    await notify({
      organizationId: ORG,
      userIds: [CLIENT_ADMIN],
      event: "INVOICE_ISSUED",
      title: "Счёт №1",
    });

    const [item] = await notificationsFor(CLIENT_ADMIN);
    expect(item.sentEmailAt).not.toBeNull();
    expect(item.sentVkAt).toBeNull();
  });

  it("выключенный ВК уважается, как и любой канал", async () => {
    await db.user.update({
      where: { id: RECRUITER },
      data: {
        vkUserId: "400500600",
        notifyPrefs: { email: true, vk: false },
      },
    });

    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "INTERVIEW_SLOTS_REQUESTED",
      title: "Нужно предложить время",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentVkAt).toBeNull();
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

describe("каталог событий", () => {
  it("почта получает все поводы без исключения", () => {
    /*
      Решение заказчика 21.09.2026. До него шесть событий жили только
      в мессенджере или только в колокольчике, и человек без привязанного
      бота их не получал нигде. Сторож ловит новое событие, которое
      заведут мимо почты по невнимательности, — в том числе события
      студенческой платформы и прочие, которых в CRM агентства нет.
    */
    const withoutEmail = (Object.keys(EVENTS) as EventCode[]).filter(
      (code) => !(EVENTS[code].channels as readonly string[]).includes("email"),
    );

    expect(
      withoutEmail,
      `мимо почты: ${withoutEmail.join(", ")} — почта получает всё`,
    ).toEqual([]);
  });

  it("решение клиента без привязанного ВК приходит письмом", async () => {
    // Раньше — только мессенджер: рекрутер без бота не узнавал о решении
    await notify({
      organizationId: ORG,
      userIds: [RECRUITER],
      event: "CLIENT_DECISION_MADE",
      title: "Клиент отказал по кандидату",
    });

    const [item] = await notificationsFor(RECRUITER);
    expect(item.sentEmailAt).not.toBeNull();
    expect(item.sentVkAt).toBeNull();
  });

  it("срочные события идут в ВК — Telegram-канала в каталоге нет", () => {
    const channels = new Set(
      (Object.keys(EVENTS) as EventCode[]).flatMap((code) => [
        ...(EVENTS[code].channels as readonly string[]),
      ]),
    );
    expect(channels.has("vk")).toBe(true);
    expect(channels.has("telegram")).toBe(false);
  });
});

describe("каналы по сторонам", () => {
  it("агентству ВК доступен без привязки в настройках клиента", () => {
    expect(channelsForSide(["email", "vk"], true, false)).toEqual(["email", "vk"]);
  });

  it("клиенту ВК только по собственной привязке", () => {
    expect(channelsForSide(["email", "vk"], false, false)).toEqual(["email"]);
    expect(channelsForSide(["email", "vk"], false, true)).toEqual(["email", "vk"]);
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
