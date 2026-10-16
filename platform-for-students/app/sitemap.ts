import type { MetadataRoute } from 'next';
import { buildSitemap } from '@/lib/seo';
import { listInstitutionsPublic } from '@/lib/services';

// Адреса — от APP_URL на запрос, а не при сборке образа (см. lib/seo.ts)
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Справочник недоступен — карта всё равно отдаётся: публичные страницы важнее полного списка вузов
  const institutions = await listInstitutionsPublic().catch(() => []);
  return buildSitemap(institutions.map((item) => item.slug));
}
