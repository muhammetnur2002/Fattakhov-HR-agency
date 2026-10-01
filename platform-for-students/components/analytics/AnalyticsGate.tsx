'use client';

import { usePathname } from 'next/navigation';
import { CookieBanner } from './CookieBanner';
import { YandexMetrika } from './YandexMetrika';

/**
 * Где вообще допустима аналитика: только публичные страницы, где человек не вводит
 * персональных данных. Вход, регистрация, кабинеты студента, работодателя и
 * администратора, чат и профиль в список не входят — там ни баннера, ни счётчика.
 */
const PUBLIC_PREFIXES = ['/institutions', '/companies', '/legal', '/help'];

function isPublicPage(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AnalyticsGate() {
  const pathname = usePathname();
  if (!isPublicPage(pathname)) return null;

  return (
    <>
      <CookieBanner />
      <YandexMetrika />
    </>
  );
}
