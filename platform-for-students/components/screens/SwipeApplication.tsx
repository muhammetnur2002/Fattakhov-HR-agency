'use client';

import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

const ACTION_WIDTH = 104;

export function SwipeApplication({ children, open, onToggle, busy, disabled, onCancel }: {
  children: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  busy: boolean;
  disabled: boolean;
  onCancel: () => Promise<void>;
}) {
  const [offset, setOffset] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const gesture = useRef<{ x: number; y: number; start: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);
  const translateX = offset ?? (open ? -ACTION_WIDTH : 0);
  const transitionDuration = offset === null ? undefined : '0ms';

  function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (gesture.current?.axis === 'x') {
      if (!cancelled) onToggle((offset ?? 0) < -ACTION_WIDTH / 3);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.current = null;
    setOffset(null);
  }

  return <>
    <div className="relative isolate min-w-0 overflow-hidden rounded-3xl" data-swipe-application data-open={open}>
      <button type="button" aria-label="Отменить отклик" disabled={disabled} tabIndex={open ? 0 : -1}
        aria-hidden={!open} onClick={() => setConfirm(true)}
        className="absolute inset-y-0 right-0 flex w-[104px] flex-col items-center justify-center gap-2 rounded-3xl bg-red-700 px-3 text-center text-caption font-medium text-white transition-transform duration-200 motion-reduce:transition-none disabled:opacity-50"
        style={{ transform: `translateX(${ACTION_WIDTH + translateX}px)`, transitionDuration, pointerEvents: open ? 'auto' : 'none' }}>
        <Trash2 className="size-5" aria-hidden />Отменить отклик
      </button>
      <div className="relative touch-pan-y select-none transition-transform duration-200 motion-reduce:transition-none"
        style={{ transform: `translateX(${translateX}px)`, transitionDuration }}
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (disabled || !event.isPrimary || event.button !== 0) return;
          gesture.current = { x: event.clientX, y: event.clientY, start: open ? -ACTION_WIDTH : 0, axis: null };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
            current.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
            if (current.axis === 'x') event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (current.axis !== 'x') return;
          suppressClick.current = true;
          setOffset(Math.max(-ACTION_WIDTH, Math.min(0, current.start + dx)));
        }}
        onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)}
        onClickCapture={(event) => {
          if (suppressClick.current || open) {
            event.preventDefault(); event.stopPropagation();
            if (!suppressClick.current) onToggle(false);
            suppressClick.current = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape') {
            event.preventDefault(); onToggle(event.key === 'ArrowLeft');
          }
        }}>
        {children}
      </div>
      <button type="button" className="sr-only focus:not-sr-only focus:absolute focus:bottom-2 focus:left-2 focus:z-10 focus:rounded-xl focus:bg-ink focus:p-3"
        onClick={() => onToggle(!open)} aria-expanded={open}>Действия с откликом</button>
    </div>
    <Dialog open={confirm} title="Отменить отклик?" onClose={() => { if (!busy) setConfirm(false); }}
      footer={<><Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirm(false)}>Оставить отклик</Button>
        <Button size="sm" variant="danger" loading={busy} disabled={disabled} onClick={onCancel}>Да, отменить</Button></>}>
      <p className="text-small text-paper-dim">Переписка по этому отклику тоже будет удалена.</p>
    </Dialog>
  </>;
}
