/**
 * Отдельно от lib/students-service.ts: тот файл начинается с "server-only"
 * и не может быть импортирован клиентскими компонентами «Проверок» даже
 * ради одной чистой функции — весь модуль целиком помечен серверным.
 */
export function studentsFileProxyUrl(path: string): string {
  return `/api/students-file?path=${encodeURIComponent(path)}`;
}
