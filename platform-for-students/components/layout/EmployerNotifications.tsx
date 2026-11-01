'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useActivityBadges } from '@/lib/hooks/useActivityBadges';
import { Bell, Inbox, MessageCircle } from 'lucide-react';

/** Links to existing employer activity; application totals are not labelled unread. */
export function EmployerNotifications({ applications, unread }: { applications: number; unread: number }) {
  const activity = useActivityBadges();
  unread = activity['/employer/messages'] ?? unread;
  applications = activity['/employer'] ?? 0;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    const focusOutside = (e: FocusEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('focusin', focusOutside);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('focusin', focusOutside); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="relative">
    <button type="button" data-tour="bell" aria-label="Уведомления" aria-expanded={open} onClick={() => setOpen(!open)} className="relative grid size-10 place-items-center rounded-full text-paper-dim hover:bg-paper/[0.06]">
      <Bell className="size-4" />
      {unread > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent-300" />}
    </button>
    {open && <div className="absolute right-0 top-12 z-[60] w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--hairline)] bg-graphite-900 p-2 shadow-2xl">
      <p className="px-3 py-2 text-small font-medium">Уведомления</p>
      <Link href="/employer/messages" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-small hover:bg-paper/[0.06]"><MessageCircle className="size-4 shrink-0" /><span>{unread ? `Непрочитанных сообщений: ${unread}` : 'Новых сообщений нет'}</span></Link>
      <Link href="/employer" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-small hover:bg-paper/[0.06]"><Inbox className="size-4 shrink-0" /><span>Новых откликов: {applications}</span></Link>
    </div>}
  </div>;
}
