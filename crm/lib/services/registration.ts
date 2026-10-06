import { randomInt } from "node:crypto";

import type { Actor } from "@/lib/access";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { maskPhone, normalizeRuPhone, PhoneFormatError } from "@/lib/auth/phone";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import { REGISTRATION_CONSENT_VERSION } from "@/lib/legal/registration-consent";
import { mailLimitMessage, reserveMail } from "@/lib/security/mail-limit";
import { getEmailTransport } from "@/lib/notifications/channels";
import { isDeliverableEmail } from "@/lib/notifications/deliverable";
import { brandedEmail } from "@/lib/notifications/email-brand";
import {
  assertEmailAvailable,
  EmailConfirmError,
  requestEmailConfirmation,
} from "@/lib/services/email-confirmation";
import { completeLeadFromBrief, createLead } from "@/lib/services/leads";
import { createVacancyDraft } from "@/lib/services/vacancies";
import type { BriefInput } from "@/lib/validation/registration";

export class RegistrationError extends Error {}

/** Код живёт 15 минут — этого хватает, чтобы дойти до почты и вернуться. */
const CODE_TTL_MINUTES = 15;

/** После стольких неверных попыток заявка гасится — код нужно запросить заново. */
const MAX_ATTEMPTS = 5;

/**
 * Название компании здесь не собирается — как и на студенческой платформе,
 * это отдельный шаг после входа: анкета в /onboarding
 * (completeRegistrationBrief ниже). Иначе форма регистрации превращается
 * в анкету, а самый частый повод отвалиться посреди неё — необязательные поля.
 */
export const COMPANY_NAME_PLACEHOLDER = "Название компании не указано";

/**
 * Имя контакта до анкеты — по той же причине. Анкета не подставляет его
 * в поле «ФИО» готовым ответом (isPlaceholderName): предлагать подтвердить
 * заглушку — значит получить её в кабинете навсегда.
 */
export const CONTACT_NAME_PLACEHOLDER = "Представитель компании";

