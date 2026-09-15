'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { SwipeCard } from '@/components/swipe/SwipeCard';
import { VacancyDetail } from '@/components/swipe/VacancyDetail';
import type { SwipeDirection, VacancyDTO } from '@/lib/types';

interface Slot {
  key: string;
  vacancy: VacancyDTO;
}

/**
 * Живая колода на витрине.
 *
 * Это не видео и не картинка: карточки перетаскиваются по-настоящему,
 * тем же компонентом, что и в продукте. Пока посетитель не тронул
 * колоду, она листает себя сама — показывает, что вообще нужно делать.
 * После первого касания автоперелистывание выключается навсегда:
 * подхватывать управление из-под руки — худшее, что может сделать
 * интерфейс.
 */
export function DemoDeck({ vacancies }: { vacancies: VacancyDTO[] }) {
  const reduced = useReducedMotion();
  const [slots, setSlots] = useState<Slot[]>(() =>
    vacancies.map((vacancy, index) => ({ key: `${vacancy.id}-${index}`, vacancy })),
  );
  const [exitDir, setExitDir] = useState(1);
  const [detail, setDetail] = useState<VacancyDTO | null>(null);
  const [touched, setTouched] = useState(false);
  const progress = useMotionValue(0);
  const counter = useRef(vacancies.length);

  function advance(direction: SwipeDirection) {
    setExitDir(direction === 'RIGHT' ? 1 : -1);
    progress.set(0);
    setSlots((current) => {
      const [first, ...rest] = current;
      if (!first) return current;
      // Карточка возвращается в конец очереди с новым ключом: тот же
      // ключ React принял бы за «никуда не уходила»
      return [...rest, { key: `${first.vacancy.id}-${counter.current++}`, vacancy: first.vacancy }];
    });
  }

  useEffect(() => {
    if (touched || reduced || detail) return;
    const timer = setInterval(() => advance(Math.random() > 0.45 ? 'RIGHT' : 'LEFT'), 3400);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, reduced, detail]);

  return (
    <div className="relative mx-auto h-[clamp(408px,52vh,500px)] w-full max-w-[23rem]">
      {/* Тень-подложка: колода должна лежать НА чём-то, иначе она висит */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-6 left-1/2 h-16 w-[80%] -translate-x-1/2 rounded-[50%] bg-ink/80 blur-2xl"
      />

      <AnimatePresence custom={exitDir}>
        {slots.slice(0, 3).map((slot, index) => (
          <SwipeCard
            key={slot.key}
            vacancy={slot.vacancy}
            index={index}
            isTop={index === 0}
            onDecide={(direction) => {
              setTouched(true);
              advance(direction);
              // Витринная колода бесконечна и принимает любой жест
              return true;
            }}
            onOpen={() => {
              setTouched(true);
              setDetail(slot.vacancy);
            }}
            onProgress={(value) => {
              if (value !== 0) setTouched(true);
              progress.set(value);
            }}
          />
        ))}
      </AnimatePresence>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: touched ? 0 : 1 }}
        transition={{ duration: 0.5, delay: 1.6 }}
        className="pointer-events-none absolute -bottom-11 left-0 right-0 text-center text-[12px] text-paper-faint"
      >
        Попробуйте — карточку можно смахнуть прямо здесь
      </motion.p>

      <VacancyDetail vacancy={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
