/**
 * Коды из SMS для входа по телефону.
 *
 * Проверяется то, на чём держится защита: код нельзя подобрать (попытки
 * считаются у самого кода), нельзя засыпать чужой номер кодами (лимит
 * по номеру), нельзя войти одним кодом дважды, а проверка без погашения
 * действительно ничего не гасит — на ней стоит порядок со вторым фактором.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prismaRaw as db } from "@/lib/db/prisma";
import { setSmsTransportForTests, type SmsMessage } from "@/lib/notifications/sms";
import {
  checkPhoneCode,
  consumePhoneCode,
  PhoneCodeError,
  requestPhoneCode,
  smsText,
} from "@/lib/services/phone-auth";

const PHONE = "+79990000101";
let sent: SmsMessage[] = [];

function lastCode(): string {
  const text = sent.at(-1)?.text ?? "";
  return text.match(/\d{6}/)?.[0] ?? "";
}

beforeEach(async () => {
  await db.phoneCode.deleteMany({ where: { phone: PHONE } });
  sent = [];
  setSmsTransportForTests({ send: async (m) => void sent.push(m) });
});

afterAll(async () => {
  await db.phoneCode.deleteMany({ where: { phone: PHONE } });
  setSmsTransportForTests(undefined);
  await db.$disconnect();
});

describe("выдача кода", () => {
  it("присылает шесть цифр на нормализованный номер", async () => {
    const result = await requestPhoneCode("8 999 000-01-01");
    expect(result.phone).toBe(PHONE);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(PHONE);
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it("код в базе не хранится открыто", async () => {
    await requestPhoneCode(PHONE);
    const row = await db.phoneCode.findFirstOrThrow({ where: { phone: PHONE } });
    expect(row.codeHash).not.toContain(lastCode());
  });

  it("не больше трёх кодов на номер за 10 минут", async () => {
    await requestPhoneCode(PHONE);
    await requestPhoneCode(PHONE);
    await requestPhoneCode(PHONE);
    await expect(requestPhoneCode(PHONE)).rejects.toThrow(PhoneCodeError);
    expect(sent).toHaveLength(3);
  });

  it("текст помещается в одно SMS кириллицей (70 символов)", () => {
    expect(smsText("123456").length).toBeLessThanOrEqual(70);
  });
});

describe("проверка кода", () => {
  it("верный код проходит, неверный — нет", async () => {
    await requestPhoneCode(PHONE);
    const code = lastCode();
    // Заведомо другой код, а не случайный: случайный раз в миллион совпал бы
    const wrong = code === "111111" ? "222222" : "111111";
    await expect(checkPhoneCode(PHONE, wrong)).rejects.toThrow(/Неверный код/);
    const ok = await checkPhoneCode(PHONE, code);
    expect(ok.phone).toBe(PHONE);
  });

  it("проверка без погашения ничего не гасит — можно проверить ещё раз", async () => {
    await requestPhoneCode(PHONE);
    const code = lastCode();
    const first = await checkPhoneCode(PHONE, code);
    const second = await checkPhoneCode(PHONE, code);
    expect(second.codeId).toBe(first.codeId);
  });

  it("погасить можно ровно один раз", async () => {
    await requestPhoneCode(PHONE);
    const { codeId } = await checkPhoneCode(PHONE, lastCode());
    expect(await consumePhoneCode(codeId)).toBe(true);
    expect(await consumePhoneCode(codeId)).toBe(false);
    await expect(checkPhoneCode(PHONE, lastCode())).rejects.toThrow(/устарел/);
  });

  it("после восьми неверных попыток не подходит даже верный", async () => {
    await requestPhoneCode(PHONE);
    const code = lastCode();
    const wrong = code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 8; i++) {
      await expect(checkPhoneCode(PHONE, wrong)).rejects.toThrow(/Неверный код/);
    }
    await expect(checkPhoneCode(PHONE, code)).rejects.toThrow(/Слишком много/);
  });

  it("просроченный код не проходит", async () => {
    await requestPhoneCode(PHONE);
    const code = lastCode();
    const later = new Date(Date.now() + 11 * 60 * 1000);
    await expect(checkPhoneCode(PHONE, code, later)).rejects.toThrow(/устарел/);
  });
});
