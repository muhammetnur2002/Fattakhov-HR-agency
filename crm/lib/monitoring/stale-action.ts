/**
 * «Failed to find Server Action» — не сбой кода, а следствие выкатки.
 *
 * Идентификатор серверного действия в Next зависит от ключа шифрования
 * сборки, а в Docker ключ в каждой сборке новый: после выкатки открытая
 * со старой версии вкладка шлёт действие, которого новый сервер не знает.
 * Данные при этом не портятся — действие просто не выполняется, — и будить
 * из-за этого владельца нечем: в журнал, без письма и без сообщения в ВК
 * (разбор 08.10.2026, см. crm/AGENTS.md).
 *
 * Модуль без зависимостей: его читают и instrumentation.ts (в том числе
 * для edge-сборки), и тесты.
 */
const STALE_ACTION = /Failed to find Server Action/i;

export function isStaleServerActionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_ACTION.test(message);
}
