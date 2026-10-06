/**
 * Сообщения о сбоях владельцу.
 *
 * Главное здесь не «отправилось», а что именно отправилось: в мессенджер
 * правило проекта запрещает отдавать содержимое. Поэтому большая часть
 * проверок про очистку текста.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { to?: string; subject?: string; chatId?: string; userId?: string; text: string };
type Pushed = { userId: string; message: { title: string; body?: string; url?: string } };

const sent = vi.hoisted(() => ({
  email: [] as Sent[],
  vk: [] as Sent[],
  push: [] as Pushed[],
  /** Следующая отправка письма падает — как недоступный SMTP. */
  failNext: false,
}));

vi.mock("@/lib/notifications/channels", () => ({
  getEmailTransport: () => ({
    send: async (m: Sent) => {
      if (sent.failNext) throw new Error("SMTP недоступен");
      sent.email.push(m);
    },
  }),
  getVkTransport: () => ({ send: async (m: Sent) => void sent.vk.push(m) }),
}));

// Пуш подменён целиком: здесь важно, кому и что, а не служба уведомлений
vi.mock("@/lib/notifications/push", () => ({
  sendPushToUser: async (userId: string, message: Pushed["message"]) => {
    sent.push.push({ userId, message });
    return { sent: 1, removed: 0, failed: 0, outcomes: [{ state: "sent" }] };
  },
}));

import { prismaRaw as db } from "@/lib/db/prisma";
import { reportFailure, resetAlertSilence, scrub } from "@/lib/monitoring/alerts";

import { vapidKeys } from "./push-fixtures";

beforeEach(() => {
  resetAlertSilence();
});

describe("очистка текста перед отправкой", () => {
  it("прячет адрес почты", () => {
    const text = scrub(
      'Unique constraint failed: email "ivan.petrov@example.com" уже занят',
    );
    expect(text).not.toContain("ivan.petrov@example.com");
    expect(text).toContain("<почта>");
  });

  it("прячет телефон в любом виде", () => {
    expect(scrub("звонок на +7 (937) 571-18-77 не прошёл")).not.toMatch(/937/);
    expect(scrub("телефон 89375711877 недоступен")).toContain("<");
  });

  it("прячет токены из ссылок", () => {
    const token = "hjnmirRYgrjr4FS0CZTZdAAyF25Wh9uDpufEXw0EiC4";
    expect(scrub(`сбой по ссылке /consent/${token}`)).not.toContain(token);
  });

  it("прячет длинные цепочки цифр", () => {
    expect(scrub("ИНН 160402219594 не найден")).not.toContain("160402219594");
  });

  it("оставляет полезное: тип ошибки и суть", () => {
    const text = scrub("PrismaClientKnownRequestError: connection refused");
    expect(text).toBe("PrismaClientKnownRequestError: connection refused");
  });

  it("не трогает короткие числа — они обычно и есть суть", () => {
    // «упало на 3 попытке», «код 500» — маскировать тут нечего
    expect(scrub("код ответа 500, попытка 3")).toBe("код ответа 500, попытка 3");
  });
});

