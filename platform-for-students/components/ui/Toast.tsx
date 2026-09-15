'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  show: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast должен вызываться внутри <ToastProvider>');
  return api;
}

const ICON: Record<ToastTone, React.ReactNode> = {
  success: <Check className="size-4" />,
  error: <AlertCircle className="size-4" />,
  info: <Info className="size-4" />,
};

const TONE: Record<ToastTone, string> = {
  success: 'border-yes/40 text-yes-glow',
  error: 'border-danger/45 text-danger',
  info: 'border-accent-400/40 text-accent-200',
};

/**
 * Всплывающие уведомления.
 *
 * Снизу, а не сверху: на телефоне верх экрана занят системной шторкой, а
 * большой палец до него всё равно не дотягивается. Уведомления копятся
 * стопкой и разъезжаются layout-анимацией, так что закрытие среднего не
 * телепортирует остальные.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = ++seq.current;
      setItems((current) => [...current.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ tone: 'success', title, description }),
      error: (title, description) => show({ tone: 'error', title, description }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 12, scale: 0.96, filter: 'blur(6px)' }}
              transition={springSoft}
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-graphite-900/85 p-3.5 pr-2.5',
                'shadow-lift backdrop-blur-glass',
                TONE[item.tone],
              )}
            >
              <span className="mt-0.5 shrink-0">{ICON[item.tone]}</span>
              <div className="flex-1 space-y-0.5">
                <p className="text-[13.5px] font-medium leading-snug text-paper">{item.title}</p>
                {item.description && (
                  <p className="text-[12.5px] leading-snug text-paper-dim">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Закрыть уведомление"
                className="rounded-lg p-1.5 text-paper-faint transition-colors hover:bg-paper/[0.06] hover:text-paper"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
