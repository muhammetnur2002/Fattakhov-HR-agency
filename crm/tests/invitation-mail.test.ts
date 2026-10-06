/**
 * Письмо-приглашение (invitationMail в lib/services/invitations.ts).
 *
 * Адрес до приёма приглашения никем не подтверждён: опечатка — и письмо
 * читает посторонний. Название компании-клиента выдало бы ему, кто
 * работает с агентством (BR-28), поэтому его нет нигде — ни в теме,
 * ни в тексте, ни в HTML. Агентство называется: оно и есть отправитель.
 */
import { describe, expect, it } from "vitest";

import { invitationMail, type InviteDetails } from "@/lib/services/invitations";

const toClientColleague: InviteDetails = {
  token: "tok_test",
  email: "new.colleague@example.com",
  role: "CLIENT_HIRING",
  organizationName: "Fattakhov HR Agency",
  clientName: "Старфиш",
  invitedByName: "Екатерина Волкова",
};

describe("письмо-приглашение", () => {
  it("коллеге клиента — без названия компании ни в теме, ни в тексте, ни в HTML", () => {
    const mail = invitationMail(toClientColleague);

    for (const part of [mail.subject, mail.text, mail.html]) {
      expect(part).not.toContain("Старфиш");
    }
    expect(mail.subject).toBe("Приглашение в кабинет вашей компании");
    expect(mail.text).toContain("Екатерина Волкова приглашает вас в кабинет вашей компании");
    expect(mail.text).toContain("/invite/tok_test");
  });

  it("сотруднику агентства — агентство по имени: оно и есть отправитель", () => {
    const mail = invitationMail({ ...toClientColleague, role: "RECRUITER", clientName: null });
    expect(mail.subject).toBe("Приглашение в агентство «Fattakhov HR Agency»");
  });
});
