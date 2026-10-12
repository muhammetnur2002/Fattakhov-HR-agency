"use client";

import { unstable_isUnrecognizedActionError as isStaleAction } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * «Страница устарела» не глотаем в catch вокруг серверного действия.
 *
 * Вкладка, открытая до выкатки новой версии, шлёт действие, которого сервер уже не знает
 * (UnrecognizedActionError). Без перехвата такое исключение доходит до экрана «Страница
 * устарела» (components/shell/error-screen.tsx) — человек узнаёт, что нужно обновить страницу.
 * Пустой `catch { … "нет связи, повторите" }` его проглатывал: повтор с устаревшей вкладки
 * больше никогда не проходит, а подсказка врала.
 *
 * Использование: `const guardStale = useStaleGuard();` и в catch первым делом
 * `if (guardStale(error)) return;`. Исключение пробрасывается в ближайшую границу ошибок
 * обновлением состояния — это работает из любого асинхронного обработчика, а не только
 * из transition.
 */
export function useStaleGuard(): (error: unknown) => boolean {
  const [, rethrow] = useState<null>(null);
  return useCallback((error: unknown) => {
    if (!isStaleAction(error)) return false;
    rethrow(() => {
      throw error;
    });
    return true;
  }, []);
}
