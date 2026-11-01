'use client';

import Link from 'next/link';
import { useActivityBadges } from '@/lib/hooks/useActivityBadges';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  /** Подсвечивать только на точном совпадении. Нужно корневому разделу,
   *  чей путь является префиксом всех остальных. */
  exact?: boolean;
  /** Иконка вместо текста — label остаётся для aria-label и подсказки при наведении. */
  icon?: React.ReactNode;
  /** Показать только иконку, без видимого текста рядом. */
  hideLabel?: boolean;
}

/**
 * Вкладки разделов.
 *
 * Подложка активной вкладки — один общий элемент с layoutId: она
 * переезжает между вкладками, а не гаснет и зажигается заново. Именно
 * переезд подсказывает, что разделы лежат в одном ряду, а не заменяют
 * друг друга.
 */
export function NavTabs({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const activity = useActivityBadges(items.some(item => item.href === '/feed' || item.href === '/employer'));

  return (
    <nav className={cn('flex items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-graphite-900/50 p-1 backdrop-blur-glass', className)}>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        // Значок сообщений досчитывается вживую (см. useLiveMessagesBadge):
        // иначе новый ответ работодателя был виден только после перехода
        // на другую страницу — сервер считал его один раз при заходе.
        const badge = activity[item.href] ?? (item.href === '/employer' ? 0 : item.badge);
        // Пока открыт сам раздел «Отклики», значок на нём не нужен: человек уже
        // смотрит на то, о чём он сообщает (сервер снимет отметку при показе страницы)
        const seenHere = active && item.href === '/applications';
        const hasBadge = badge !== undefined && badge > 0 && !seenHere;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={'nav:' + item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={item.hideLabel ? item.label : undefined}
            title={item.hideLabel ? item.label : undefined}
            className={cn(
              'relative flex items-center rounded-full text-small font-medium transition-colors duration-300',
              // Иконка без подписи — фиксированный квадрат: у всех вкладок
              // одинаковая ширина, поэтому подложка активной вкладки просто
              // скользит, а не меняет размер, переезжая между ними
              item.hideLabel ? 'size-10 justify-center' : 'gap-1.5 px-3.5 py-2',
              active ? 'text-paper' : 'text-paper-dim hover:text-paper',
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={springSoft}
                className="absolute inset-0 rounded-full border border-[var(--hairline-strong)] bg-paper/[0.09]"
              />
            )}
            {item.icon && <span className="relative flex shrink-0 items-center">{item.icon}</span>}
            <span className={cn('relative whitespace-nowrap', item.hideLabel && 'sr-only')}>{item.label}</span>
            {hasBadge && item.hideLabel && (
              // Значок точкой поверх иконки — не в общем потоке: иначе он
              // и растягивал бы вкладку ровно так же, как раньше текст
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent-300 px-1 text-center text-caption font-semibold leading-[18px] text-ink"
              >
                {badge}
              </span>
            )}
            {hasBadge && !item.hideLabel && (
              <span
                className={cn(
                  'relative min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-caption leading-none tabular-nums',
                  active ? 'bg-accent-500/35 text-accent-100' : 'bg-paper/[0.08] text-paper-dim',
                )}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
