import { initClientSentry } from "@/lib/monitoring/capture-client";

/**
 * Браузерная половина Sentry — см. комментарий в instrumentation.ts:
 * без NEXT_PUBLIC_SENTRY_DSN не поднимается вовсе, DSN не секрет.
 *
 * Имя файла — соглашение самого Next (require-instrumentation-client
 * в next/dist), а не что-то специфичное для Sentry: подключается сам,
 * без правки next.config.ts.
 *
 * Сам Sentry подгружается динамически и только при заданном DSN
 * (lib/monitoring/capture-client.ts): обычный импорт клал его код в
 * первую загрузку каждой страницы, хотя при пустом DSN он не делал ничего.
 */
initClientSentry();
