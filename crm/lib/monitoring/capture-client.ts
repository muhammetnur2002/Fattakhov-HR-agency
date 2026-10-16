/**
 * Отправка ошибки браузера в Sentry — только если он поднят, и без его кода в первой загрузке.
 *
 * Раньше `@sentry/nextjs` подключался обычным импортом в `instrumentation-client.ts`, в экране
 * ошибки и в `global-error.tsx`. Sentry у нас выключен намеренно (отчёты за границу не
 * отправляем, DSN пуст), но импорт тянул его браузерный код (около 165 КБ до сжатия, замер
 * 13.10.2026) в первую загрузку КАЖДОЙ страницы — сайта, входа и кабинетов, — чтобы потом ничего
 * не делать. Теперь код подгружается динамически и только когда DSN задан при сборке:
 * без DSN чанк не запрашивается вовсе. Как только DSN появится, всё работает как прежде.
 *
 * Условие читает `NEXT_PUBLIC_SENTRY_DSN` при вызове, а не при загрузке модуля: так же, как
 * в `instrumentation-client.ts`, и тесты могут его подменить.
 */

/** Sentry поднят: DSN задан при сборке (переменная NEXT_PUBLIC_* вшивается в код). */
export function sentryEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/** Запускает Sentry в браузере. Без DSN ничего не загружает. */
export function initClientSentry(): void {
  if (!sentryEnabled()) return;
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        sendDefaultPii: false,
      });
    })
    .catch(() => {
      // Мониторинг не должен ломать страницу: не загрузился — значит, без него
    });
}

/** Передаёт ошибку в Sentry. Без DSN — пустой вызов, чанк не запрашивается. */
export function captureClientException(error: unknown): void {
  if (!sentryEnabled()) return;
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(error);
    })
    .catch(() => {
      // см. выше
    });
}
