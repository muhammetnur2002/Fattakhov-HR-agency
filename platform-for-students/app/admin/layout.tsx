import { NOINDEX_METADATA } from '@/lib/seo';

// Панель HR-менеджера — не для выдачи: метка на макете закрывает и новые страницы раздела
export const metadata = NOINDEX_METADATA;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
