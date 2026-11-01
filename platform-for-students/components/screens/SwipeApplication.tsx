'use client';

import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import Link from 'next/link';
import { MessageCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

const ACTION_WIDTH = 104;

export function SwipeApplication({ children, open, onToggle, busy, disabled, onCancel, chatHref, onChat, deleteLabel = 'Отменить отклик', deleteDescription = 'Переписка по этому отклику тоже будет удалена.' }: {
  children: ReactNode;
  open: 'cancel' | 'chat' | null;
  onToggle: (open: 'cancel' | 'chat' | null) => void;
  chatHref?: string;
  onChat?: () => void;
  deleteLabel?: string;
  deleteDescription?: string;
  busy: boolean;
  disabled: boolean;
  onCancel: () => Promise<void>;
}) {
  const [offset, setOffset] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const gesture = useRef<{ x: number; y: number; start: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);
  const hasChat = Boolean(chatHref || onChat);
  const restingX = open === 'cancel' ? ACTION_WIDTH : open === 'chat' && hasChat ? -ACTION_WIDTH : 0;
  const translateX = offset ?? restingX;
  const transitionDuration = offset === null ? undefined : '0ms';

  const chatProps = {
    'aria-label': 'В чат', tabIndex: open === 'chat' ? 0 : -1, 'aria-hidden': open !== 'chat',
    className: 'absolute inset-y-0 right-0 flex w-[104px] flex-col items-center justify-center gap-2 rounded-3xl bg-accent-200 px-3 text-center text-caption font-medium text-ink transition-transform duration-200 motion-reduce:transition-none disabled:opacity-50',
    style: { transform: `translateX(${ACTION_WIDTH + translateX}px)`, transitionDuration, pointerEvents: open === 'chat' ? 'auto' as const : 'none' as const },
  };

  function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (gesture.current?.axis === 'x') {
      if (!cancelled) {
        const position = offset ?? restingX;
        onToggle(position > ACTION_WIDTH / 3 ? 'cancel' : position < -ACTION_WIDTH / 3 && hasChat ? 'chat' : null);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.current = null;
    setOffset(null);
  }

  return <>
    <div className="relative isolate min-w-0 overflow-hidden rounded-3xl" data-swipe-application data-open={open}>
      <button type="button" aria-label={deleteLabel} disabled={disabled} tabIndex={open === 'cancel' ? 0 : -1}
        aria-hidden={open !== 'cancel'} onClick={() => setConfirm(true)}
        className="absolute inset-y-0 left-0 flex w-[104px] flex-col items-center justify-center gap-2 rounded-3xl bg-red-700 px-3 text-center text-caption font-medium text-white transition-transform duration-200 motion-reduce:transition-none disabled:opacity-50"
        style={{ transform: `translateX(${-ACTION_WIDTH + translateX}px)`, transitionDuration, pointerEvents: open === 'cancel' ? 'auto' : 'none' }}>
        <Trash2 className="size-5" aria-hidden />{deleteLabel}
      </button>
      {hasChat && (chatHref ? <Link href={chatHref} {...chatProps}><MessageCircle className="size-5" aria-hidden />В чат</Link>
        : <button type="button" onClick={onChat} disabled={disabled} {...chatProps}><MessageCircle className="size-5" aria-hidden />В чат</button>)}
      <div className="relative touch-pan-y select-none transition-transform duration-200 motion-reduce:transition-none"
        style={{ transform: `translateX(${translateX}px)`, transitionDuration }}
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (disabled || !event.isPrimary || event.button !== 0) return;
          gesture.current = { x: event.clientX, y: event.clientY, start: restingX, axis: null };
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
          setOffset(Math.max(hasChat ? -ACTION_WIDTH : 0, Math.min(ACTION_WIDTH, current.start + dx)));
        }}
        onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)}
        onClickCapture={(event) => {
          if (suppressClick.current || open) {
            event.preventDefault(); event.stopPropagation();
            if (!suppressClick.current) onToggle(null);
            suppressClick.current = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape') {
            event.preventDefault(); onToggle(event.key === 'ArrowRight' ? 'cancel' : event.key === 'ArrowLeft' && hasChat ? 'chat' : null);
          }
        }}>
        {children}
      </div>
      <button type="button" className="sr-only focus:not-sr-only focus:absolute focus:bottom-2 focus:left-2 focus:z-10 focus:rounded-xl focus:bg-ink focus:p-3"
        onClick={() => onToggle(open ? null : 'cancel')} aria-expanded={open !== null}>Действия с откликом</button>
    </div>
    <Dialog open={confirm} title={`${deleteLabel}?`} onClose={() => { if (!busy) setConfirm(false); }}
      footer={<><Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirm(false)}>Оставить</Button>
        <Button size="sm" variant="danger" loading={busy} disabled={disabled} onClick={onCancel}>{deleteLabel}</Button></>}>
      <p className="text-small text-paper-dim">{deleteDescription}</p>
    </Dialog>
  </>;
}
