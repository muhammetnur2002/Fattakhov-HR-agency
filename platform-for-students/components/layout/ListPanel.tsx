'use client';

import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import styles from './ListPanel.module.css';

/** Only this viewport scrolls. The toolbar returns as soon as the reader scrolls back. */
export function ListPanel({ toolbar, children, fixed = false, className }: {
  toolbar: ReactNode; children: ReactNode; fixed?: boolean; className?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const travel = useRef(0);
  return <section data-list-panel data-fixed={fixed} className={cn(styles.panel, className)} onScroll={event => {
    if (fixed) return;
    const el = event.currentTarget;
    const top = Math.max(0, Math.min(el.scrollTop, el.scrollHeight - el.clientHeight));
    const delta = top - last.current;
    last.current = top;
    travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
    if (top < 24 || travel.current < -10) setHidden(false);
    else if (top > 64 && travel.current > 18) setHidden(true);
  }}>
    <div data-list-toolbar data-hidden={!fixed && hidden} className={styles.toolbar} onFocusCapture={() => setHidden(false)}>{toolbar}</div>
    <div className={styles.content}>{children}</div>
  </section>;
}
