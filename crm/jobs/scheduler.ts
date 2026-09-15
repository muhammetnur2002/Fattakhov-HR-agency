import "dotenv/config";

import { runScheduledTasks } from "./tasks";

/**
 * Планировщик фоновых задач.
 *
 * Запускается отдельным процессом: `npm run worker`.
 *
 * Намеренно простой цикл вместо очереди задач. Все задачи идемпотентны —
 * повторная отправка исключена флагами в самих сущностях, — поэтому
 * гарантии доставки очереди здесь не покупают ничего, кроме лишней
 * инфраструктуры. Если объём вырастет, на это место встанет pg-boss
 * без изменения самих задач.
 */
const INTERVAL_MS = 60_000;

let running = false;

async function tick() {
  // Проход может занять больше минуты — второй запуск поверх первого
  // задвоил бы уведомления
  if (running) return;
  running = true;

  try {
    const result = await runScheduledTasks();
    const done = Object.entries(result).filter(([, n]) => n > 0);
    if (done.length > 0) {
      console.info(
        `[планировщик] ${done.map(([k, n]) => `${k}: ${n}`).join(", ")}`,
      );
    }
  } catch (error) {
    console.error("[планировщик] сбой прохода", error);
  } finally {
    running = false;
  }
}

console.info(
  `[планировщик] запущен, проход каждые ${INTERVAL_MS / 1000} секунд`,
);

void tick();
setInterval(tick, INTERVAL_MS);
