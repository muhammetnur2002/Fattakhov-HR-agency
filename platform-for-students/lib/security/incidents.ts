import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma-client';
import { encrypt, decrypt } from './crypto';
import { clientIp } from './rate-limit';
import { requireRoleWithAccount } from './guards';
import { HttpError } from './http-error';
import { incidentNeedsEmail, retryDelay, securityAccessFor, type IncidentKind } from './incident-policy';
import { sendMail } from '@/lib/mail/transport';

export async function securityAccess() {
  const { session, account } = await requireRoleWithAccount('ADMIN');
  const access = securityAccessFor(account.role, decrypt(account.emailEnc), process.env.CHAT_SECURITY_OWNER_EMAIL, process.env.CHAT_SECURITY_DELEGATE_EMAILS);
  return { session, access };
}

export async function requireSecurityAccess() {
  const result = await securityAccess();
  if (!result.access) throw new HttpError(403, 'Доступ к журналу безопасности не выдан', 'FORBIDDEN');
  return result;
}

/** Server-only caller must first authorize the sender's membership and write access.
 * Evidence and notification job are committed together, never swallowed on failure.
 * No raw files, message bodies, passwords or provider responses in this journal.
 */
export async function recordSecurityIncident(input: {
  kind: IncidentKind; accountId: string; threadId: string; contentHash: string;
  rule: string; headers: Headers;
}) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: input.accountId } });
  const dedupeKey = createHash('sha256').update(JSON.stringify([
    input.kind, input.accountId, input.threadId, input.contentHash, input.rule,
  ])).digest('hex');
  const evidenceEnc = encrypt(JSON.stringify({
    accountId: account.id, role: account.role, email: decrypt(account.emailEnc),
    ip: clientIp(input.headers), threadId: input.threadId,
    contentHash: input.contentHash, rule: input.rule, observedAt: new Date().toISOString(),
  }));
  return prisma.securityIncident.upsert({
    where: { dedupeKey }, update: {}, create: {
      dedupeKey, kind: input.kind, accountId: account.id, evidenceEnc,
      ...(incidentNeedsEmail(input.kind) ? { mail: { create: {} } } : {}),
    }, select: { id: true },
  });
}

/** A lease prevents simultaneous cron/manual workers claiming the same item.
 * At-least-once delivery: an SMTP success followed by a DB outage can repeat a mail.
 */
export async function deliverSecurityAlerts() {
  const to = process.env.CHAT_SECURITY_OWNER_EMAIL?.trim();
  if (!to || !process.env.DATABASE_URL || !process.env.SMTP_URL || !process.env.SMTP_FROM) return { sent: 0, configured: false };
  const now = new Date();
  const jobs = await prisma.securityMail.findMany({ where: { sentAt: null, availableAt: { lte: now } }, take: 20, orderBy: { availableAt: 'asc' } });
  let sent = 0;
  for (const job of jobs) {
    const leaseToken = randomUUID();
    const claimed = await prisma.securityMail.updateMany({
      where: { id: job.id, sentAt: null, availableAt: { lte: now } },
      data: { leaseToken, availableAt: new Date(Date.now() + 300_000), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    let delivered = false;
    try {
      delivered = await sendMail({ to, subject: 'Платформа: файл заблокирован проверкой безопасности',
        html: '<p>Файл заблокирован проверкой безопасности. Откройте раздел «Безопасность» в панели HR студенческой платформы. Автоматической блокировки аккаунта нет.</p>',
        text: `Зафиксирован инцидент ${job.incidentId}. Откройте раздел «Безопасность» в панели HR студенческой платформы. Вложение не доставлено. Проверьте событие перед принятием решения; автоматической блокировки аккаунта нет.` });
    } catch { /* Keep the durable job for retry without logging sensitive errors. */ }
    await prisma.securityMail.updateMany({ where: { id: job.id, leaseToken }, data: {
      leaseToken: null, ...(delivered ? { sentAt: new Date() } : { availableAt: new Date(Date.now() + retryDelay(job.attempts)) }),
    } });
    if (delivered) sent++;
  }
  return { sent, configured: true };
}

export async function decideSecurityIncident(incidentId: string, action: 'reviewed' | 'suspend' | 'restore', reason: string) {
  const { session } = await requireSecurityAccess();
  return prisma.$transaction(async tx => {
    // Serializes decisions for one incident so retries cannot race a restore.
    await tx.$queryRaw`SELECT "id" FROM "SecurityIncident" WHERE "id" = ${incidentId} FOR UPDATE`;
    const incident = await tx.securityIncident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new HttpError(404, 'Событие не найдено', 'NOT_FOUND');
    if (action !== 'reviewed') {
      if (incident.kind !== 'MALWARE') throw new HttpError(400, 'Для ссылок блокировка аккаунта не применяется', 'INVALID_ACTION');
      const account = await tx.account.findUnique({ where: { id: incident.accountId } });
      // Security journal never disables staff/owner accounts or touches CRM.
      if (!account || account.role === 'ADMIN') throw new HttpError(400, 'Это действие недоступно для этой учётной записи', 'INVALID_ACTION');
      await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;
      const currentAccount = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      const last = await tx.securityDecision.findFirst({ where: { incidentId, action: { in: ['suspend', 'restore'] } }, orderBy: { createdAt: 'desc' } });
      if (action === 'restore' && last?.action !== 'suspend') throw new HttpError(409, 'Нет блокировки по этому событию', 'CONFLICT');
      if (action === 'suspend' && !currentAccount.isActive) throw new HttpError(409, 'Аккаунт уже отключён', 'CONFLICT');
      if (action === 'restore' && currentAccount.isActive) throw new HttpError(409, 'Доступ уже восстановлен', 'CONFLICT');
      await tx.account.update({ where: { id: account.id }, data: { isActive: action === 'restore', sessionsRevokedAt: new Date() } });
    }
    await tx.securityDecision.create({ data: { incidentId, operatorId: session.accountId, action, reasonEnc: encrypt(reason) } });
    return { saved: true };
  });
}
