/**
 * Первая настройка боевой базы: организация и приглашение владельцу.
 *
 * Чем отличается от setup-real.ts. Тот стирает базу целиком и создан для
 * разработки. Этот не удаляет ничего и отказывается работать, если в базе
 * уже есть организация или пользователь: повторный запуск на живых данных
 * не может им навредить.
 *
 * Ссылка-приглашение нигде не печатается. Она даёт доступ владельца, а всё,
 * что скрипт выводит, оседает в журналах сервера и в чужих терминалах.
 * Ссылка уходит только письмом — командой `send`.
 *
 *   create          завести организацию и приглашение
 *   send            отправить владельцу письмо со ссылкой
 *   send --dry-run  проверить вход в почту и показать письмо без ссылки,
 *                   ничего не отправляя
 *   ensure          то и другое по необходимости: пустая база — завести,
 *                   письмо ещё не уходило — отправить. Запускается при
 *                   каждом старте сервера (служба owner-bootstrap в
 *                   docker-compose), поэтому повторный запуск ничего
 *                   не повторяет: факт отправки записан в ActivityLog
 *
 * Письмо шлём напрямую через nodemailer, а не через getEmailTransport():
 * тот проглатывает ошибки. Для писем из действий пользователя это верно —
 * недоставленное уведомление не должно ронять «отказать кандидату», —
 * а здесь письмо единственный способ получить ссылку, и о сбое нужно
 * узнать сразу, а не через неделю по тишине.
 *
 * Запуск на сервере (SMTP_URL, DATABASE_URL и остальное приходят из
 * /etc/fhr.env, dotenv в боевом образе нет, поэтому tsx без -r):
 *   docker compose run --rm worker npx tsx scripts/bootstrap-owner.ts create
 */
import { randomBytes } from "node:crypto";

import { createTransport } from "nodemailer";

import { prismaRaw as db } from "../lib/db/prisma";
import { brandedEmail } from "../lib/notifications/email-brand";
import { appOrigin } from "../lib/urls";

const ORG_NAME = "Fattakhov HR Agency";
const OWNER_EMAIL = "profattakhov@gmail.com";
/** Как у createInvitation() в lib/services/invitations.ts. */
const INVITE_TTL_DAYS = 7;

/** Ожидаемый отказ: печатаем причину без стека и выходим с кодом 1. */
class Refusal extends Error {}

const moscow = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  dateStyle: "long",
  timeStyle: "short",
});

/** Адрес для журнала: достаточно, чтобы узнать, и мало, чтобы разослать. */
function mask(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function create() {
  // prismaRaw считает и удалённых мягко пользователей: «в базе кто-то был»
  // достаточно, чтобы отказаться
  const [organizations, users] = await Promise.all([
    db.organization.count(),
    db.user.count(),
  ]);
  if (organizations > 0 || users > 0) {
    throw new Refusal(
      `В базе уже есть данные (организаций: ${organizations}, пользователей: ${users}). ` +
        "Скрипт заводит только первую организацию и ничего не трогает.",
    );
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  // Одной транзакцией: оборвись запуск между двумя записями, организация
  // осталась бы без приглашения, а повторный запуск отказал бы — «уже есть»
  await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
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

    // Автора у приглашения нет: звать первого владельца некому
    await tx.invitation.create({
      data: {
        organizationId: organization.id,
        email: OWNER_EMAIL,
        role: "OWNER",
        token,
        expiresAt,
      },
    });
  });

  console.log(`Организация «${ORG_NAME}» создана.`);
  console.log(
    `Приглашение для ${mask(OWNER_EMAIL)} действует до ${moscow.format(expiresAt)} (МСК).`,
  );
  console.log("Ссылка нигде не выводится: она уйдёт письмом, команда `send`.");
}

/** Отметка «письмо владельцу ушло» — чтобы ensure не слал его на каждом старте. */
const SENT_ACTION = "owner_invitation_sent";

