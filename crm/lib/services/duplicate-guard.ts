import { prisma } from "@/lib/db/prisma";

/**
 * Защита от дубля при отправке: повтор того же сообщения сразу после первого
 * не создаёт второго.
 *
 * Откуда берётся дубль. Кнопка «Отправить» выключается на время запроса, но
 * Enter в поле шлёт форму в обход кнопки, а при медленной сети человек жмёт
 * ещё раз, не дождавшись ответа. Клиент теперь не стартует вторую отправку
 * (message-thread.tsx, comment-thread.tsx), но клиенту верить нельзя: вкладок
 * может быть две, запрос может повторить сам браузер при обрыве. Поэтому то же
 * правило — на сервере, в одном месте.
 *
 * Правило: тот же автор, то же место (получатель или тред) и тот же текст в
 * пределах DUPLICATE_WINDOW_MS — это повтор, и возвращается уже созданная
 * запись. Схему базы это не меняет (без уникального индекса по времени такое
 * не выразить), поэтому два одновременных запроса выстраиваются в очередь
 * замком advisory на ключ — тем же приёмом, что в lib/security/db-limit.ts:
 * без замка оба увидели бы «такого ещё нет» и оба создали.
 *
 * Осознанно не ловится: тот же текст через минуту (человек и правда написал
 * «Спасибо» дважды) и разный текст подряд.
 */

/**
 * Клиент внутри транзакции. Не Prisma.TransactionClient: у клиента с расширением
 * мягкого удаления (lib/db/prisma.ts) другой тип, и базовый ему не подходит.
 */
export type DbTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/** Сколько секунд одинаковое сообщение от одного автора считается повтором. */
export const DUPLICATE_WINDOW_MS = 5_000;

export type DuplicateGuardResult<T> = {
  record: T;
  /** true — запись уже была, новая не создавалась (уведомлять второй раз не нужно). */
  duplicate: boolean;
};

export async function createUnlessDuplicate<T>(args: {
  /**
   * Что делает отправку «той же самой»: автор, адресат или тред, текст.
   * Разные ключи не мешают друг другу — замок берётся только на свой.
   */
  lockKey: string;
  /** Запись, созданная не раньше since, — если есть, это и есть дубль. */
  findRecent: (tx: DbTx, since: Date) => Promise<T | null>;
  create: (tx: DbTx) => Promise<T>;
}): Promise<DuplicateGuardResult<T>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`duplicate:${args.lockKey}`}))`;

    const existing = await args.findRecent(tx, new Date(Date.now() - DUPLICATE_WINDOW_MS));
    if (existing) return { record: existing, duplicate: true };

    return { record: await args.create(tx), duplicate: false };
  });
}
