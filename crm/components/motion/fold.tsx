"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Блок, который сворачивается по высоте, а не исчезает рывком: соседи
 * подтягиваются плавно, а не прыгают.
 *
 * Свернуться по высоте без обрезки нельзя, поэтому overflow: hidden
 * здесь всегда, а по бокам — запас в 8px (-mx-2 px-2): в него помещаются
 * кольцо фокуса полей и подсветка с отрицательным отступом до -mx-2.
 * Снимать обрезку по окончании движения (transitionEnd) пробовали:
 * motion 13 после повторного раскрытия её не снимает, и края срезались.
 * Снизу запас — забота содержимого: кнопке последней строкой нужен pb-1.
 *
 * Отступ до соседей держать внутри содержимого, а не зазором родителя
 * (space-y, gap): зазор вокруг свёрнутого блока остался бы до конца
 * движения и схлопнулся рывком.
 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          data-slot="fold"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="-mx-2 overflow-hidden px-2"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
