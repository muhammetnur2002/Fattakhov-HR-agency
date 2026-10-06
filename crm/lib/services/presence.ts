import { prisma } from "@/lib/db/prisma";

/**
 * Пульс присутствия: запись `User.lastSeenAt` для «в сети» и «был(а)…».
 *
 * Открытая вкладка кабинета раз в минуту стучится на /api/presence
 * (components/presence/presence-heartbeat.tsx). Писать в базу на каждый такой
 * стук незачем — статус считается с точностью до минуты (lib/presence.ts), —
 * поэтому запись идёт не чаще раза в WRITE_INTERVAL_MS (минуту, с допуском
 * на дрожание таймера) на человека. Два рубежа:
 *
 *  1. память процесса: запрос в пределах минуты после предыдущего вообще не
 *     доходит до базы — это и есть защита от нагрузки (вкладок много, пульс
 *     у каждой своё время);
 *  2. условный UPDATE: «обнови, только если прежняя отметка старше минуты» —
 *     сравнение с прочитанным значением делает сама база одним запросом,
 *     поэтому несколько процессов или перезапуск (память пуста) не плодят
 *     записи и не гоняются друг с другом.
 */

/** Не чаще — иначе каждая вкладка каждую минуту писала бы свою строку. */
export const WRITE_INTERVAL_MS = 60_000;

/**
 * Допуск на дрожание таймера: пульс вкладки идёт раз в 60 с и приходит то
 * через 59,9, то через 60,3. Без допуска ровно такой «ранний» пульс
 * отбрасывался бы, следующая запись откладывалась ещё на минуту, и
 * человек, не отходивший от экрана, мигал бы из «В сети» в «был(а) 2 мин
 * назад». Раньше 55 с писать всё равно не даём.
 */
const JITTER_MS = 5_000;
const MIN_GAP_MS = WRITE_INTERVAL_MS - JITTER_MS;

/** Потолок карты: на длинном процессе она не должна расти без границ. */
const MAX_REMEMBERED = 10_000;

const lastAttempt = new Map<string, number>();

function remember(userId: string, at: number): void {
  if (lastAttempt.size >= MAX_REMEMBERED) {
    // Забываем всё просроченное; при переполнении — самое старое
    for (const [id, time] of lastAttempt) {
      if (at - time >= MIN_GAP_MS) lastAttempt.delete(id);
    }
    if (lastAttempt.size >= MAX_REMEMBERED) {
      const oldest = lastAttempt.keys().next().value;
      if (oldest !== undefined) lastAttempt.delete(oldest);
    }
  }
  lastAttempt.set(userId, at);
}

/**
 * Отметить, что человек сейчас в кабинете.
 *
 * Возвращает true, если отметка записана, и false, если писать было рано (или
 * статус скрыл владелец агентства: у него `showPresence=false`, и мы не
 * запоминаем, когда он заходил). У остальных ролей статус виден всегда
 * (effectiveShowPresence), поэтому им пишется независимо от сохранённого
 * `showPresence` — условие в запросе то же правило, что в lib/presence.ts. Вызывать только для вошедшего — актор берётся из сессии
 * (getActor), а не из тела запроса.
 */
export async function touchPresence(userId: string, now: Date = new Date()): Promise<boolean> {
  const at = now.getTime();
  const previous = lastAttempt.get(userId);
  if (previous !== undefined && at - previous >= 0 && at - previous < MIN_GAP_MS) {
    return false;
  }
  remember(userId, at);

  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      deletedAt: null,
      AND: [
        // Не владельцу писать можно всегда; владельцу — пока он не скрыл статус
        { OR: [{ role: { not: "OWNER" } }, { showPresence: true }] },
        { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(at - MIN_GAP_MS) } }] },
      ],
    },
    data: { lastSeenAt: now },
  });
  return count > 0;
}

/**
 * «Показывать, что я в сети» — только для владельца агентства: скрыть статус
 * может он один, у остальных ролей он виден всегда. Роль проверяется по базе,
 * а не по сессии: для не-владельца UPDATE не затрагивает ни одной строки,
 * возвращается false, и вызывающий отвечает отказом.
 *
 * Выключая, стираем и прежнюю отметку: скрыть статус и при этом хранить,
 * когда человек заходил, — не то, что он просил. Включая, ничего не
 * восстанавливаем — первая отметка придёт с ближайшим пульсом (в память
 * заодно не заглядываем: выключенному писать не давали).
 */
export async function setShowPresence(userId: string, show: boolean): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, role: "OWNER", deletedAt: null },
    data: show ? { showPresence: true } : { showPresence: false, lastSeenAt: null },
  });
  // Только что включившему первая отметка нужна сразу, а не через минуту
  if (count > 0 && show) lastAttempt.delete(userId);
  return count > 0;
}

/** Только для тестов: забыть, когда кого писали. */
export function resetPresenceThrottle(): void {
  lastAttempt.clear();
}
