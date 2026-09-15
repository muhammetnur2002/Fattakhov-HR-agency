import { headers } from "next/headers";

import {
  checkRateLimit,
  clientIp,
  LIMITS,
  type RateLimitResult,
} from "./rate-limit";

/**
 * Проверка частоты для server actions и маршрутов.
 *
 * Отдельно от чистой функции, потому что читает заголовки запроса —
 * это уже не тестируемая арифметика, а работа с окружением Next.
 */
export async function guardRate(
  scope: keyof typeof LIMITS,
  extraKey = "",
): Promise<RateLimitResult> {
  const ip = clientIp(await headers());
  const preset = LIMITS[scope];
  return checkRateLimit(
    `${scope}:${ip}:${extraKey}`,
    preset.limit,
    preset.windowSeconds,
  );
}

/**
 * Сообщение о превышении.
 *
 * Формулировка одинаковая для всех точек и не раскрывает, что именно
 * сработало: подсказывать перебирающему, что он на верном пути, незачем.
 */
export function rateLimitMessage(retryAfter: number): string {
  const minutes = Math.ceil(retryAfter / 60);
  return minutes > 1
    ? `Слишком много попыток. Попробуйте через ${minutes} минут.`
    : "Слишком много попыток. Попробуйте через минуту.";
}
