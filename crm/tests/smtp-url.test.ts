/**
 * Адрес SMTP: у внешнего сервера шифрование обязательно.
 *
 * Без requireTLS порт 587 шифруется «по возможности», и перехватчик,
 * вырезавший предложение STARTTLS, получает логин и пароль почты.
 */
import { createTransport } from "nodemailer";
import { describe, expect, it } from "vitest";

import { secureSmtpUrl } from "@/lib/notifications/smtp-url";

describe("secureSmtpUrl", () => {
  it("требует шифрование у внешнего сервера, и nodemailer это понимает", () => {
    const url = secureSmtpUrl("smtp://login:pass@smtp.reg.ru:587");
    expect(url).toContain("requireTLS=true");
    const transport = createTransport(url) as unknown as { options: { requireTLS?: boolean } };
    expect(transport.options.requireTLS).toBe(true);
  });

  it.each([
    "smtps://u:p@smtp.reg.ru:465",
    "smtp://localhost:1025",
    "smtp://127.0.0.1:1025",
    "smtp://u:p@smtp.reg.ru:587?requireTLS=false",
    "smtp://u:p@smtp.reg.ru:587?ignoreTLS=true",
    "не-адрес",
  ])("не трогает %s", (same) => {
    expect(secureSmtpUrl(same)).toBe(same);
  });
});
