import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { PhoneFormatError } from "@/lib/auth/phone";
import { prisma } from "@/lib/db/prisma";
import {
  checkPhoneCode,
  consumePhoneCode,
  PhoneCodeError,
} from "@/lib/services/phone-auth";
import {
  NeedsRegistrationError,
  ProofAlreadyUsedError,
  resolveQuickSignIn,
  SecondFactorNeededError,
  SecondFactorWrongError,
  type QuickIdentity,
  type QuickUser,
} from "@/lib/services/quick-registration";
import { recordAuthEventSoon } from "@/lib/services/auth-events";
import { authenticateWithPassword, LoginError } from "@/lib/services/credentials-login";
import { requiresSecondFactor } from "@/lib/services/two-factor";
import {
  consumeTicketOnce,
  crmEntrySecret,
  verifyStudentsEntryTicket,
} from "@/lib/students-entry";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  /// Второй фактор. Приходит вторым шагом той же формы.
  code: z.string().optional(),
});

/**
 * Единая ошибка входа. Намеренно не различает «нет такого email»,
 * «неверный пароль» и «учётка отключена»: иначе форма входа превращается
 * в инструмент проверки, кто заведён в системе.
 */
class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}

/**
 * Пароль верный, но нужен код из приложения.
 *
 * Отдельный код ошибки, а не общий: по нему форма понимает, что надо
 * показать поле для кода, и не сбрасывает уже введённое. Утечки здесь
 * нет, эту ошибку получает только тот, кто уже знает пароль.
 */
class SecondFactorRequired extends CredentialsSignin {
  code = "second_factor_required";
}

/** Пароль верный, код нет. Тоже отдельно: иначе форма скроет поле кода. */
class SecondFactorInvalid extends CredentialsSignin {
  code = "second_factor_invalid";
}

/** Билет из студенческой платформы не прошёл проверку — истёк, подделан, уже погашен. */
class StudentsEntryInvalid extends CredentialsSignin {
  code = "students_entry_invalid";
}

/**
 * Телефон подтверждён, а аккаунта нет — и согласия
 * на обработку данных не давали (вход со страницы входа, а не
 * регистрации). Завести человека без согласия нельзя; форма по этому
 * коду ведёт на регистрацию.
 */
class NeedsRegistration extends CredentialsSignin {
  code = "needs_registration";
}

/** Код из SMS не подошёл. Точную причину форма узнаёт раньше, до входа. */
class PhoneCodeInvalid extends CredentialsSignin {
  code = "phone_code_invalid";
}

function toAuthUser(user: QuickUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    organizationId: user.organizationId,
    role: user.role,
    clientId: user.clientId,
  };
}

function requestMeta(request: Request | undefined) {
  return {
    ip: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request?.headers.get("user-agent") ?? null,
  };
}

/**
 * Быстрый вход: сервис решает, войти или завести, и проверяет второй
 * фактор тем же путём и тем же счётчиком, что вход по паролю, — здесь
 * только перевод его ошибок в коды, которые понимает форма.
 */
