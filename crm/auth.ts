import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import {
  requiresSecondFactor,
  verifySecondFactor,
} from "@/lib/services/two-factor";
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

        const user = await prisma.user.findFirst({
          where: { email: email.toLowerCase().trim(), isActive: true },
          select: {
            id: true,
            email: true,
            fullName: true,
            passwordHash: true,
            organizationId: true,
            role: true,
            clientId: true,
          },
        });

        // Пароль сверяем даже когда пользователь не найден — иначе разница
        // во времени ответа выдаёт, какие email заведены в системе.
        const hashToCheck =
          user?.passwordHash ??
          "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$3wRJDPBLYSMPmwLmFvxNPHFTJZFTh9tXPFmzeXKXUeQ";

        const ok = await verifyPassword(hashToCheck, password);
        if (!user || !user.passwordHash || !ok) throw new InvalidCredentials();

        // Второй фактор проверяется только после пароля: до этого мы
        // не должны даже подтверждать, что такой человек есть
        if (await requiresSecondFactor(user.id)) {
          if (!code?.trim()) throw new SecondFactorRequired();
          if (!(await verifySecondFactor({ userId: user.id, code }))) {
            throw new SecondFactorInvalid();
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
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
        const ticket = typeof raw?.ticket === "string" ? raw.ticket : "";
        const secret = crmEntrySecret();
        if (!secret) throw new StudentsEntryInvalid();

        const checked = verifyStudentsEntryTicket(ticket, secret);
        if (!checked.ok) throw new StudentsEntryInvalid();
        if (!consumeTicketOnce(checked.ticket.jti, checked.ticket.exp)) {
          throw new StudentsEntryInvalid();
        }

        const client = await prisma.client.findUnique({
          where: { id: checked.ticket.crmClientId },
        });
        if (!client) throw new StudentsEntryInvalid();

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
        if (!user.isActive) throw new StudentsEntryInvalid();

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
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
  ],
});
