import "dotenv/config";

import { runScheduledTasks } from "./tasks";

/**
 * Один проход планировщика и выход.
 *
 * Нужен для проверки вручную и для деплоя, где вместо постоянного
 * процесса удобнее внешний cron: он дёргает этот скрипт по расписанию.
 */
runScheduledTasks()
  .then((result) => {
    console.info("[планировщик] проход завершён:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("[планировщик] проход упал", error);
    process.exit(1);
  });