async function send(dryRun: boolean): Promise<boolean> {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.SMTP_FROM;
  if (!smtpUrl || !from) {
    throw new Refusal("Не заданы SMTP_URL и SMTP_FROM: отправлять нечем.");
  }

  const invite = await db.invitation.findFirst({
    where: { email: OWNER_EMAIL, role: "OWNER" },
    orderBy: { createdAt: "desc" },
    select: { token: true, expiresAt: true, acceptedAt: true },
  });
  if (!invite) {
    throw new Refusal("Приглашения владельца в базе нет. Сначала `create`.");
  }
  if (invite.acceptedAt) {
    // Не сбой: владелец уже вошёл, письмо ему ни к чему
    console.log("Приглашение уже принято, письмо не нужно.");
    return false;
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new Refusal(
      "Приглашение истекло, письмо со старой ссылкой бесполезно. " +
        "Нужно завести новое.",
    );
  }

  const link = `${appOrigin()}/invite/${invite.token}`;
  const body = (shownLink: string) =>
    [
      "Здравствуйте!",
      "",
      "Кабинет Fattakhov HR запущен, и вы в нём владелец. Чтобы войти, откройте " +
        "ссылку, укажите своё имя и придумайте пароль:",
      "",
      shownLink,
      "",
      `Ссылка одноразовая, действует до ${moscow.format(invite.expiresAt)} по московскому времени. ` +
        "Она даёт полный доступ к кабинету, поэтому никому её не пересылайте.",
      "",
      `Потом входить нужно по адресу ${appOrigin()}/login с этой почтой и вашим паролем.`,
      "",
      "Если вы не ждали это письмо, просто не открывайте ссылку.",
    ].join("\n");
  const subject = "Приглашение в кабинет Fattakhov HR";

  const transporter = createTransport(smtpUrl);
  try {
    if (dryRun) {
      // verify() открывает соединение и входит под тем же логином:
      // неверный пароль или порт проявятся здесь, а не в момент отправки
      await transporter.verify();
      console.log("Почта: соединение и вход проверены, ничего не отправлено.");
      console.log(`От: ${from}`);
      console.log(`Кому: ${mask(OWNER_EMAIL)}`);
      console.log(`Тема: ${subject}\n`);
      console.log(body("<ссылка скрыта>"));
      return false;
    }

    const info = await transporter.sendMail({
      from,
      to: OWNER_EMAIL,
      subject,
      text: body(link),
      html: brandedEmail({
        title: subject,
        preview: "Кабинет Fattakhov HR запущен — вы в нём владелец",
        heading: "Кабинет Fattakhov HR запущен",
        paragraphs: [
          "Здравствуйте!",
          "Вы в нём владелец. Чтобы войти, откройте ссылку, укажите своё имя и придумайте пароль.",
        ],
        action: { href: link, label: "Войти в кабинет" },
        note:
          `Ссылка одноразовая, действует до ${moscow.format(invite.expiresAt)} по московскому времени. ` +
          "Она даёт полный доступ к кабинету, поэтому никому её не пересылайте.\n" +
          `Потом входить нужно по адресу ${appOrigin()}/login с этой почтой и вашим паролем. ` +
          "Если вы не ждали это письмо, просто не открывайте ссылку.",
      }),
    });
    if (info.accepted.length === 0 || info.rejected.length > 0) {
      throw new Error(
        `Почтовый сервер не принял письмо: принято ${info.accepted.length}, отклонено ${info.rejected.length}. ${info.response}`,
      );
    }
    console.log(`Письмо для ${mask(OWNER_EMAIL)} принято почтовым сервером.`);
    console.log(`Ответ сервера: ${info.response}`);
    return true;
  } finally {
    transporter.close();
  }
}

/**
 * Без ручных команд на сервере: входа по SSH туда нет, а первый владелец
 * нужен сразу после выкатки на пустую базу.
 */
async function ensure() {
  const [organizations, users] = await Promise.all([
    db.organization.count(),
    db.user.count(),
  ]);
  if (organizations === 0 && users === 0) await create();

  const invite = await db.invitation.findFirst({
    where: { email: OWNER_EMAIL, role: "OWNER" },
    orderBy: { createdAt: "desc" },
    select: { id: true, organizationId: true, acceptedAt: true, expiresAt: true },
  });
  // База не пустая и не нами заведена, или владелец уже вошёл, или срок
  // вышел — во всех трёх случаях слать нечего, и это не сбой старта
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() <= Date.now()) {
    console.log("Владельцу ничего отправлять не нужно.");
    return;
  }
  const alreadySent = await db.activityLog.count({
    where: { entityType: "Invitation", entityId: invite.id, action: SENT_ACTION },
  });
  if (alreadySent > 0) {
    console.log("Письмо владельцу уже уходило, повторно не отправляю.");
    return;
  }

  if (await send(false)) {
    await db.activityLog.create({
      data: {
        organizationId: invite.organizationId,
        entityType: "Invitation",
        entityId: invite.id,
        action: SENT_ACTION,
      },
    });
  }
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (command === "create") return create();
  if (command === "send") return void (await send(flags.includes("--dry-run")));
  if (command === "ensure") return ensure();
  throw new Refusal("Команда: create | send [--dry-run] | ensure");
}

main()
  .catch((error) => {
    console.error(error instanceof Refusal ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
