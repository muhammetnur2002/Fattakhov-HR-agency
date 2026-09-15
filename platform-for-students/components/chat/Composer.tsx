'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, Lock } from 'lucide-react';
import { springSnappy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { MESSAGE_MAX_LENGTH } from '@/lib/types';

/**
 * Поле ввода реплики.
 *
 * Enter отправляет, Shift+Enter переносит строку — как во всех
 * мессенджерах, которыми студент пользуется каждый день. Поле растёт под
 * текст до пяти строк и дальше прокручивается: письмо на экран здесь
 * никому не нужно, а обрезать ввод жёстко — грубо.
 */
export function Composer({
  onSend,
  disabled,
  placeholder = 'Написать сообщение…',
}: {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Высота пересчитывается до отрисовки: иначе на каждой букве видно,
  // как поле дёргается на кадр
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [value]);

  const trimmed = value.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !disabled;

  function send() {
    if (!canSend) return;
    onSend(trimmed);
    setValue('');
    ref.current?.focus();
  }

  return (
    <div className="border-t border-[var(--hairline)] bg-ink/70 p-3 backdrop-blur-glass sm:p-4">
      <div
        className={cn(
          'flex items-end gap-2 rounded-2xl border bg-graphite-900/60 p-2 pl-3.5 transition-colors duration-300',
          tooLong
            ? 'border-danger/60'
            : 'border-[var(--hairline)] focus-within:border-accent-400/70 focus-within:bg-graphite-850/70',
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Текст сообщения"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[132px] flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-relaxed text-paper outline-none placeholder:text-paper/30 disabled:opacity-50"
        />

        <motion.button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Отправить"
          whileHover={canSend ? { y: -1.5 } : undefined}
          whileTap={canSend ? { scale: 0.92 } : undefined}
          transition={springSnappy}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-300',
            canSend
              ? 'bg-paper text-ink shadow-[0_6px_20px_-6px_rgba(248,248,248,0.4)]'
              : 'bg-paper/[0.08] text-paper/30',
          )}
        >
          <ArrowUp className="size-4" />
        </motion.button>
      </div>

      <div className="mt-1.5 flex items-center justify-between px-1">
        <span className="text-[11.5px] text-paper-faint">
          Enter — отправить, Shift + Enter — перенос строки
        </span>
        {/* Счётчик появляется на подходе к пределу, а не висит всегда */}
        {trimmed.length > MESSAGE_MAX_LENGTH - 200 && (
          <span className={cn('text-[11.5px] tabular-nums', tooLong ? 'text-danger' : 'text-paper-faint')}>
            {trimmed.length} / {MESSAGE_MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}

/** Заглушка вместо поля, когда писать пока нельзя. */
export function ComposerLocked({ reason }: { reason: string }) {
  return (
    <div className="border-t border-[var(--hairline)] bg-ink/70 p-4 backdrop-blur-glass">
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-graphite-900/40 px-4 py-3.5">
        <Lock className="size-4 shrink-0 text-paper-faint" aria-hidden />
        <p className="text-[13.5px] leading-snug text-paper-dim">{reason}</p>
      </div>
    </div>
  );
}
