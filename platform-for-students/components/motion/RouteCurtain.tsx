'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CubeMark } from '@/components/brand/CubeMark';
import { easeInOutQuint } from '@/lib/motion';

type Phase = 'idle' | 'covering' | 'covered' | 'revealing';

const CurtainContext = createContext<(href: string) => void>(() => {});

/** Переход со шторкой. Для обычной навигации достаточно <Link>. */
export function useCurtainNav() {
  return useContext(CurtainContext);
}

/**
 * Полноэкранный переход между витриной и продуктом.
 *
 * Шторка закрывает экран, под ней происходит навигация, затем она
 * уходит вверх. Смысл не в эффектности: между лендингом и мастером
 * регистрации меняется всё — сетка, плотность, роль пользователя, — и
 * прямая склейка читается как сбой. Шторка даёт этому переходу длину.
 *
 * Живёт в корневом макете, потому что должна пережить смену страницы:
 * компонент внутри уходящего экрана исчез бы вместе с ним.
 */
export function RouteCurtain({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('idle');
  const target = useRef<string | null>(null);

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;
      if (reduced) {
        router.push(href);
        return;
      }
      target.current = href;
      setPhase('covering');
      // Пуш заранее: Next начнёт грузить страницу, пока шторка едет,
      // и к моменту, когда экран закрыт, она чаще всего уже готова
      router.push(href);
    },
    [pathname, reduced, router],
  );

  // Дошли до цели — открываемся
  useEffect(() => {
    if (phase === 'covered' && target.current === pathname) {
      setPhase('revealing');
    }
  }, [pathname, phase]);

  // Страховка: если навигация не случилась (ошибка, отменённый роут),
  // экран не должен остаться закрытым насовсем
  useEffect(() => {
    if (phase !== 'covering' && phase !== 'covered') return;
    const timer = setTimeout(() => setPhase('revealing'), 2600);
    return () => clearTimeout(timer);
  }, [phase]);

  const value = useMemo(() => navigate, [navigate]);
  const visible = phase === 'covering' || phase === 'covered' || phase === 'revealing';

  return (
    <CurtainContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {visible && (
          <motion.div
            key="curtain"
            className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-ink"
            initial={{ y: '100%' }}
            animate={{ y: phase === 'revealing' ? '-100%' : '0%' }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.62, ease: easeInOutQuint }}
            onAnimationComplete={() => {
              if (phase === 'covering') setPhase('covered');
              else if (phase === 'revealing') {
                target.current = null;
                setPhase('idle');
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: phase === 'revealing' ? 0 : 1, scale: 1 }}
              transition={{ duration: 0.4, ease: easeInOutQuint }}
              className="flex flex-col items-center gap-5"
            >
              <CubeMark className="h-16 w-16 text-paper" animate={false} />
              <span className="text-eyebrow uppercase text-paper-faint">Fattakhov HR Agency</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CurtainContext.Provider>
  );
}
