import { z } from 'zod';
import { createPrismaStore } from '../lib/db/prisma-store';
import { prisma } from '../lib/db/prisma-client';
import { blindIndex, encrypt } from '../lib/security/crypto';

const rowSchema = z.object({
  crmClientId: z.string().min(1),
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  active: z.boolean(),
  industry: z.string().nullable(),
  phone: z.string().nullable(),
});

async function main() {
  if (process.env.APP_URL !== 'https://fattakhov-hr-agency-96ge.vercel.app') {
    throw new Error('Not the test student project.');
  }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (`${url.hostname}${url.pathname}` !== process.env.CONFIRMED_TEST_DATABASE) {
    throw new Error('Test database identity has not been confirmed.');
  }
  if (!process.env.PII_ENCRYPTION_KEY || process.env.PII_ENCRYPTION_KEY.length < 32) {
    throw new Error('Existing encryption key is required.');
  }
  const rows = z.array(rowSchema).max(100).parse(JSON.parse(
    Buffer.from(process.env.TEST_EMPLOYERS_BASE64 ?? '', 'base64').toString('utf8'),
  ));
  const store = createPrismaStore();
  // Check all collisions before creating anything. Never merge unrelated identities.
  for (const row of rows) {
    const employer = await store.employers.findByCrmClientId(row.crmClientId);
    const account = await prisma.account.findUnique({ where: { emailHash: blindIndex(row.contactEmail) } });
    if (account && account.id !== employer?.accountId) throw new Error('Contact email collision.');
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ checked: rows.length, changed: 0 }));
    return;
  }
  let created = 0;
  for (const row of rows) {
    const before = await store.employers.findByCrmClientId(row.crmClientId);
    // Reuse the same mechanism as /api/service/employer/ensure.
    const employer = await store.employers.ensureForCrmClient(row);
    if (!before) created++;
    // Only fill empty fields; preserve the student's existing profile and files.
    if (row.industry) await prisma.employer.updateMany({
      where: { id: employer.id, industry: null }, data: { industry: row.industry },
    });
    if (row.phone) await prisma.employer.updateMany({
      where: { id: employer.id, phoneEnc: null }, data: { phoneEnc: encrypt(row.phone) },
    });
    if (!before && !row.active) await store.employers.setModeration(employer.id, { status: 'PENDING', note: null });
  }
  console.log(JSON.stringify({ migrated: rows.length, created }));
}

main().catch(() => {
  console.error('Test import stopped; verify the target, input, and account collisions. No CRM writes are performed.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
