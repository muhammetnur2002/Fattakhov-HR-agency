/**
 * Сколько осталось до срока: «осталось 2 ч 15 мин» или «просрочено».
 *
 * Чистая функция от двух моментов: «сейчас» подаёт вызывающий (серверная страница
 * один раз, клиентский календарь раз в минуту), поэтому текст не расходится
 * между сервером и браузером при гидратации.
 */

/** Длительность словами: «2 ч 15 мин», «45 мин», «1 д 3 ч». */
export function durationText(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} д ${hours} ч` : `${days} д`;
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  return `${minutes} мин`;
}

/**
 * Осталось до срока. Срок наступил: «просрочено». Меньше минуты: «меньше минуты».
 */
export function remainingText(dueAt: Date, now: Date): string {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return "просрочено";
  if (diff < 60_000) return "осталось меньше минуты";
  return `осталось ${durationText(diff)}`;
}
