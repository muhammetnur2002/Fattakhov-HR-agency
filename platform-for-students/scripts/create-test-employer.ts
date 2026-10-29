import { PrismaClient } from '@prisma/client';
import { blindIndex, encrypt } from '../lib/security/crypto';

// Manual provisioning only. Not part of the normal build or application routes.
// Run with the verified test environment loaded and --apply to create the account.
const testOrigin = 'https://fattakhov-hr-agency-96ge.vercel.app';
const email = 'employer.demo@example.com';

async function main() {
  if (process.env.APP_URL !== testOrigin) throw new Error('Expected the student test APP_URL.');
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const expectedTarget = process.env.CONFIRMED_TEST_DATABASE;
  if (!expectedTarget || `${databaseUrl.hostname}${databaseUrl.pathname}` !== expectedTarget) {
    throw new Error('CONFIRMED_TEST_DATABASE must match the independently verified test host/database.');
  }
  if (!process.env.PII_ENCRYPTION_KEY || process.env.PII_ENCRYPTION_KEY.length < 32) {
    throw new Error('The existing test encryption key is required.');
  }
  const prisma = new PrismaClient();
  try {
    const emailHash = blindIndex(email);
    const existing = await prisma.account.findUnique({ where: { emailHash }, select: { id: true } });
    if (existing) {
      console.log('This email already exists; no profile or password was changed.');
      return;
    }
    if (!process.argv.includes('--apply')) {
      console.log('Read-only check passed. No account created; use --apply after verifying the target.');
      return;
    }
    const passwordHash = process.env.TEST_DEMO_PASSWORD_HASH;
    if (!passwordHash || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
      throw new Error('A bcrypt cost-12 hash of the generated demo password is required.');
    }
    await prisma.account.create({
      data: {
        role: 'EMPLOYER',
        emailEnc: encrypt(email),
        emailHash,
        passwordHash,
        emailVerifiedAt: new Date(),
        employer: {
          create: {
            companyName: 'Демо-компания — Тестовый работодатель',
            contactName: 'Демо-представитель',
            city: 'Казань',
            about: 'Вымышленная компания для проверки кабинета работодателя на тестовой платформе.',
            moderationStatus: 'PENDING',
            crmActive: false,
          },
        },
      },
    });
    console.log(JSON.stringify({ created: true, loginUrl: `${testOrigin}/login`, email }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Prisma errors may include database connection details: do not dump them.
  console.error('Demo provisioning stopped. Check the verified test environment and account availability.');
  process.exitCode = 1;
});
