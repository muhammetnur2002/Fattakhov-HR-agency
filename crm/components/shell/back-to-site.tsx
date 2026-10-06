import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Возврат из кабинета на сайт агентства.
 *
 * Стоит над меню, строкой того же вида, что и пункты, — но приглушённой
 * и отделённой линией: это выход из продукта, а не ещё один раздел,
 * и путать их нельзя. Обычная ссылка, не Link: сайт живёт на другом
 * адресе (SITE_URL, siteOrigin() в lib/urls.ts), клиентская навигация
 * туда не ходит.
 */
export function BackToSite({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg py-2 pr-3 pl-4 text-sm text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/85",
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
      На сайт
    </a>
  );
}
