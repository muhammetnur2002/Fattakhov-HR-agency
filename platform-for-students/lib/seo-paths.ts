/**
 * Какие пути закрыты от поисковиков. Отдельный файл без зависимостей: его читает proxy.ts
 * (заголовок X-Robots-Tag), ему не нужны ни тексты документов, ни адрес платформы.
 * Остальное по поиску и превью ссылок — в lib/seo.ts.
 */

/**
 * Пути, которые не должны попасть в выдачу: вход и регистрация (форма, а не содержание),
 * кабинеты студента, работодателя и HR, служебные страницы и весь API. Проверка — по началу пути.
 */
export const NOINDEX_PREFIXES: string[] = [
  '/login',
  '/register',
  '/forgot',
  '/reset',
  '/logout',
  '/switch-account',
  '/feed',
  '/jobs',
  '/applications',
  '/skipped',
  '/messages',
  '/profile',
  '/employer',
  '/admin',
  '/api',
];

/**
 * Закрытые ещё и в robots.txt. Вход и регистрация сюда не входят намеренно: чтобы поисковик
 * увидел на них noindex, страницу ему придётся открыть, а запрет в robots.txt это отменяет —
 * закрытый так адрес может остаться в выдаче голой ссылкой.
 */
export const ROBOTS_DISALLOW: string[] = [
  '/api/',
  '/admin',
  '/employer',
  '/feed',
  '/jobs',
  '/applications',
  '/skipped',
  '/messages',
  '/profile',
  '/logout',
  '/forgot',
  '/reset/',
];

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
