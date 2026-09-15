/**
 * Одноразовые коды по времени.
 *
 * Алгоритм написан нами, поэтому проверяется официальными векторами
 * из самих стандартов, а не «сгенерировали и сравнили сами с собой».
 * Такая проверка ловит и опечатку в арифметике, и неверный разбор
 * секрета: если бы наш код был последователен в собственной ошибке,
 * тест на самосогласованность прошёл бы, а этот нет.
 *
 * Векторы: RFC 4226, приложение D (HOTP) и RFC 6238, приложение B (TOTP).
 */
import { describe, expect, it } from "vitest";

import {
  decodeBase32,
  encodeBase32,
  generateSecret,
  hotp,
  otpauthUrl,
  totp,
  verifyTotp,
} from "@/lib/auth/totp";

/** Секрет из обоих стандартов: строка "12345678901234567890". */
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = encodeBase32(Buffer.from(RFC_SECRET_ASCII));

describe("base32", () => {
  it("кодирует и раскодирует обратно без потерь", () => {
    for (const sample of ["", "a", "ab", "abc", "abcd", RFC_SECRET_ASCII]) {
      const encoded = encodeBase32(Buffer.from(sample));
      expect(decodeBase32(encoded).toString()).toBe(sample);
    }
  });

  it("совпадает с известным значением", () => {
    // "12345678901234567890" в base32 — это то, что видят приложения
    expect(RFC_SECRET_BASE32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("терпит пробелы и регистр: люди переписывают секрет руками", () => {
    const spaced = "gezd gnbv gy3t qojq GEZD GNBV GY3T QOJQ";
    expect(decodeBase32(spaced).toString()).toBe(RFC_SECRET_ASCII);
  });

  it("не молчит на мусоре", () => {
    expect(() => decodeBase32("не base32!")).toThrow();
  });
});

describe("HOTP, векторы RFC 4226", () => {
  // Приложение D стандарта: счётчик 0..9 при том же секрете
  const EXPECTED = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it.each(EXPECTED.map((code, counter) => [counter, code]))(
    "счётчик %i даёт %s",
    (counter, code) => {
      expect(hotp(Buffer.from(RFC_SECRET_ASCII), counter as number)).toBe(code);
    },
  );
});

describe("TOTP, векторы RFC 6238", () => {
  // Приложение B стандарта, вариант SHA-1, восемь цифр
  const VECTORS: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  it.each(VECTORS)("на отметке %i код %s", (seconds, code) => {
    expect(totp(RFC_SECRET_BASE32, seconds, 8)).toBe(code);
  });
});

describe("проверка кода", () => {
  const NOW = 1_700_000_000;

  it("принимает код текущего интервала", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, totp(RFC_SECRET_BASE32, NOW), NOW)).toBe(true);
  });

  it("принимает соседние интервалы: часы на телефоне расходятся", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, totp(RFC_SECRET_BASE32, NOW - 30), NOW)).toBe(true);
    expect(verifyTotp(RFC_SECRET_BASE32, totp(RFC_SECRET_BASE32, NOW + 30), NOW)).toBe(true);
  });

  it("не принимает код, отстоящий больше чем на интервал", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, totp(RFC_SECRET_BASE32, NOW - 90), NOW)).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, totp(RFC_SECRET_BASE32, NOW + 90), NOW)).toBe(false);
  });

  it("отвергает мусор вместо кода", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56 78"]) {
      expect(verifyTotp(RFC_SECRET_BASE32, bad, NOW), bad).toBe(false);
    }
  });

  it("терпит пробелы внутри кода", () => {
    const code = totp(RFC_SECRET_BASE32, NOW);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(verifyTotp(RFC_SECRET_BASE32, spaced, NOW)).toBe(true);
  });

  it("чужой секрет не подходит", () => {
    const other = generateSecret();
    expect(verifyTotp(other, totp(RFC_SECRET_BASE32, NOW), NOW)).toBe(false);
  });
});

describe("секрет и ссылка для приложения", () => {
  it("секреты не повторяются и достаточной длины", () => {
    const first = generateSecret();
    const second = generateSecret();
    expect(first).not.toBe(second);
    // 20 байт в base32 это 32 символа
    expect(first).toHaveLength(32);
  });

  it("ссылка содержит всё, что нужно приложению", () => {
    const url = otpauthUrl({
      secret: RFC_SECRET_BASE32,
      account: "polina@fattakhov.hr",
      issuer: "Fattakhov HR",
    });

    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain(`secret=${RFC_SECRET_BASE32}`);
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
    // Имя компании в метке, иначе в приложении будет безымянная строка
    expect(decodeURIComponent(url)).toContain("Fattakhov HR:polina@fattakhov.hr");
  });
});
