/**
 * Ответ API на стороне браузера: что показать человеку, когда сервер отказал.
 *
 * Роуты отдают ошибку как `{ error: "понятный текст", code?, fields? }` (lib/api.ts).
 * Раньше экраны разбирали тело ответа, не глядя на статус: отказ с кодом 429 или 404
 * проходил как успех, и человеку писали «Приглашение отправлено». Теперь сначала
 * смотрят `response.ok`, а текст отказа берут отсюда.
 */
export async function apiErrorMessage(
  response: { json: () => Promise<unknown> },
  fallback: string,
): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
}
