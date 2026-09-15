import type { NextAuthConfig } from "next-auth";

import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Полезная нагрузка токена.
 *
 * Описана явным типом, а не аугментацией модуля: интерфейс `JWT` лежит
 * в `@auth/core`, и его физическое расположение меняется в зависимости
 * от того, как npm разложил зависимости — аугментация от этого молча
 * отваливается.
 */
type AuthToken = {
  userId?: string;
  organizationId?: string;
  role?: UserRole;
  clientId?: string | null;
  /**
   * Когда сессия выпущена, в секундах эпохи.
   *
   * Сессии у нас в JWT, отозвать их со стороны сервера нечем. Поэтому
   * при смене пароля сравниваем эту отметку с моментом смены: всё,
   * что выпущено раньше, перестаёт действовать. Иначе угнанная сессия
   * переживает смену пароля до тридцати дней, и менять его бессмысленно.
   */
  issuedAt?: number;
};

/**
 * Edge-безопасная часть конфига Auth.js.
 *
 * Живёт отдельно от auth.ts намеренно: middleware выполняется в edge-рантайме,
 * куда Prisma и argon2 (нативный модуль) не тянутся. Здесь только то, что
 * работает без БД — разбор JWT и маршрутизация. Провайдер с обращением к БД
 * подключается в auth.ts, который используется в Node-рантайме.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    // Auth.js рисует собственные страницы выхода и ошибки — англоязычные
    // и вне оформления продукта. Уводим на свою форму входа: выход у нас
    // делается кнопкой из меню, отдельная страница подтверждения не нужна.
    signOut: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней (ТЗ 13.2)
    updateAge: 24 * 60 * 60, // продление не чаще раза в сутки
  },
  // Провайдеры добавляются в auth.ts — здесь пусто, иначе edge упадёт на Prisma
  providers: [],
  callbacks: {
    /**
     * Кладём в токен то, что нужно для маршрутизации и построения Actor.
     * Права по этим данным не проверяются — только навигация; авторитетный
     * источник состояния пользователя всегда БД (см. requireActor).
     */
    jwt({ token, user }) {
      // user приходит только в момент входа; на последующих запросах
      // токен уже заполнен и переписывать его нечем.
      if (user?.id) {
        const payload = token as AuthToken;
        payload.userId = user.id;
        payload.organizationId = user.organizationId;
        payload.role = user.role;
        payload.clientId = user.clientId;
        payload.issuedAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    session({ session, token }) {
      const payload = token as AuthToken;
      if (payload.userId && payload.organizationId && payload.role) {
        session.user.id = payload.userId;
        session.user.organizationId = payload.organizationId;
        session.user.role = payload.role;
        session.user.clientId = payload.clientId ?? null;
        session.user.issuedAt = payload.issuedAt ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
