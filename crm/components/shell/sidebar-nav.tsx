"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS, type NavIconName } from "./icons";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";

/**
 * Пункты приходят уже отфильтрованными по правам с сервера —
 * здесь только подсветка активного раздела.
 */
export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  /** Закрыть мобильное меню при переходе: сайдбар живёт в layout и не
      перемонтируется между страницами, поэтому Sheet сам не закроется. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon as NavIconName];
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Активный пункт отмечен вертикальной засечкой слева, а не
              // заливкой: на графите заливка съедает иконку, а засечка
              // повторяет рёбра знака и читается сразу
              "group relative flex items-center gap-3 rounded-lg py-2 pr-3 pl-4 text-sm transition-colors",
              "before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[3px] before:rounded-full before:transition-colors",
              active
                ? "bg-white/[0.07] font-medium text-white before:bg-white"
                : "text-white/60 before:bg-transparent hover:bg-white/[0.04] hover:text-white/90",
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-white" : "text-white/60 group-hover:text-white/85",
                )}
              />
            )}
            {item.label}
            {/* bg-primary тут не видно: на графите сайдбара это тот же
                цвет, что и фон. Белым — тем же приёмом, что и у активного
                пункта (засечка, светлая заливка при hover). */}
            {!!item.badge && (
              <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-brand-graphite">
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
