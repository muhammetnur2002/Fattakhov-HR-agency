/**
 * Билет входа в CRM со студенческой платформы (lib/students-entry.ts).
 *
 * Обратное направление от билетов CRM → студенческая платформа: здесь
 * CRM только проверяет чужую подпись, поэтому билет в тестах собирается
 * вручную — так же, как студенческая платформа тестирует приём билетов
 * CRM без обращения к её коду.
 */
import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { consumeTicketOnce, verifyStudentsEntryTicket } from "@/lib/students-entry";

const SECRET = "x".repeat(32);
const CLIENT_ID = "cl_test";
const EMAIL = "hr@example.ru";

function sign(claims: Record<string, unknown>, secret = SECRET): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      v: 1,
      iss: "fattakhov-students",
      aud: "fattakhov-crm",
      crmClientId: CLIENT_ID,
      email: EMAIL,
      iat: now,
      exp: now + 60,
      jti: randomBytes(16).toString("base64url"),
      ...claims,
    }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe("проверка билета входа в CRM", () => {
  it("верный билет принимается, почта — в нижнем регистре", () => {
    const result = verifyStudentsEntryTicket(sign({ email: "HR@Example.ru" }), SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.crmClientId).toBe(CLIENT_ID);
      expect(result.ticket.email).toBe("hr@example.ru");
    }
  });

  it("чужая подпись не проходит", () => {
    expect(verifyStudentsEntryTicket(sign({}, "y".repeat(32)), SECRET)).toEqual({
      ok: false,
      reason: "SIGNATURE",
    });
  });

  it("истёкший билет не проходит", () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    expect(verifyStudentsEntryTicket(sign({ iat: past, exp: past + 60 }), SECRET)).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("чужой issuer/audience не проходит", () => {
    expect(verifyStudentsEntryTicket(sign({ aud: "другое" }), SECRET).ok).toBe(false);
    expect(verifyStudentsEntryTicket(sign({ iss: "кто-то" }), SECRET).ok).toBe(false);
  });

  it("без crmClientId или с плохой почтой не проходит", () => {
    expect(verifyStudentsEntryTicket(sign({ crmClientId: "" }), SECRET).ok).toBe(false);
    expect(verifyStudentsEntryTicket(sign({ email: "не почта" }), SECRET).ok).toBe(false);
  });

  it("слишком длинный срок жизни билета отвергается, даже с верной подписью", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStudentsEntryTicket(sign({ iat: now, exp: now + 3600 }), SECRET).ok).toBe(false);
  });

  it("мусор вместо билета не проходит", () => {
    expect(verifyStudentsEntryTicket("мусор", SECRET)).toEqual({ ok: false, reason: "FORMAT" });
    expect(verifyStudentsEntryTicket("", SECRET)).toEqual({ ok: false, reason: "FORMAT" });
  });
});

describe("разовость билета", () => {
  it("один и тот же jti второй раз не проходит", () => {
    const jti = randomBytes(16).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(consumeTicketOnce(jti, exp)).toBe(true);
    expect(consumeTicketOnce(jti, exp)).toBe(false);
  });

  it("разные билеты не мешают друг другу", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(consumeTicketOnce(randomBytes(16).toString("base64url"), exp)).toBe(true);
    expect(consumeTicketOnce(randomBytes(16).toString("base64url"), exp)).toBe(true);
  });
});
