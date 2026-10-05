import { PrismaClient } from '@prisma/client';
import { blindIndex, encrypt } from '../lib/security/crypto';
import { emailSchema } from '../lib/validation';

/**
 * Завести (или вернуть) учётную запись сотрудника агентства — роль ADMIN.
 *
 *   npm run admin:create -- hr@fattakhov.ru
 *
 * Пароля у такой учётки нет и быть не может: администратор платформы входит
 * только через CRM (билет на /api/auth/crm), а парольный вход для роли ADMIN
 * закрыт в app/api/auth/login/route.ts. Раньше команда спрашивала пароль, и
 * пароль от панели HR подбирался той же формой, что и студенческий, мимо защиты
 * CRM (двухфакторный вход, отключение сотрудника в одном месте).
 *
 * Команда нужна редко: учётка сотрудника и так заводится сама при первом входе
 * из CRM. Она остаётся для случая «завести заранее» и для возврата отключённой
 * учётной записи (isActive = true). Права на разделы выдаёт CRM в билете.
 */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не задан. Учётная запись нужна в базе, а не в памяти процесса.');
    process.exitCode = 1;
    return;
  }

  const raw = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!raw) {
    console.error('Укажите почту: npm run admin:create -- hr@fattakhov.ru');
    process.exitCode = 1;
    return;
  }

  const parsedEmail = emailSchema.safeParse(raw);
  if (!parsedEmail.success) {
    console.error(`Почта не подходит: ${parsedEmail.error.issues[0]?.message}`);
    process.exitCode = 1;
    return;
  }
  const email = parsedEmail.data;

  const prisma = new PrismaClient();
  try {
    const emailHash = blindIndex(email);
    const existing = await prisma.account.findUnique({ where: { emailHash } });

    if (existing && existing.role !== 'ADMIN') {
      console.error('Эта почта уже занята учётной записью другой роли.');
      process.exitCode = 1;
      return;
    }

    await prisma.account.upsert({
      where: { emailHash },
      update: { isActive: true },
      create: { role: 'ADMIN', emailEnc: encrypt(email), emailHash, emailVerifiedAt: new Date() },
    });

    console.log(
      existing
        ? `\nУчётная запись ${email} включена.`
        : `\nУчётная запись сотрудника ${email} создана — без пароля.`,
    );
    console.log('Входить в панель — только через CRM (вход по билету). Права на разделы выдаёт CRM.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Не удалось:', error);
  process.exitCode = 1;
});
