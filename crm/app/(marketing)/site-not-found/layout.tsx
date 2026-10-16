import type { Metadata } from "next";

import { NOT_FOUND_DESCRIPTION, NOT_FOUND_TITLE } from "@/lib/marketing/seo";

/**
 * Заголовок и запрет индекса страницы «не найдено» — здесь, в макете, а не в `page.tsx`:
 * для ответа с кодом 404 Next берёт метаданные только макетов, а `metadata` страницы
 * молча отбрасывает (в заголовке оставался заголовок главной).
 */
export const metadata: Metadata = {
  title: { absolute: NOT_FOUND_TITLE },
  // Своё описание: иначе остаётся унаследованное от главной
  description: NOT_FOUND_DESCRIPTION,
  robots: { index: false, follow: false },
};

export default function SiteNotFoundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