/*
  Ниже — сама отправка. Каналы подменены: проверяется не доставка
  (её проверяет кнопка в настройках), а кому и что уходит. Письмо —
  с разбором на ящик сбоев, ВК — короткий сигнал владельцам,
  у кого привязана страница; одинаковый сбой — раз в 15 минут.
*/
describe("сообщение о сбое", () => {
  const OWNER = "usr_owner";

  beforeEach(async () => {
    sent.email.length = 0;
    sent.vk.length = 0;
    sent.failNext = false;
    await db.user.update({
      where: { id: OWNER },
      data: { vkUserId: "400500600" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await db.user.update({
      where: { id: OWNER },
      data: { vkUserId: null },
    });
    await db.$disconnect();
  });

  it("письмо с разбором на ящик сбоев, сигнал владельцу во ВК", async () => {
    vi.stubEnv("ALERT_EMAIL", "bugs@example.ru");

    await reportFailure({
      where: "запрос",
      error: new Error('Unique constraint failed: email "ivan.petrov@example.com"'),
      path: "/a/candidates/cand_1",
    });

    expect(sent.email).toHaveLength(1);
    expect(sent.email[0].to).toBe("bugs@example.ru");
    expect(sent.email[0].text).toContain("Начало стека:");
    expect(sent.email[0].text).not.toContain("ivan.petrov@example.com");

    expect(sent.vk.map((m) => m.userId)).toEqual(["400500600"]);
    // В ВК — без стека и без значений полей
    const text = sent.vk[0].text;
    expect(text).toContain("Разбор — в почте по сбоям.");
    expect(text).not.toContain("ivan.petrov@example.com");
    expect(text).not.toContain("    at ");
  });

  it("тот же сбой второй раз за 15 минут не приходит", async () => {
    vi.stubEnv("ALERT_EMAIL", "bugs@example.ru");
    const error = new Error("connection refused");

    await reportFailure({ where: "планировщик", error });
    await reportFailure({ where: "планировщик", error });

    expect(sent.email).toHaveLength(1);
    expect(sent.vk).toHaveLength(1);
  });

  it("без ящика сбоев писем нет, а сигнал во ВК есть", async () => {
    vi.stubEnv("ALERT_EMAIL", "");

    await reportFailure({ where: "планировщик", error: new Error("упало") });

    expect(sent.email).toHaveLength(0);
    expect(sent.vk).toHaveLength(1);
    expect(sent.vk[0].text).toContain("Подробности — в журнале сервера.");
  });

  it("у ошибок Prisma заголовок не пустой: их сообщение начинается с перевода строки", async () => {
    vi.stubEnv("ALERT_EMAIL", "bugs@example.ru");
    const error = new Error(
      "\nInvalid `prisma.interview.findMany()` invocation in\n/app/jobs/tasks.ts:24:50\n\nCan't reach database server",
    );
    error.name = "PrismaClientKnownRequestError";

    await reportFailure({ where: "планировщик", error });

    expect(sent.email[0].subject).toBe(
      "⚠️ Сбой: PrismaClientKnownRequestError: Invalid `prisma.interview.findMany()` invocation in",
    );
    expect(sent.vk[0].text).toContain("prisma.interview.findMany()");
  });

  it("разные сбои базы в одном месте не глушат друг друга", async () => {
    const failure = (query: string) =>
      Object.assign(new Error(`\nInvalid \`${query}\` invocation in\n/app/x.ts:1:1`), {
        name: "PrismaClientKnownRequestError",
      });

    await reportFailure({ where: "планировщик", error: failure("prisma.interview.findMany()") });
    await reportFailure({ where: "планировщик", error: failure("prisma.invoice.updateMany()") });

    expect(sent.vk).toHaveLength(2);
  });

  it("сбой самой отправки не превращается во второй сбой", async () => {
    vi.stubEnv("ALERT_EMAIL", "bugs@example.ru");
    sent.failNext = true;

    await expect(
      reportFailure({ where: "запрос", error: new Error("упало") }),
    ).resolves.toBeUndefined();
  });
});

describe("сообщение о сбое пушем", () => {
  const OWNER = "usr_owner";
  const ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-alert-owner";
  const keys = vapidKeys();

  beforeEach(async () => {
    sent.push.length = 0;
    sent.failNext = false;
    await db.pushSubscription.deleteMany({ where: { endpoint: ENDPOINT } });
    await db.pushSubscription.create({
      data: { userId: OWNER, endpoint: ENDPOINT, p256dh: "B".repeat(87), auth: "A".repeat(22) },
    });
    vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:privacy@fattakhovhr.ru");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await db.pushSubscription.deleteMany({ where: { endpoint: ENDPOINT } });
  });

  it("владельцу на устройство — без текста ошибки и адреса страницы", async () => {
    vi.stubEnv("ALERT_EMAIL", "bugs@example.ru");

    await reportFailure({
      where: "запрос",
      error: new Error('Unique constraint failed: email "ivan.petrov@example.com"'),
      path: "/a/candidates/cand_1",
    });

    expect(sent.push.map((p) => p.userId)).toEqual([OWNER]);
    const [{ message }] = sent.push;
    expect(message.title).toContain("Сбой в платформе");
    expect(message.body).toBe("Где: запрос. Разбор — в почте по сбоям.");
    // Экран блокировки видят все, кто рядом с телефоном
    const text = JSON.stringify(message);
    expect(text).not.toContain("ivan.petrov");
    expect(text).not.toContain("Unique constraint");
    expect(text).not.toContain("cand_1");
  });

  it("без ключей VAPID на сервере пуша нет — ВК как был", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    await reportFailure({ where: "планировщик", error: new Error("упало без ключей") });

    expect(sent.push).toHaveLength(0);
  });
});
