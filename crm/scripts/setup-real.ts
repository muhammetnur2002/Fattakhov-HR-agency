/**
 * Подготовка чистой базы для работы с реальными данными.
 *
 * Отличие от seed: не создаёт выдуманных клиентов и кандидатов. Только
 * организация и приглашение владельцу — дальше всё заводится руками,
 * как в жизни.
 *
 * Пароль здесь не задаётся намеренно: владелец получает такую же
 * ссылку-приглашение, как любой другой пользователь, и задаёт пароль
 * сам. Заодно это проверяет флоу приглашения по-настоящему.
 *
 * Запуск: npm run setup:real
 */
import { randomBytes } from "node:crypto";

import { prismaRaw as db } from "../lib/db/prisma";

const ORG_NAME = "Fattakhov HR Agency";
const OWNER_EMAIL = "profattakhov@gmail.com";


async function wipe() {
  // Порядок важен: сначала зависимые таблицы
  await db.personalDataAccessLog.deleteMany();
  await db.activityLog.deleteMany();
  await db.notification.deleteMany();
  await db.commentRead.deleteMany();
  await db.comment.deleteMany();
  await db.interviewSlot.deleteMany();
  await db.interview.deleteMany();
  await db.attachment.deleteMany();
  await db.stageTransition.deleteMany();
  await db.application.deleteMany();
  await db.candidate.deleteMany();
  await db.pipelineStage.deleteMany();
  await db.invoice.deleteMany();
  await db.vacancy.deleteMany();
  await db.agreement.deleteMany();
  await db.invitation.deleteMany();
  await db.user.deleteMany();
  await db.client.deleteMany();
  await db.organization.deleteMany();
}

async function main() {
  const confirmed = process.env.WIPE_DEV_DB === "yes";
  if (!confirmed) {
    console.error(
      "Скрипт стирает базу разработки целиком.\n" +
        "Если это то, что нужно: WIPE_DEV_DB=yes npm run setup:real\n" +
        "Вернуть тестовые данные потом: npm run db:seed",
    );
    process.exit(1);
  }

  console.log("Очищаю базу разработки…");
  await wipe();

  const organization = await db.organization.create({
    data: {
      name: ORG_NAME,
      settings: {
        timezone: "Europe/Moscow",
        workingHours: { start: "09:00", end: "19:00" },
        workingDays: [1, 2, 3, 4, 5],
      },
    },
    select: { id: true },
  });

  // Владелец заводится приглашением, как все: пароль он задаёт сам,
  // и никто, включая этот скрипт, его не знает.
  //
  // Автора у приглашения нет — звать первого владельца некому.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.invitation.create({
    data: {
      organizationId: organization.id,
      email: OWNER_EMAIL,
      role: "OWNER",
      token,
      expiresAt,
    },
  });

  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";

  console.log(`\nОрганизация «${ORG_NAME}» создана.`);
  console.log("\nСсылка для входа владельца (действует 7 дней):");
  console.log(`\n  ${baseUrl}/invite/${token}\n`);
  console.log("По ней вы задаёте пароль и попадаете в кабинет агентства.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
