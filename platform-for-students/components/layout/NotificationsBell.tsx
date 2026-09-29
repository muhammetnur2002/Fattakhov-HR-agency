'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { springSnappy } from '@/lib/motion';
import { cn, timeAgo } from '@/lib/utils';

interface BellItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
}

/** Как часто сверяемся с сервером, пока вкладка открыта и видна. */
const POLL_MS = 30_000;

/**
 * Колокольчик студента: статусы откликов, сообщения работодателей, решения
 * по справке и напоминания. Заменяет кнопку «Выйти» в шапке — выход теперь
 * в конце профиля.
 *
 * Открытие панели отмечает всё прочитанным, но строки остаются выделенными,
 * пока панель открыта: иначе человек не поймёт, что именно было новым.
 */
export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<BellItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { unread: number; notifications: BellItem[] };
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* сеть моргнула — следующая сверка догонит */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening && unread > 0) {
      setUnread(0);
      void fetch('/api/notifications', { method: 'POST' }).catch(() => null);
    }
    // Закрыли — обновляем список: прочитанное перестаёт быть выделенным
    if (!opening) void load();
  }

  return (
    <div ref={boxRef} className="relative">
      <motion.button
        type="button"
        onClick={toggle}
        whileHover={{ y: -1.5 }}
        whileTap={{ scale: 0.92 }}
        transition={springSnappy}
        aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : 'Уведомления'}
        aria-expanded={open}
        title="Уведомления"
        data-tour="bell"
        className="relative grid size-10 shrink-0 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/50 text-paper/55 backdrop-blur transition-colors hover:border-paper/30 hover:text-paper"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-accent-500 px-1 text-center text-[9.5px] font-semibold leading-[16px] text-ink"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </motion.button>

      {open && (
        <div className="absolute right-0 top-12 z-[60] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-graphite-900 shadow-2xl">
          <p className="border-b border-[var(--hairline)] px-4 py-3 text-[13px] font-medium text-paper">Уведомления</p>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-paper-faint">Пока ничего нового.</p>
          ) : (
            <ul className="max-h-[min(26rem,70dvh)] overflow-y-auto overscroll-contain p-1.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (item.href) router.push(item.href);
                    }}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-paper/[0.06]',
                      !item.read && 'bg-accent-500/[0.08]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-accent-400')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium leading-snug text-paper">{item.title}</span>
                      {item.body && (
                        <span className="mt-0.5 block break-words text-[12.5px] leading-snug text-paper-dim">{item.body}</span>
                      )}
                      <span className="mt-1 block text-[11.5px] text-paper-faint">{timeAgo(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
