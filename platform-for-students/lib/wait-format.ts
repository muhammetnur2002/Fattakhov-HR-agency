/**
 * Время ожидания для людей: меньше минуты — «N с», дальше — «N мин»
 * (минуты округляем вверх, чтобы человек не пришёл раньше времени).
 */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} с`;
  return `${Math.ceil(s / 60)} мин`;
}
