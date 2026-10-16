import type { Metadata } from 'next';
import { Landing } from '@/components/screens/Landing';
import { agencySiteUrl } from '@/lib/agency';
import { pageMetadata } from '@/lib/seo';
import { showcaseCompanies, showcaseVacancies } from '@/lib/showcase';

// Адрес в canonical и og:url — из APP_URL на запрос: собранная при сборке образа страница
// запомнила бы http://localhost:3001 (там нет окружения сервера)
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return pageMetadata({ path: '/' });
}

/**
 * Витрина. Не зависит ни от базы, ни от сессии: открывается так же быстро, как статичная —
 * динамична только ради адреса в метаданных (см. выше).
 */
export default function HomePage() {
  return (
    <Landing
      vacancies={showcaseVacancies(5)}
      companies={showcaseCompanies()}
      agencyUrl={agencySiteUrl()}
    />
  );
}
