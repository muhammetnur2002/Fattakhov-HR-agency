'use client';

import { forwardRef, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { durations, easeOutExpo } from '@/lib/motion';

/**
 * Поля ввода.
 *
 * Подпись живёт внутри рамки, пока поле пустое, и плавно исчезает, как
 * только в поле появляется текст. Раньше она оставалась на месте, и в
 * длинных подписях — «Цели и профессиональные интересы» — переносилась на
 * две строки, а набираемый текст шёл прямо по ней.
 *
 * Исчезает только нарисованная подпись. Рядом всегда стоит она же,
 * скрытая визуально, и именно её читает экранный диктор: поле не должно
 * становиться безымянным оттого, что в нём что-то напечатали.
 *
 * Правило касается полей, где текст набирают руками. У списка выбора
 * подпись остаётся: там значение подставляется само, и без подписи
 * непонятно, что именно выбрано.
 *
 * Ошибка не подменяет подпись, а появляется под полем: подмена сбивает
 * высоту строки и дёргает всю форму.
 */

const shellBase =
  'relative w-full rounded-xl border bg-graphite-900/55 transition-[border-color,box-shadow,background-color] duration-300 ease-out-expo';

function shellClasses(focused: boolean, invalid: boolean) {
  return cn(
    shellBase,
    invalid
      ? 'border-danger/60 shadow-[0_0_0_3px_rgba(180,83,79,0.12)]'
      : focused
        ? 'border-accent-400/70 bg-graphite-850/70 shadow-[0_0_0_3px_rgba(110,136,162,0.14)]'
        : 'border-[var(--hairline)] hover:border-paper/20',
  );
}

interface BaseProps {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
}

function FieldError({ error, hint }: { error?: string; hint?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {error ? (
        <motion.p
          key="error"
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: durations.fast, ease: easeOutExpo }}
          className="overflow-hidden pl-1 pt-1.5 text-[12.5px] leading-snug text-danger"
        >
          {error}
        </motion.p>
      ) : hint ? (
        <motion.p
          key="hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pl-1 pt-1.5 text-[12.5px] leading-snug text-paper-faint"
        >
          {hint}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Подпись, скрытая визуально, но не от экранного диктора.
 *
 * Это и есть настоящая `label` поля: видимая подпись рядом — только
 * рисунок, помеченный `aria-hidden`. Две `label` на одно поле диктор
 * прочитал бы дважды.
 */
function HiddenLabel({ id, label }: { id: string; label: string }) {
  return (
    <label htmlFor={id} className="sr-only">
      {label}
    </label>
  );
}

function FloatingLabel({
  id,
  label,
  lifted,
  faded,
}: {
  id: string;
  label: string;
  lifted: boolean;
  faded: boolean;
}) {
  return (
    <>
      <HiddenLabel id={id} label={label} />
      <motion.span
        aria-hidden
        initial={false}
        // Положение при исчезновении — то же, что у поднятой подписи:
        // подпись гаснет на месте, а не уезжает одновременно с угасанием
        animate={
          faded
            ? { y: -14, scale: 0.76, opacity: 0 }
            : lifted
              ? { y: -14, scale: 0.76, opacity: 0.7 }
              : { y: 0, scale: 1, opacity: 0.5 }
        }
        transition={{ duration: durations.fast, ease: easeOutExpo }}
        className="pointer-events-none absolute left-4 top-1/2 origin-left -translate-y-1/2 text-[15px] text-paper"
      >
        {label}
      </motion.span>
    </>
  );
}

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>,
    BaseProps {}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, className, value, onFocus, onBlur, ...props },
  ref,
) {
  const generated = useId();
  const id = props.id ?? generated;
  const [focused, setFocused] = useState(false);
  const filled = String(value ?? '').length > 0;

  return (
    <div className={className}>
      <div className={shellClasses(focused, !!error)}>
        <FloatingLabel id={id} label={label} lifted={focused || filled} faded={filled} />
        <input
          ref={ref}
          id={id}
          value={value}
          aria-invalid={!!error}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="h-[62px] w-full bg-transparent px-4 pb-1.5 pt-6 text-[15px] text-paper outline-none placeholder:text-transparent"
          {...props}
        />
      </div>
      <FieldError error={error} hint={hint} />
    </div>
  );
});

export interface TextAreaFieldProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>,
    BaseProps {
  maxCount?: number;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, error, hint, className, value, maxCount, onFocus, onBlur, ...props }, ref) {
    const generated = useId();
    const id = props.id ?? generated;
    const [focused, setFocused] = useState(false);
    const length = String(value ?? '').length;

    return (
      <div className={className}>
        <div className={shellClasses(focused, !!error)}>
          <HiddenLabel id={id} label={label} />
          <motion.span
            aria-hidden
            initial={false}
            animate={{ opacity: length > 0 ? 0 : 1 }}
            transition={{ duration: durations.fast, ease: easeOutExpo }}
            className="pointer-events-none absolute left-4 right-4 top-3 text-[12.5px] uppercase tracking-[0.1em] text-paper-faint"
          >
            {label}
          </motion.span>
          <textarea
            ref={ref}
            id={id}
            value={value}
            aria-invalid={!!error}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            className="min-h-[124px] w-full resize-none bg-transparent px-4 pb-3 pt-9 text-[15px] leading-relaxed text-paper outline-none"
            {...props}
          />
          {maxCount && (
            <span
              className={cn(
                'absolute bottom-2.5 right-3 text-[11px] tabular-nums transition-colors',
                length > maxCount ? 'text-danger' : 'text-paper-faint',
              )}
            >
              {length}/{maxCount}
            </span>
          )}
        </div>
        <FieldError error={error} hint={hint} />
      </div>
    );
  },
);

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'>,
    BaseProps {
  options: Array<{ value: string; label: string }>;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, className, options, onFocus, onBlur, ...props },
  ref,
) {
  const generated = useId();
  const id = props.id ?? generated;
  const [focused, setFocused] = useState(false);

  return (
    <div className={className}>
      <div className={shellClasses(focused, !!error)}>
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 top-2.5 text-[11px] uppercase tracking-[0.12em] text-paper-faint"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="h-[62px] w-full appearance-none bg-transparent px-4 pb-1.5 pt-6 text-[15px] text-paper outline-none [&>option]:bg-graphite-900 [&>option]:text-paper"
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-paper-faint"
          aria-hidden
        />
      </div>
      <FieldError error={error} hint={hint} />
    </div>
  );
});
