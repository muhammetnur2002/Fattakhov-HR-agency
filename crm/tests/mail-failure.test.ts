/**
 * Почтовый сервер не принял письмо (lib/notifications/channels.ts).
 *
 * Действие, которое шлёт письмо, не падает — так было и раньше. Новое:
 * отказ больше не остаётся только в журнале контейнера, владелец получает
 * сигнал о сбое. Письмо на сам ящик сбоев отсюда не сообщается — иначе
 * отказ почты кругами слал бы сообщения об отказе почты.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail }),
}));

const reportFailure = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/monitoring/alerts", () => ({ reportFailure }));

const ENV = {
  SMTP_URL: "smtp://mail.example.com:587",
  SMTP_FROM: "Fattakhov HR <noreply@example.com>",
  ALERT_EMAIL: "bugs@example.com",
};

/** Транспорт кешируется в модуле — для каждого теста берём модуль заново. */
async function freshTransport() {
  vi.resetModules();
  const { getEmailTransport } = await import("@/lib/notifications/channels");
  return getEmailTransport();
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  sendMail.mockReset();
  reportFailure.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("отказ почтового сервера", () => {
  it("действие не падает, а владелец получает сигнал о сбое", async () => {
    sendMail.mockRejectedValue(new Error("535 Authentication failed"));
    const transport = await freshTransport();

    await expect(
      transport.send({ to: "person@example.com", subject: "Сброс пароля", text: "ссылка" }),
    ).resolves.toBeUndefined();

    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ where: "почта" }),
    );
  });

  it("отказ письма на ящик сбоев не сообщается — по кругу не пойдёт", async () => {
    sendMail.mockRejectedValue(new Error("535 Authentication failed"));
    const transport = await freshTransport();

    await transport.send({ to: ENV.ALERT_EMAIL, subject: "⚠️ Сбой", text: "разбор" });

    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("принятое письмо сигнала не вызывает", async () => {
    sendMail.mockResolvedValue({ accepted: ["person@example.com"] });
    const transport = await freshTransport();

    await transport.send({ to: "person@example.com", subject: "Сброс пароля", text: "ссылка" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(reportFailure).not.toHaveBeenCalled();
  });
});
