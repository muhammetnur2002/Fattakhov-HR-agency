/**
 * Временные учётки для прогона вакансии ассистентом.
 *
 * Нужны, потому что пароль владельца знает только владелец. Учётки
 * помечены в имени, чтобы их было видно в списке и не забыть удалить:
 *   npx tsx -r dotenv/config scripts/test-accounts.ts --remove
 */
import { prismaRaw as db } from "../lib/db/prisma";
import { createInvitation } from "../lib/services/invitations";

const AGENCY_EMAIL = "claude.recruiter@test.local";
const CLIENT_EMAIL = "claude.client@test.local";

async function remove() {
  const emails = [AGENCY_EMAIL, CLIENT_EMAIL];
  await db.invitation.deleteMany({ where: { email: { in: emails } } });
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await db.commentRead.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    // Личная переписка ссылается на автора и получателя без каскада:
    // сообщение переживает удаление собеседника только вместе с ним,
    // иначе останется строка, которую некому показать
    await db.directMessage.deleteMany({
      where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`Удалено учёток: ${ids.length}`);
}

async function main() {
  if (process.argv.includes("--remove")) {
    await remove();
    return;
  }

  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error("Организация не найдена");

  const owner = await db.user.findFirst({
    where: { role: "OWNER" },
    select: { id: true },
  });
  if (!owner) throw new Error("Владелец не найден");

  const client = await db.client.findFirst({ select: { id: true, name: true } });
  if (!client) throw new Error("Клиент не найден");

  // Повторный запуск не должен упираться в проверку занятости
  await remove();

  const agencyToken = await createInvitation({
    organizationId: org.id,
    email: AGENCY_EMAIL,
    role: "RECRUITER",
    createdById: owner.id,
  });

  const clientToken = await createInvitation({
    organizationId: org.id,
    email: CLIENT_EMAIL,
    role: "CLIENT_ADMIN",
    clientId: client.id,
    createdById: owner.id,
  });

  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  console.log(`\nРекрутер:  ${base}/invite/${agencyToken}`);
  console.log(`Клиент (${client.name}): ${base}/invite/${clientToken}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
