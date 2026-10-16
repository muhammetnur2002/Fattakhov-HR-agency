import type { MetadataRoute } from 'next';
import { buildRobots } from '@/lib/seo';

// Адрес Sitemap берётся из APP_URL на запрос, а не при сборке образа (см. lib/seo.ts)
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