function generateCode(): string {
  // 6 цифр, старший разряд не ноль незачем — "042817" читается и вводится
  // ровно так же, как "142817"
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Запрос на самостоятельную регистрацию компании: экран 1.
 *
 * Пароль хешируется уже здесь — plaintext не переживает один запрос.
 * Прежние неиспользованные заявки на этот адрес гасятся: иначе на руках
 * оказывается несколько кодов сразу, и непонятно, какой из них верный.
 */
export async function requestCompanyRegistration(params: {
  email: string;
  phone: string;
  password: string;
  ip?: string | null;
}): Promise<void> {
  const email = params.email.toLowerCase().trim();

  // Не больше трёх писем в час на адрес и пауза минута — ДО проверки, занят
  // ли он: отказ по лимиту должен быть одинаковым для любого адреса, иначе
  // сам лимит стал бы способом узнать, кто зарегистрирован. Лимит по IP
  // (guardRate в действии) ящик жертвы не защищает — адрес меняют
  const reserved = await reserveMail("register", email);
  if (!reserved.allowed) throw new RegistrationError(mailLimitMessage(reserved));

  const taken = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true },
  });
  if (taken) {
    // Кому именно принадлежит адрес — не сообщаем: в отличие от приглашения,
    // эту форму заполняет аноним, и раскрывать имя владельца ему нельзя
    throw new RegistrationError(
      "Этот email уже зарегистрирован. Войдите или восстановите пароль.",
    );
  }

  await prisma.pendingClientRegistration.updateMany({
    where: { email, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateCode();
  const [passwordHash, codeHash] = await Promise.all([
    hashPassword(params.password),
    hashPassword(code),
  ]);

  await prisma.pendingClientRegistration.create({
    data: {
      email,
      phone: params.phone,
      passwordHash,
      codeHash,
      consentVersion: REGISTRATION_CONSENT_VERSION,
      consentAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      requestedIp: params.ip ?? null,
    },
  });

  await getEmailTransport().send({
    to: email,
    subject: "Код подтверждения регистрации",
    text: [
      "Код для завершения регистрации в CRM Fattakhov HR:",
      "",
      code,
      "",
      `Код действует ${CODE_TTL_MINUTES} минут.`,
      "",
      "Если вы не запрашивали регистрацию, просто удалите письмо.",
    ].join("\n"),
    html: brandedEmail({
      title: "Код подтверждения регистрации",
      preview: `Код для завершения регистрации: ${code}`,
      heading: "Код подтверждения",
      paragraphs: ["Код для завершения регистрации в CRM Fattakhov HR:"],
      code,
      note:
        `Код действует ${CODE_TTL_MINUTES} минут. ` +
        "Если вы не запрашивали регистрацию, просто удалите письмо.",
    }),
  });
}

export type RegistrationResult = { email: string };

/**
 * Подтверждение кода: экран 2. Создаёт Client (LEAD, без договора) и
 * пользователя CLIENT_ADMIN одной транзакцией.
 */
export async function confirmCompanyRegistration(params: {
  email: string;
  code: string;
}): Promise<RegistrationResult> {
  const email = params.email.toLowerCase().trim();

  const pending = await prisma.pendingClientRegistration.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) {
    throw new RegistrationError(
      "Код устарел или уже использован. Запросите регистрацию заново.",
    );
  }

  // Попытка занимается ДО сверки кода одним условным UPDATE и считается
  // по числу затронутых строк: прежнее «прочитать счётчик, сверить, потом
  // прибавить» под одновременными запросами пропускало все двадцать —
  // каждый видел «попыток 0», а каждая сверка стоит argon2. Сверка
  // возможна только у запроса, которому попытка досталась
  const reserved = await prisma.pendingClientRegistration.updateMany({
    where: { id: pending.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count !== 1) {
    // Попытки кончились — код больше не принимается; заявку не гасим:
    // гасить её здесь значило бы отнять победу у запроса, который уже
    // занял попытку с верным кодом. Новый запрос регистрации заменит её сам
    throw new RegistrationError(
      "Слишком много попыток. Запросите регистрацию заново.",
    );
  }

  const ok = await verifyPassword(pending.codeHash, params.code);
  if (!ok) {
    throw new RegistrationError("Код не подошёл. Проверьте письмо.");
  }

  // Та же гонка, что и при приёме приглашения: адрес заняли, пока человек
  // вводил код из письма
  const taken = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true },
  });
  if (taken) {
    throw new RegistrationError(
      "Этот email уже зарегистрирован. Войдите или восстановите пароль.",
    );
  }

  const organization = await prisma.organization.findFirst({
    select: { id: true },
  });
  if (!organization) {
    throw new RegistrationError("Регистрация временно недоступна");
  }

  const client = await prisma.$transaction(async (tx) => {
    // Одноразовость — условием в самом UPDATE и первым действием: два
    // запроса с верным кодом одновременно завели бы две компании.
    // Проигравший откатывается вместе со всем, что успел
    const spent = await tx.pendingClientRegistration.updateMany({
      where: { id: pending.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (spent.count !== 1) {
      throw new RegistrationError(
        "Код устарел или уже использован. Запросите регистрацию заново.",
      );
    }

    const client = await tx.client.create({
      data: {
        organizationId: organization.id,
        name: COMPANY_NAME_PLACEHOLDER,
        status: "LEAD",
        fromStudentsPlatform: false,
        // Кабинет уведёт на анкету (/onboarding) — так же, как после
        // регистрации по телефону
        selfRegisteredAt: new Date(),
      },
      select: { id: true },
    });

    await tx.user.create({
      data: {
        organizationId: organization.id,
        clientId: client.id,
        email,
        phone: pending.phone,
        // Настоящее имя контакта тоже собирается после входа — тем же
        // шагом, что и название компании
        fullName: CONTACT_NAME_PLACEHOLDER,
        role: "CLIENT_ADMIN",
        passwordHash: pending.passwordHash,
      },
    });

    return client;
  });

  // Заявка во «Входящих» — как у регистрации по телефону:
  // после анкеты в неё допишутся компания и вакансия, и тогда же агентство
  // получит оповещение (completeLeadFromBrief). Согласие — того экрана, где
  // поставили галочку (версия, момент и адрес из заявки на регистрацию),
  // а не этого подтверждения кода.
  //
  // Сбой здесь регистрацию не отменяет: кабинет уже заведён, а само
  // согласие записано в заявке на регистрацию (PendingClientRegistration) —
  // человеку незачем получать ошибку за нашу вторую копию
  try {
    await createLead(
      {
        name: email,
        company: null,
        website: null,
        contact: `${email}, ${pending.phone}`,
        vacancies: null,
        note: "Зарегистрировался по почте, анкету ещё заполняет",
        marketingConsent: false,
      },
      { ip: pending.requestedIp },
      {
        clientId: client.id,
        notify: false,
        consentVersion: pending.consentVersion,
        consentAt: pending.consentAt,
      },
    );
  } catch (error) {
    console.error("[регистрация] заявка во «Входящих» не заведена", error);
  }

  return { email };
}

export class BriefError extends Error {}

/**
 * Нужна ли компании анкета после входа.
 *
 * Только самостоятельно зарегистрированным и только один раз. Заведённым
 * агентством она не нужна: их данные вносит агентство.
 */
export function needsBrief(client: {
  selfRegisteredAt: Date | null;
  briefCompletedAt: Date | null;
}): boolean {
  return client.selfRegisteredAt !== null && client.briefCompletedAt === null;
}

/**
 * Имя в учётке — ещё заглушка, а не то, что человек назвал сам.
 *
 * У вошедших по телефону до анкеты имя — это маска номера, у
 * зарегистрированных по почте — «Представитель компании»; подставлять
 * такое в поле «ФИО» как готовый ответ значит предлагать подтвердить
 * бессмыслицу.
 */
export function isPlaceholderName(user: {
  fullName: string;
  phoneVerified: string | null;
}): boolean {
  if (user.fullName === CONTACT_NAME_PLACEHOLDER) return true;
  return Boolean(user.phoneVerified) && user.fullName === maskPhone(user.phoneVerified!);
}

/**
 * Анкета после регистрации: компания, контакт, кого ищут.
 *
 * Одним вызовом в конце, а не сохранением по шагу: промежуточные ответы
 * живут в браузере, а в базу попадает только согласованный набор — иначе
 * брошенная на третьем вопросе анкета оставила бы компанию с названием,
 * но без контакта, и уже без экрана анкеты (он показывается, пока она
 * не пройдена целиком).
 *
 * Повторная отправка (два нажатия, две вкладки) — не ошибка: второй вызов
 * видит пройденную анкету и ничего не делает.
 */
export async function completeRegistrationBrief(
  actor: Actor,
  input: BriefInput,
): Promise<void> {
  if (!actor.clientId) throw new BriefError("Учётка не привязана к компании");

  const [client, user] = await Promise.all([
    prisma.client.findFirst({
      where: { id: actor.clientId },
      select: { selfRegisteredAt: true, briefCompletedAt: true },
    }),
    prisma.user.findFirst({
      where: { id: actor.id },
      select: { email: true, phone: true, phoneVerified: true },
    }),
  ]);
  if (!client || !user) throw new BriefError("Компания не найдена");
  if (!needsBrief(client)) return;

  // Телефон агентству нужен всегда. У вошедших по номеру он проверен,
  // у зарегистрированных по почте назван на первом экране регистрации
  let phone = user.phoneVerified ?? user.phone;
  if (input.phone) {
    try {
      phone = normalizeRuPhone(input.phone);
    } catch (error) {
      if (error instanceof PhoneFormatError) throw new BriefError(error.message);
      throw error;
    }
  }
  if (!phone) {
    throw new BriefError("Укажите телефон — агентство позвонит, чтобы обсудить подбор");
  }

  // Почта — только вместо заглушки. У зарегистрированных по почте адрес
  // проверен кодом из письма, и менять его анкетой мы не даём. Названный
  // здесь адрес рабочим не становится: сначала ссылка из письма на него
  // (lib/services/email-confirmation.ts) — иначе опечатка отдала бы
  // постороннему уведомления о кандидатах, а через сброс пароля и кабинет
  let pendingEmail: string | undefined;
  if (input.email && !isDeliverableEmail(user.email)) {
    try {
      await assertEmailAvailable(actor.organizationId, actor.id, input.email);
    } catch (error) {
      if (error instanceof EmailConfirmError) {
        throw new BriefError(
          "Этот адрес уже привязан к другому кабинету. Укажите другой или оставьте поле пустым",
        );
      }
      throw error;
    }
    pendingEmail = input.email;
  }

  const completed = await prismaRaw.$transaction(async (tx) => {
    const { count } = await tx.client.updateMany({
      where: { id: actor.clientId!, briefCompletedAt: null },
      data: {
        name: input.company,
        city: input.city ?? null,
        briefCompletedAt: new Date(),
      },
    });
    if (count === 0) return false;

    await tx.user.update({
      where: { id: actor.id },
      data: {
        fullName: input.name,
        position: input.position ?? null,
        phone,
      },
    });
    return true;
  });
  if (!completed) return;

  // Не роняет анкету: письмо можно отправить заново из настроек
  if (pendingEmail) {
    try {
      await requestEmailConfirmation({
        userId: actor.id,
        organizationId: actor.organizationId,
        email: pendingEmail,
      });
    } catch (error) {
      console.error("[анкета] письмо для подтверждения почты не отправлено", error);
    }
  }

  // Черновик заявки на подбор: не роняет анкету при сбое, а завести заявку
  // человек может и сам — мастер в кабинете тот же
  try {
    await createVacancyDraft(actor, actor.clientId, {
      title: input.vacancyTitle,
      city: input.city,
      salaryFrom: input.salaryFrom,
      salaryTo: input.salaryTo,
    });
  } catch (error) {
    console.error("[анкета] черновик вакансии не создан", error);
  }

  const contact = [
    phone,
    pendingEmail
      ? `${pendingEmail} (ещё не подтверждена)`
      : isDeliverableEmail(user.email)
        ? user.email
        : null,
  ]
    .filter(Boolean)
    .join(", ");
  const salary =
    input.salaryFrom || input.salaryTo
      ? `, вилка ${input.salaryFrom ?? "…"}–${input.salaryTo ?? "…"} ₽`
      : "";

  await completeLeadFromBrief(actor.clientId, {
    name: input.position ? `${input.name}, ${input.position}` : input.name,
    company: input.company,
    contact,
    note: `Зарегистрировался сам. Ищет: ${input.vacancyTitle}${input.city ? `, ${input.city}` : ""}${salary}`,
  });
}
