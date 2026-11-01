'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Persist a visit only after mount, never during server render/prefetch. */
export function useActivityBadges(enabled = true) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    let marked = false;
    async function refresh() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const response = await fetch('/api/activity', { cache: 'no-store' });
        if (!response.ok || stopped) return;
        const data = await response.json() as { badges: Record<string, number>; observedAt: string };
        const section = pathname === '/applications' ? 'applications' : pathname === '/skipped' ? 'skipped' : null;
        if (section && !marked) {
          const result = await fetch('/api/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, observedAt: data.observedAt }) });
          if (result.ok) { marked = true; data.badges[pathname] = 0; }
        }
        if (!stopped) setBadges(data.badges);
      } catch { /* Retry on focus, event or next poll. */ }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 20_000);
    const changed = () => void refresh();
    window.addEventListener('activity-changed', changed);
    document.addEventListener('visibilitychange', changed);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('activity-changed', changed); document.removeEventListener('visibilitychange', changed); };
  }, [enabled, pathname]);
  return badges;
}
