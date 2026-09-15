import * as Sentry from "@sentry/nextjs";

/**
 * Браузерная половина Sentry — см. комментарий в instrumentation.ts:
 * без NEXT_PUBLIC_SENTRY_DSN не поднимается вовсе, DSN не секрет.
 *
 * Имя файла — соглашение самого Next (require-instrumentation-client
 * в next/dist), а не что-то специфичное для Sentry: подключается сам,
 * без правки next.config.ts.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    sendDefaultPii: false,
  });
}
