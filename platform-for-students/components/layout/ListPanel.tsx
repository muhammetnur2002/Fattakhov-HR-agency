'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import styles from './ListPanel.module.css';

/** The toolbar stays in place; only the results viewport scrolls. */
export function ListPanel({ toolbar, children, fixed = false, className }: {
  toolbar: ReactNode; children: ReactNode; fixed?: boolean; className?: string;
}) {
  return <section data-list-panel data-fixed={fixed} className={cn(styles.panel, className)}>
    <div data-list-toolbar className={styles.toolbar}>{toolbar}</div>
    <div data-list-results className={styles.content}>{children}</div>
  </section>;
}
