'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftRight, BookOpen, Compass, UserRound, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TourController } from '@/components/onboarding/Tour';
import { springSnappy } from '@/lib/motion';
import { TOUR_START_EVENT } from '@/lib/tour';
import { forgetThisDevice } from '@/lib/push/client';
import { cn } from '@/lib/utils';

/** Меню профиля и помощи, доступное с клавиатуры и на телефоне. */
export function UserMenu({
  name,
  photoUrl,
  subtitle,
  href,
  backToCrmUrl,
  bell,
}: {
  name: string;
  /** Фото из профиля студента — в кружке вместо инициалов; без фото остаются инициалы */
  photoUrl?: string | null;
  subtitle?: string;
  href?: string;
  /** Вместо кнопки «Выйти» — например, колокольчик студента; выход тогда живёт в другом месте */
  bell?: React.ReactNode;
  /** Пришёл из CRM (сотрудник агентства или представитель клиента) — вернуться туда же. */
  backToCrmUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!helpOpen) return;
    function onDown(event: PointerEvent) {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) setHelpOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { setHelpOpen(false); triggerRef.current?.focus(); }
    }
    // Safari may blur a tapped control with relatedTarget=null before click.
    // Close only when focus actually arrives outside, never on that transient blur.
    function onFocus(event: FocusEvent) {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) setHelpOpen(false);
    }
    document.addEventListener('focusin', onFocus);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  async function logout() {
    setPending(true);
    // Пока сессия жива: после выхода сервер уже не примет отписку
    await forgetThisDevice();
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/');
    router.refresh();
  }

  const cardClass =
    'flex items-center gap-2.5 rounded-full border border-[var(--hairline)] bg-graphite-900/50 p-1 lg:pr-3.5 backdrop-blur';
  const card = (
    <>
      <Avatar name={name} src={photoUrl} size={30} />
      <span className="hidden min-w-0 lg:block">
        <span className="block max-w-[11rem] truncate text-small font-medium leading-tight text-paper">
          {name}
        </span>
        {subtitle && (
          <span className="block max-w-[11rem] truncate text-caption leading-tight text-paper-faint">
            {subtitle}
          </span>
        )}
      </span>
    </>
  );

  const roundButton =
    'grid size-10 shrink-0 place-items-center rounded-full border border-[var(--hairline)] bg-graphite-900/50 text-paper/55 backdrop-blur transition-colors';

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {backToCrmUrl && (
        <motion.a
          href={backToCrmUrl}
          whileHover={{ y: -1.5 }}
          whileTap={{ scale: 0.92 }}
          transition={springSnappy}
          aria-label="Открыть CRM"
          title="Открыть CRM"
          className={cn(roundButton, 'hover:border-paper/30 hover:text-paper')}
        >
          <ArrowLeftRight className="size-4" />
        </motion.a>
      )}

      <div ref={helpRef} data-tour="help" className="relative">
        <motion.button
          ref={triggerRef}
          type="button"
          onClick={() => setHelpOpen((value) => !value)}
          whileHover={{ y: -1.5 }}
          whileTap={{ scale: 0.92 }}
          transition={springSnappy}
          aria-label="Меню профиля"
          aria-controls={menuId}
          aria-expanded={helpOpen}
          title="Профиль и помощь"
          data-tour="profile"
          className={cn(cardClass, 'shrink-0 transition-colors hover:border-[var(--hairline-strong)]')}
        >
          {card}
        </motion.button>
        {helpOpen && (
          <div id={menuId} className="absolute right-0 top-12 z-[60] w-60 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--hairline)] bg-graphite-900 p-1.5 shadow-2xl">
            {href && <Link href={href} onClick={() => setHelpOpen(false)} className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-small text-paper hover:bg-paper/[0.06]">
              <UserRound className="size-4 shrink-0 text-accent-300" aria-hidden />
              Профиль
            </Link>}
            <button
              type="button"
              onClick={() => {
                setHelpOpen(false);
                window.dispatchEvent(new Event(TOUR_START_EVENT));
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-small text-paper transition-colors hover:bg-paper/[0.06]"
            >
              <Compass className="size-4 shrink-0 text-accent-300" aria-hidden />
              Как пользоваться
            </button>
            <Link
              href="/help"
              onClick={() => setHelpOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-small text-paper transition-colors hover:bg-paper/[0.06]"
            >
              <BookOpen className="size-4 shrink-0 text-accent-300" aria-hidden />
              Частые вопросы
            </Link>
          </div>
        )}
      </div>

      {bell ?? (!href && (
        <motion.button
          type="button"
          onClick={logout}
          disabled={pending}
          whileHover={{ y: -1.5 }}
          whileTap={{ scale: 0.92 }}
          transition={springSnappy}
          aria-label="Выйти из аккаунта"
          title="Выйти"
          className={cn(roundButton, 'hover:border-danger/40 hover:text-danger disabled:opacity-50')}
        >
          <LogOut className="size-4" />
        </motion.button>
      ))}

      <TourController />
    </div>
  );
}
