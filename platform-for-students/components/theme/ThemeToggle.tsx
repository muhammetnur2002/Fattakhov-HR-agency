'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

const emptySubscribe = () => () => {};

/** До монтирования на клиенте resolvedTheme неизвестен серверу. */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Один переключатель на всё приложение — плавающая кнопка поверх любой
 * страницы (см. app/layout.tsx), а не часть шапки кабинета: экран входа,
 * регистрации и справки шапки не имеют вовсе, а тему выбирать нужно
 * и там. На телефоне — тот же угол, с отступом под безопасную зону.
 *
 * `inline` — кнопка в потоке страницы, в её собственной шапке: у мастера регистрации главный ряд
 * кнопок стоит у нижнего края, и плавающая в углу закрывала «Далее» на коротких экранах при любой
 * прокрутке. Пока на странице есть такая, плавающую прячет правило в globals.css.
 */
export function ThemeToggle({ className, inline = false }: { className?: string; inline?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <button
      type="button"
      aria-label="Переключить тему"
      data-theme-toggle
      data-theme-toggle-inline={inline ? '' : undefined}
      title="Переключить тему"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'grid size-11 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/60 text-paper/70 backdrop-blur-glass transition-colors hover:border-[var(--hairline-strong)] hover:text-paper',
        inline
          ? 'relative shrink-0'
          : 'fixed z-[70] bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] shadow-lift',
        className,
      )}
    >
      {mounted && (resolvedTheme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />)}
    </button>
  );
}
