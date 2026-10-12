'use client';

import { motion } from 'framer-motion';
import { Check, CheckCheck } from 'lucide-react';
import { springSoft } from '@/lib/motion';
import { cn, formatTime } from '@/lib/utils';
import type { MessageDTO } from '@/lib/types';

/**
 * Реплика в переписке.
 *
 * Своё — справа с акцентной заливкой, чужое — слева на графите. Срезанный
 * угол у нижней кромки заменяет «хвостик»: он указывает на сторону, но не
 * добавляет в тёмную тему лишнюю фигуру.
 *
 * Подряд идущие реплики одного человека складываются в залп: время
 * показывается только у последней, иначе колонка времени превращается в
 * рябь и мешает читать сам текст.
 */
export function MessageBubble({
  message,
  grouped,
  lastInBurst,
  pending,
  failed,
  onRetry,
  onDiscard,
}: {
  message: MessageDTO;
  /** Продолжение залпа: отступ сверху меньше */
  grouped: boolean;
  /** Последняя реплика залпа: только у неё видно время */
  lastInBurst: boolean;
  /** Ещё летит на сервер */
  pending?: boolean;
  /** Отправка не удалась: реплика остаётся в ленте, её можно повторить или убрать */
  failed?: boolean;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const mine = message.mine;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: pending && !failed ? 0.55 : 1, y: 0, scale: 1 }}
      transition={springSoft}
      className={cn('flex w-full flex-col', mine ? 'items-end' : 'items-start', grouped ? 'mt-1' : 'mt-3')}
    >
      <div
        className={cn(
          // Тень и более плотная заливка — иначе в светлой теме своя и чужая
          // реплики почти сливались с фоном и друг с другом: разница была
          // в 20% прозрачности акцента поверх почти такого же серого, то
          // есть на глаз никакой. Переписка обязана читаться с одного
          // взгляда, кто где, — это чат, а не список полей формы.
          'max-w-[76%] rounded-2xl border px-3.5 py-2.5 shadow-sm sm:max-w-[68%]',
          mine
            ? 'rounded-br-md border-accent-400/40 bg-accent-500/85'
            : 'rounded-bl-md border-[var(--hairline-strong)] bg-graphite-800',
          failed && 'border-danger/70',
        )}
      >
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-paper">
          {message.body}
        </p>

        {lastInBurst && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1.5 text-[11px] tabular-nums',
              mine ? 'justify-end text-paper/70' : 'text-paper-faint',
            )}
          >
            <span>{formatTime(message.createdAt)}</span>
            {/* Галочки только у своих: чужое «прочитано» ничего не сообщает */}
            {mine &&
              (pending ? null : message.readAt ? (
                <CheckCheck className="size-3.5" aria-label="Прочитано" />
              ) : (
                <Check className="size-3.5" aria-label="Отправлено" />
              ))}
          </div>
        )}
      </div>

      {failed && (
        <div role="status" className="mt-1.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[12px]">
          <span className="text-danger">Не отправлено</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-medium text-paper underline underline-offset-2 hover:text-accent-200">
              Повторить
            </button>
          )}
          {onDiscard && (
            <button type="button" onClick={onDiscard} className="text-paper-dim underline underline-offset-2 hover:text-paper">
              Удалить
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** Разделитель дня. Липкий: при прокрутке длинной переписки видно, где мы. */
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center py-3">
      <span className="rounded-full border border-[var(--hairline)] bg-graphite-900/90 px-3 py-1 text-[11.5px] text-paper-faint backdrop-blur">
        {label}
      </span>
    </div>
  );
}
