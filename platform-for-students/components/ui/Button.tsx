'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springSnappy } from '@/lib/motion';

/**
 * Кнопка.
 *
 * Реакция на нажатие — пружина, а не transition: палец отпускают с
 * разной скоростью, и упругий отклик читается как физический предмет.
 * Блик по диагонали при наведении есть только у главного действия:
 * если бликует всё, не выделяется ничто.
 *
 * Переход по адресу — ButtonLink, а не <Link><Button/></Link>: ссылка с кнопкой
 * внутри — два интерактивных элемента в одном, клавиатура останавливается на каждом
 * (два кольца фокуса и два Tab на одно действие), а экранный диктор читает «ссылка,
 * кнопка». Один элемент с видом кнопки — одна остановка. Сторож — tests/unit.ts.
 */

type Variant = 'primary' | 'accent' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // hover:bg-white ломался в светлой теме: paper там тёмный, а этот hover
  // был буквальным белым независимо от темы — кнопка на наведении становилась
  // белой с белым (ink) текстом. opacity-90 работает верно в обеих темах.
  primary: 'bg-paper text-ink shadow-[0_8px_24px_-8px_var(--shadow-button-primary)] hover:opacity-90',
  accent:
    'bg-gradient-to-b from-accent-500 to-accent-600 text-paper shadow-glow-accent hover:from-accent-400 hover:to-accent-500',
  ghost: 'bg-transparent text-paper/80 hover:bg-paper/[0.06] hover:text-paper',
  outline:
    'bg-graphite-900/40 text-paper border border-[var(--hairline-strong)] backdrop-blur-sm hover:bg-graphite-800/60 hover:border-paper/25',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-small gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-small gap-2 rounded-xl',
  lg: 'h-14 px-7 text-body gap-2.5 rounded-2xl',
};

function buttonClassName(variant: Variant, size: Size, className?: string) {
  return cn(
    'group relative inline-flex select-none items-center justify-center overflow-hidden',
    'font-medium tracking-[-0.01em] whitespace-nowrap',
    'transition-colors duration-300 ease-out-expo',
    'disabled:pointer-events-none disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

/** Содержимое кнопки и кнопки-ссылки: блик главного действия, значки и подпись */
function ButtonInner({
  variant,
  loading,
  icon,
  iconRight,
  children,
}: {
  variant: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      {variant === 'primary' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/10 to-transparent transition-transform duration-700 ease-out-expo group-hover:translate-x-full"
        />
      )}

      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        icon && <span className="shrink-0 [&>svg]:size-4">{icon}</span>
      )}

      {children && <span className="relative">{children}</span>}

      {iconRight && !loading && (
        <span className="shrink-0 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5 [&>svg]:size-4">
          {iconRight}
        </span>
      )}
    </>
  );
}

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...props },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      // По умолчанию button, а не submit: у голого <button> внутри формы
      // тип submit, и кнопка «показать пароль» или «добавить навык»
      // молча отправляла бы форму. Отправку запрашивают явно.
      type={type}
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { y: -1.5 }}
      whileTap={isDisabled ? undefined : { scale: 0.975, y: 0 }}
      transition={springSnappy}
      className={buttonClassName(variant, size, className)}
      {...props}
    >
      <ButtonInner variant={variant} loading={loading} icon={icon} iconRight={iconRight}>
        {children}
      </ButtonInner>
    </motion.button>
  );
});

const MotionLink = motion.create(Link);

export interface ButtonLinkProps
  extends Pick<HTMLMotionProps<'a'>, 'onClick' | 'target' | 'rel' | 'title' | 'id' | 'download'> {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  /** Внешний адрес — обычный <a>; по умолчанию внешним считается всё, что не начинается с «/» */
  external?: boolean;
  prefetch?: boolean;
  'aria-label'?: string;
}

/**
 * Ссылка с видом кнопки: один элемент <a>, одна остановка Tab, одно кольцо фокуса.
 * Внутренние переходы идут через next/link (предзагрузка, без перезагрузки страницы).
 */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  external,
  prefetch,
  ...props
}: ButtonLinkProps) {
  const isExternal = external ?? !href.startsWith('/');
  const motionProps = {
    whileHover: { y: -1.5 },
    whileTap: { scale: 0.975, y: 0 },
    transition: springSnappy,
  };
  const inner = (
    <ButtonInner variant={variant} icon={icon} iconRight={iconRight}>
      {children}
    </ButtonInner>
  );

  if (isExternal) {
    return (
      <motion.a href={href} className={buttonClassName(variant, size, className)} {...motionProps} {...props}>
        {inner}
      </motion.a>
    );
  }
  return (
    <MotionLink href={href} prefetch={prefetch} className={buttonClassName(variant, size, className)} {...motionProps} {...props}>
      {inner}
    </MotionLink>
  );
}
