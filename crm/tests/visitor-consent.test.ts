/**
 * Согласие посетителя сайта — документ юриста №2, дословно.
 *
 * Текст сгенерирован из .docx комплекта юриста (редакция 18.09.2026),
 * и тест держит его отпечаток: любая правка формулировки — даже запятой —
 * роняет тест. Это и задумано: менять текст можно только новой редакцией
 * юриста целиком, с новой CONSENT_VERSION, и тогда отпечаток обновляется
 * осознанно вместе с ними.
 *
 * Регистрация в кабинете этот документ не показывает и своего текста
 * не меняла: он закреплён за прежней версией 2026-09-30.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CONSENT_VERSION,
  OPERATOR_INN,
  OPERATOR_OGRNIP,
  PRIVACY_EMAIL,
} from "@/lib/legal/consent-texts";
import {
  REGISTRATION_CONSENT_TEXT,
  REGISTRATION_CONSENT_VERSION,
} from "@/lib/legal/registration-consent";
import {
  VISITOR_CONSENT_CHECKBOX,
  VISITOR_CONSENT_DOCUMENT,
  VISITOR_CONSENT_POLICY_WORDS,
} from "@/lib/legal/visitor-consent";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("согласие посетителя сайта", () => {
  it("документ слово в слово как в редакции юриста от 18.09.2026", () => {
    const text = VISITOR_CONSENT_DOCUMENT.map((b) => b.text).join("\n\n");
    expect(sha256(text)).toBe("c0bfe989bf0fd4895d3047bf617061308661b48ed99f531e9c4b509f630fba03");
  });

  it("у галочки — «текст отметки в форме на сайте» из того же документа", () => {
    expect(sha256(VISITOR_CONSENT_CHECKBOX)).toBe(
      "38d8cef724c528320e6fd0baa360154337b17ecc1303f45ae6ded565224946cb",
    );
    // Ссылка на политику ставится на эти слова — они в отметке ровно один раз
    expect(VISITOR_CONSENT_CHECKBOX.split(VISITOR_CONSENT_POLICY_WORDS)).toHaveLength(2);
  });

  it("все семь разделов на месте, оператор — тот же, что в реквизитах сайта", () => {
    const headings = VISITOR_CONSENT_DOCUMENT.filter((b) => b.kind === "heading");
    expect(headings.map((h) => h.text.split(".")[0])).toEqual(["1", "2", "3", "4", "5", "6", "7"]);

    const operator = VISITOR_CONSENT_DOCUMENT.find((b) => b.kind === "operator")!.text;
    expect(operator).toContain(OPERATOR_INN);
    expect(operator).toContain(OPERATOR_OGRNIP);
    expect(operator).toContain(PRIVACY_EMAIL);
  });

  it("смена текста на сайте — новая версия согласия", () => {
    expect(CONSENT_VERSION).toBe("2026-10-04");
  });
});

describe("регистрация в кабинете смену текста на сайте не заметила", () => {
  it("тот же текст и та же версия, что были до 04.10.2026", () => {
    expect(REGISTRATION_CONSENT_VERSION).toBe("2026-09-30");
    expect(REGISTRATION_CONSENT_TEXT).toBe(
      "Я даю Индивидуальный предприниматель Фаттахов Тимур Айратович согласие на обработку " +
        "моего имени, компании, телефона, email и содержания заявки в целях ответа на " +
        "обращение и ведения переговоров. Согласие действует 90 дней после последнего " +
        "содержательного контакта, если ранее не возникнет иное законное основание. " +
        "Я могу отозвать согласие по адресу privacy@fattakhovhr.ru.",
    );
  });
});