async function completeQuickSignIn(
  identity: QuickIdentity,
  options: {
    consent: boolean;
    code: string;
    request: Request | undefined;
    beforeEnter?: () => Promise<boolean>;
  },
) {
  try {
    const user = await resolveQuickSignIn(identity, {
      consent: options.consent,
      secondFactorCode: options.code,
      meta: requestMeta(options.request),
      beforeEnter: options.beforeEnter,
    });
    recordAuthEventSoon({ kind: "LOGIN_OK", userId: user.id, details: { method: "phone" } });
    return toAuthUser(user);
  } catch (error) {
    if (error instanceof NeedsRegistrationError) throw new NeedsRegistration();
    if (error instanceof SecondFactorNeededError) throw new SecondFactorRequired();
    if (error instanceof SecondFactorWrongError) {
      recordAuthEventSoon({
        kind: "TWO_FACTOR_FAIL",
        details: { method: "phone", reason: "wrong_or_blocked" },
      });
      throw new SecondFactorInvalid();
    }
    if (error instanceof ProofAlreadyUsedError) {
      recordAuthEventSoon({
        kind: "LOGIN_FAIL",
        details: { method: "phone", reason: "code_already_used" },
      });
      throw new InvalidCredentials();
    }
    throw error;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();

        const { email, password, code } = parsed.data;

        try {
          return await authenticateWithPassword({ email, password, code });
        } catch (error) {
          // Наши отказы — в коды ошибок, которые понимает форма
          if (error instanceof LoginError) {
            if (error.code === "second_factor_required") throw new SecondFactorRequired();
            if (error.code === "second_factor_invalid") throw new SecondFactorInvalid();
            throw new InvalidCredentials();
          }
          throw error;
        }
      },
    }),
    /**
     * Вход из студенческой платформы билетом (см. lib/students-entry.ts),
     * а не паролем — второй провайдер, а не ветка внутри первого: у него
     * нет пароля кандидата на подделку, есть только подпись билета,
     * и смешивать эти два пути проверки было бы источником ошибки.
     *
     * Учётная запись заводится по почте компании при первом входе —
     * так же, как CRM заводит сотрудника при входе staff-билетом на
     * студенческой платформе (см. signInStaff в её app/api/auth/crm).
     */
    Credentials({
      id: "students-entry",
      name: "students-entry",
      credentials: { ticket: { type: "text" } },
      async authorize(raw) {
        // Любой отказ с билетом — одна запись: причина в деталях, а не в ответе человеку
        const refuse = (reason: string): never => {
          recordAuthEventSoon({
            kind: "LOGIN_FAIL",
            details: { method: "students-entry", reason },
          });
          throw new StudentsEntryInvalid();
        };

        const ticket = typeof raw?.ticket === "string" ? raw.ticket : "";
        const secret = crmEntrySecret();
        if (!secret) return refuse("no_secret");

        const checked = verifyStudentsEntryTicket(ticket, secret);
        if (!checked.ok) return refuse("bad_ticket");
        if (!consumeTicketOnce(checked.ticket.jti, checked.ticket.exp)) {
          return refuse("ticket_reused");
        }

        const client = await prisma.client.findUnique({
          where: { id: checked.ticket.crmClientId },
        });
        if (!client) return refuse("no_client");

        let user = await prisma.user.findFirst({
          where: { clientId: client.id, email: checked.ticket.email },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              organizationId: client.organizationId,
              clientId: client.id,
              email: checked.ticket.email,
              fullName: "Представитель компании",
              role: "CLIENT_ADMIN",
              // Пароль здесь не заводится намеренно: входить можно только
              // этим билетом, со студенческой платформы — второй пароль
              // означал бы второй способ угона учётки
              passwordHash: null,
            },
          });
        }
        if (!user.isActive) return refuse("inactive");
        // Билет — это вход без пароля; при включённой 2FA он не должен её обходить.
        // Такой человек входит обычной формой с кодом
        if (await requiresSecondFactor(user.id)) return refuse("second_factor_enabled");

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        recordAuthEventSoon({
          kind: "LOGIN_OK",
          userId: user.id,
          details: { method: "students-entry" },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          organizationId: user.organizationId,
          role: user.role,
          clientId: user.clientId,
        };
      },
    }),

    /*
      Вход и регистрация по номеру телефона и коду из SMS.

      Код проверяется без погашения, а гасится в beforeEnter — уже после
      второго фактора (см. resolveQuickSignIn): иначе второй шаг с кодом
      из приложения упал бы на «код использован».
    */
    Credentials({
      id: "phone",
      name: "Телефон",
      credentials: { phone: {}, smsCode: {}, consent: {}, code: {} },
      async authorize(raw, request) {
        let checked: { phone: string; codeId: string };
        try {
          checked = await checkPhoneCode(
            String(raw?.phone ?? ""),
            String(raw?.smsCode ?? ""),
          );
        } catch (error) {
          if (error instanceof PhoneCodeError || error instanceof PhoneFormatError) {
            recordAuthEventSoon({
              kind: "LOGIN_FAIL",
              details: { method: "phone", reason: "bad_code" },
            });
            throw new PhoneCodeInvalid();
          }
          throw error;
        }

        return completeQuickSignIn(
          { kind: "phone", phone: checked.phone },
          {
            consent: raw?.consent === "on",
            code: String(raw?.code ?? "").trim(),
            request,
            beforeEnter: () => consumePhoneCode(checked.codeId),
          },
        );
      },
    }),
  ],
});
