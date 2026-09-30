/**
 * Секрет 2FA в базе: шифруется, когда задан ключ, и старые открытые значения продолжают читаться.
 */
import { afterEach, describe, expect, it } from "vitest";

import { needsSealing, openTotpSecret, sealTotpSecret } from "@/lib/auth/totp-secret";

const KEY = "k".repeat(40);
const previous = process.env.TOTP_ENCRYPTION_KEY;

afterEach(() => {
  if (previous === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = previous;
});

describe("секрет второго фактора", () => {
  it("без ключа хранится как раньше", () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(sealTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
    expect(needsSealing("JBSWY3DPEHPK3PXP")).toBe(false);
  });

  it("с ключом шифруется, читается обратно и каждый раз выглядит по-разному", () => {
    process.env.TOTP_ENCRYPTION_KEY = KEY;
    const a = sealTotpSecret("JBSWY3DPEHPK3PXP");
    const b = sealTotpSecret("JBSWY3DPEHPK3PXP");
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(openTotpSecret(a)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("старое открытое значение читается и помечается на шифрование", () => {
    process.env.TOTP_ENCRYPTION_KEY = KEY;
    expect(openTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
    expect(needsSealing("JBSWY3DPEHPK3PXP")).toBe(true);
  });

  it("чужой ключ или отсутствие ключа не дают секрет", () => {
    process.env.TOTP_ENCRYPTION_KEY = KEY;
    const sealed = sealTotpSecret("JBSWY3DPEHPK3PXP");
    process.env.TOTP_ENCRYPTION_KEY = "z".repeat(40);
    expect(openTotpSecret(sealed)).toBeNull();
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(openTotpSecret(sealed)).toBeNull();
  });

  it("подделанное значение отвергается", () => {
    process.env.TOTP_ENCRYPTION_KEY = KEY;
    const sealed = sealTotpSecret("JBSWY3DPEHPK3PXP");
    expect(openTotpSecret(sealed.slice(0, -2) + "AA")).toBeNull();
  });
});
