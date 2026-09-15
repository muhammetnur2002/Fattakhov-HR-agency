/**
 * Ограничение частоты запросов (BR-29).
 *
 * Защищает публичные точки от перебора: пароля на форме входа и токенов
 * в ссылках для кандидатов. Токен угадать нельзя, но без лимита можно
 * пытаться бесконечно, а логи заполнятся мусором.
 *
 * Счётчики в памяти процесса. Для одного сервера этого достаточно;
 * при нескольких инстансах лимит станет мягче в N раз — не дыра,
 * но переезд на общее хранилище будет нужен. Отмечено в ТЗ 14.1.1.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Чтобы карта не росла бесконечно на длинных процессах. */
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  /** Сколько секунд ждать до следующей попытки. */
  retryAfter: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) evictExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count++;

  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return { allowed: true, retryAfter: 0 };
}

function evictExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Адрес клиента.
 *
 * За обратным прокси реальный адрес приходит заголовком. Берём первый
 * в цепочке X-Forwarded-For: остальные подставляются промежуточными
 * узлами и подделываются тривиально.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Пресеты под разные точки: подбор пароля опаснее просмотра страницы. */
export const LIMITS = {
  /** Вход: медленно, потому что здесь подбирают пароль. */
  login: { limit: 10, windowSeconds: 60 },
  /** Публичные ссылки по токену. */
  publicToken: { limit: 20, windowSeconds: 60 },
  /** Отправка форм кандидатом. */
  publicSubmit: { limit: 10, windowSeconds: 60 },
} as const;

/** Сбросить счётчики. Только для тестов. */
export function resetRateLimits(): void {
  buckets.clear();
}
