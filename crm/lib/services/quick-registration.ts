import { maskPhone } from "@/lib/auth/phone";
import { isUniqueViolation } from "@/lib/db/errors";
import { prisma, prismaRaw } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { REGISTRATION_CONSENT_VERSION } from "@/lib/legal/registration-consent";
import { clearLoginFailures } from "@/lib/security/login-throttle";
import { createLead } from "@/lib/services/leads";
import {
  checkSecondFactor,
  requiresSecondFactor,
} from "@/lib/services/two-factor";

/**
 * Быстрая регистрация и вход по номеру телефона.
 *
 * Сюда доходит только проверенная личность: код из SMS подошёл
 * (lib/services/phone-auth.ts). Здесь решается одно — есть ли уже такой
 * человек: есть — входит, нет — заводится.
 *
 * Регистрация здесь — только способ входа: компания, должность и вакансия
 * спрашиваются уже после входа, пошаговой анкетой в /onboarding (так же,
 * как у регистрации по почте). До анкеты у компании временное название —
 * первым же шагом анкеты его заменят.
 *
 * Искать можно только по проверенному полю phoneVerified, а не по phone:
 * его человек вписывает себе сам — см. комментарий у полей в schema.prisma.
 */

export type QuickIdentity = { kind: "phone"; phone: string };

export type QuickUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  role: UserRole;
  clientId: string | null;
};

/**
 * Личность подтверждена, аккаунта нет, а согласия на обработку данных
 * не давали. Так бывает при входе со страницы входа: там галочки
 * согласия нет, и завести человека молча мы не можем.
 */
export class NeedsRegistrationError extends Error {}

/** У человека включён второй фактор, а кода из приложения не прислали. */
export class SecondFactorNeededError extends Error {}

/** Код из приложения прислали, но он не подошёл (или попытки кончились). */
export class SecondFactorWrongError extends Error {}

/** Код из SMS успели погасить параллельным входом. */
export class ProofAlreadyUsedError extends Error {}

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  organizationId: true,
  role: true,
  clientId: true,
} as const;

/** Уже заведённый человек с этой проверенной личностью. */
export async function findQuickUser(identity: QuickIdentity): Promise<QuickUser | null> {
  return prisma.user.findFirst({
    where: {
      isActive: true,
      phoneVerified: identity.phone,
    },
    select: USER_SELECT,
  });
}

/**
 * Адрес-заглушка для User.email — поле обязательное, а SMS почты не даёт.
 *
 * Домен .invalid зарезервирован стандартом (RFC 2606) именно для этого:
 * он гарантированно никуда не доставляется. Письма на такие адреса
 * не отправляются вовсе (isDeliverableEmail), а настоящую почту человек
 * подключает сам — в анкете или в настройках, по ссылке из письма.
 */
export function placeholderEmail(identity: QuickIdentity): string {
  return `phone-${identity.phone.replace(/\D/g, "")}@users.invalid`;
}

function displayName(identity: QuickIdentity): string {
  return maskPhone(identity.phone);
}

/**
 * Завести компанию и человека по проверенной личности.
 *
 * Вызывать только после согласия на обработку данных: здесь же
 * заводится заявка, и её отметка согласия — это момент и адрес
 * именно этого запроса.
 */
export async function registerQuickUser(
  identity: QuickIdentity,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<QuickUser> {
  const organization = await prisma.organization.findFirst({ select: { id: true } });
  if (!organization) throw new Error("Организация не настроена");

  const name = displayName(identity);

  let user: QuickUser;
  try {
    user = await prismaRaw.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          organizationId: organization.id,
          // Временное: первый шаг анкеты спрашивает настоящее название.
          // Имя человека в скобках — агентству, если анкету бросят:
          // по «Новой компании» без подробностей не позвонишь
          name: `Новая компания (${name})`,
          status: "LEAD",
          selfRegisteredAt: new Date(),
        },
        select: { id: true },
      });

      return tx.user.create({
        data: {
          organizationId: organization.id,
          clientId: client.id,
          // Роль одна и константой: так нельзя стать сотрудником агентства
          // ни при каком вводе — как и при регистрации по почте
          role: "CLIENT_ADMIN",
          email: placeholderEmail(identity),
          fullName: name,
          // Пароля нет намеренно: вход — тем же способом, что регистрация
          passwordHash: null,
          phoneVerified: identity.phone,
          phone: identity.phone,
        },
        select: USER_SELECT,
      });
    });
  } catch (error) {
    // Две вкладки, одна кнопка: оба запроса не нашли человека и оба
    // заводят. Второй упирается в уникальность — значит, первый успел
    if (isUniqueViolation(error)) {
      const existing = await findQuickUser(identity);
      if (existing) return existing;
    }
    throw error;
  }

  // Заявка во «Входящих» — доказательство согласия: версия текста,
  // показанного на /register, момент, адрес и браузер этого запроса.
  // Агентству о ней сообщают после анкеты (completeLeadFromBrief):
  // сейчас в ней нечего разбирать
  await createLead(
    {
      name,
      company: null,
      website: null,
      contact: identity.phone,
      vacancies: null,
      note: "Зарегистрировался по номеру телефона, анкету ещё заполняет",
      marketingConsent: false,
    },
    meta,
    {
      clientId: user.clientId ?? undefined,
      notify: false,
      consentVersion: REGISTRATION_CONSENT_VERSION,
    },
  );

  return user;
}

/** Отметка входа — как у входа по паролю. */
export async function touchLogin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

/**
 * Общий конец быстрого входа: личность уже доказана (код из SMS
 * проверен), осталось войти или завести.
 *
 * Второй фактор — тот же путь, что у входа по паролю в auth.ts: включить
 * его может и человек без пароля, и тогда вход по SMS без кода из
 * приложения не должен пускать, иначе он стал бы обходом защиты.
 * И тот же счётчик неверных кодов (lib/security/login-throttle.ts):
 * шесть цифр перебираются быстро — без общего счётчика быстрый вход
 * был бы второй дверью для перебора.
 *
 * `beforeEnter` гасит код из SMS — ровно в последний момент, после
 * второго фактора: если он погас бы раньше, повторный ввод — уже с кодом
 * из приложения — упал бы на «код использован».
 */
export async function resolveQuickSignIn(
  identity: QuickIdentity,
  options: {
    consent: boolean;
    secondFactorCode: string;
    meta?: { ip?: string | null; userAgent?: string | null };
    beforeEnter?: () => Promise<boolean>;
  },
): Promise<QuickUser> {
  const existing = await findQuickUser(identity);

  if (existing) {
    if (await requiresSecondFactor(existing.id)) {
      if (!options.secondFactorCode) throw new SecondFactorNeededError();
      // Попытка занимается до проверки кода (см. checkSecondFactor)
      if ((await checkSecondFactor(existing.id, options.secondFactorCode)) !== "ok") {
        throw new SecondFactorWrongError();
      }
    }
    if (options.beforeEnter && !(await options.beforeEnter())) {
      throw new ProofAlreadyUsedError();
    }
    await clearLoginFailures(existing.email, existing.id);
    await touchLogin(existing.id);
    return existing;
  }

  if (!options.consent) throw new NeedsRegistrationError();
  if (options.beforeEnter && !(await options.beforeEnter())) {
    throw new ProofAlreadyUsedError();
  }

  const user = await registerQuickUser(identity, options.meta);
  await touchLogin(user.id);
  return user;
}
