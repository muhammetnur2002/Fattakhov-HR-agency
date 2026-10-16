import { NOINDEX_METADATA } from '@/lib/seo';

// Кабинет работодателя — не для выдачи: метка на макете закрывает и новые страницы раздела
export const metadata = NOINDEX_METADATA;

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
