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
  ],
});
