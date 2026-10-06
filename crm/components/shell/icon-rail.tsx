"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS, type NavIconName } from "./icons";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Узкая панель разделов на планшете — от md до xl.
 *
 * Полный сайдбар шириной 240px на iPad съедал почти треть экрана (300px
 * из 820 при увеличенном шрифте — замер 21.09.2026 в CRM агентства),
 * плитки дашборда сжимались в две узкие колонки с переносами в каждой
 * подписи. А бургер — это два нажатия на каждый переход и тянуться
 * в верхний угол. Узкая панель иконок с подписями — как в приложениях
 * iPadOS: разделы всегда на виду, одно касание, места она берёт около
 * 10% ширины.
 *
 * Привязана к окну и прокручивается внутри, как и полный сайдбар.
 * Замок у раздела, закрытого до договора, — тот же признак, что в
 * боковом меню (SidebarNav), только значком на иконке: места под
 * подпись с замком в строке здесь нет.
 */
export function IconRail({
  items,
  siteHref,
}: {
  items: NavItem[];
  siteHref: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-20 shrink-0 flex-col self-start bg-brand-graphite px-1.5 py-3 md:flex xl:hidden print:hidden">
      <a
        href={siteHref}
        title="На сайт"
        className="mb-2 flex min-h-12 flex-col items-center justify-center gap-1 border-b border-white/10 pb-2 text-[10px] text-white/45 hover:text-white/85"
      >
        <ArrowLeft className="size-4" />
        На сайт
      </a>
      <nav
        aria-label="Разделы"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [scrollbar-width:none]"
      >
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon as NavIconName];
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.locked ? `${item.label} — откроется после договора` : item.label}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] leading-tight transition-colors",
                active
                  ? "bg-white/[0.09] text-white"
                  : "text-white/60 hover:bg-white/[0.05] hover:text-white/90",
              )}
            >
              <span className="relative">
                {Icon && <Icon className="size-5" />}
                {item.locked && (
                  <Lock
                    aria-label="Откроется после договора"
                    className="absolute -right-2 -bottom-1 size-3 text-white/50"
                  />
                )}
                {!!item.badge && (
                  <span className="absolute -top-1.5 -right-2.5 flex min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-medium text-brand-graphite">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span className="line-clamp-2">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
