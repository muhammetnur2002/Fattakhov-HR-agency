/**
 * Пользователь с включённой двухфакторной — для тестов, которым 2FA нужна
 * как условие, а не как предмет проверки.
 *
 * Пишет в базу напрямую, минуя подключение через настройки: оно требует
 * текущий пароль (или код из SMS), а тесту входа или обязательной
 * настройки это лишний шаг, не имеющий к проверяемому отношения.
 * Само подключение проверяется в tests/two-factor.test.ts.
 */
import { generateSecret } from "@/lib/auth/totp";
import { sealTotpSecret } from "@/lib/auth/totp-secret";
import { prismaRaw as db } from "@/lib/db/prisma";

export async function enableTwoFactorForTest(userId: string): Promise<{ secret: string }> {
  const secret = generateSecret();
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: sealTotpSecret(secret), totpEnabledAt: new Date(), totpLastStep: null },
  });
  return { secret };
}
