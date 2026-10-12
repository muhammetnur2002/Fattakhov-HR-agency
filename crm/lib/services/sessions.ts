import { prisma } from "@/lib/db/prisma";
import { recordAuthEvent } from "@/lib/services/auth-events";

/**
 * «Выйти на всех устройствах».
 *
 * Сессии у нас в JWT, и по одной их не отозвать. Но каждая несёт время
 * выпуска, а requireActor (lib/auth/session.ts) отвергает всё, что выпущено
 * раньше passwordChangedAt. Поэтому отметка передвигается на «сейчас»: все
 * выданные сессии, включая украденные, перестают действовать, а пароль
 * остаётся прежним. Вызывающий после этого выводит и текущее устройство —
 * входить придётся заново, зато без ожидания и без смены пароля.
 *
 * Это ответ на кражу cookie: пароль и 2FA ей не нужны, а отозвать её иначе,
 * кроме как сменой пароля, было нечем.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordChangedAt: new Date() },
    select: { organizationId: true },
  });
  await recordAuthEvent({
    kind: "SESSIONS_REVOKED",
    userId,
    organizationId: user.organizationId,
  });
}
