import type { UserRole } from "@/lib/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

/**
 * Расширение типов Auth.js под нашу модель пользователя.
 * Без этого token.role и session.user.role были бы any.
 */
declare module "next-auth" {
  interface User {
    organizationId: string;
    role: UserRole;
    clientId: string | null;
  }

  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: UserRole;
      clientId: string | null;
      /** Когда выпущена сессия, секунды эпохи. Нужно для гашения при смене пароля. */
      issuedAt: number | null;
    } & DefaultSession["user"];
  }
}

/**
 * Аугментации типа JWT здесь намеренно нет.
 *
 * Интерфейс `JWT` живёт в `@auth/core`, а `next-auth/jwt` только его
 * реэкспортирует — расширять надо исходный модуль. Но его физическое
 * расположение зависит от того, как npm разложил зависимости: при
 * конфликте версий он уезжает внутрь `next-auth/node_modules`,
 * и аугментация молча перестаёт применяться, ломая сборку.
 *
 * Вместо этого поля токена описаны явным типом `AuthToken`
 * в `auth.config.ts` — это устойчиво к перестановкам пакетов.
 */
