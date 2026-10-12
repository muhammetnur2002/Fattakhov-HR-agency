import { prismaRaw as db } from "@/lib/db/prisma";

/**
 * Общие потолки писем незнакомцам (reserveStrangerMail) считаются по IP и
 * за сутки на всю базу, а не по адресу из теста. Тесты, которые просят код
 * регистрации или ссылку восстановления с одного и того же IP, копили бы
 * этот счётчик между прогонами и в какой-то момент упёрлись бы в потолок
 * без всякой ошибки в коде. Поэтому каждый такой тест начинает с чистого.
 *
 * Чистятся только IP, которыми пользуются эти тесты, и суточные счётчики:
 * файлы идут параллельно, и общая очистка по всем IP стирала бы счётчики
 * соседнего файла (email-limits.test.ts) посреди его проверки.
 */
export const LEGACY_TEST_IPS = ["203.0.113.9"];

export async function clearStrangerMailCaps(): Promise<void> {
  await db.authFailure.deleteMany({
    where: {
      OR: [
        { key: { startsWith: "mail:day:" } },
        ...LEGACY_TEST_IPS.map((ip) => ({ key: { startsWith: "mail:ip:", endsWith: `:${ip}` } })),
      ],
    },
  });
}
