/**
 * Куда можно вернуть человека после входа/выхода. Только путь внутри сайта:
 * «//evil.example» и «/\evil.example» браузер читает как чужой адрес.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}
