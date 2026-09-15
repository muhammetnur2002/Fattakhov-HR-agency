import * as Sentry from "@sentry/nextjs";

import { assertProductionConfig } from "@/lib/config/production-check";

/**
 * Точка, которую Next вызывает один раз при старте сервера, до первого
 * запроса. Здесь же — необязательный Sentry: без NEXT_PUBLIC_SENTRY_DSN
 * его просто нет, тем же приёмом, что и TELEGRAM_BOT_TOKEN в notify()
 * (см. .env.example). DSN — не секрет (это публичный идентификатор
 * приёма событий, Sentry сам объясняет это в своей документации),
 * поэтому один и тот же публичный NEXT_PUBLIC_-префикс годится и на
 * сервер, и в браузер (там его подхватывает instrumentation-client.ts).
 *
 * Отдельного файла это стоит потому, что все прочие проверки в проекте
 * ленивые: хранилище ругается на первом файле, почта — на первом письме.
 * Так узнаёшь о неверной настройке от пользователя, а не от деплоя.
 *
 * Проверка прод-конфига запускается только в серверном рантайме: в edge
 * (там живёт proxy.ts) нет ни S3, ни почты, и требовать там их настройки
 * бессмысленно — процесс упал бы на ровном месте. Sentry, наоборот,
 * стоит поднимать в обоих — ошибка в proxy.ts не менее реальна, чем
 * в серверном компоненте.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionConfig();
  }

  if (
    process.env.NEXT_PUBLIC_SENTRY_DSN &&
    (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge")
  ) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // По умолчанию и так выключено — оставляем: в отчёт об ошибке
      // не должны попадать IP, куки и заголовки запроса, где может
      // оказаться что угодно из ПДн-контура (BR-33 и далее).
      sendDefaultPii: false,
    });
  }
}

/** Ошибки самого запроса (не пойманные в компонентах) — тоже в Sentry, если он поднят. */
export const onRequestError = Sentry.captureRequestError;
