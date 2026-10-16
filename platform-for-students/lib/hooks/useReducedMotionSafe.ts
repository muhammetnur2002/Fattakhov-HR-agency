'use client';

import { useSyncExternalStore } from 'react';

/**
 * «Уменьшение движения» в системе — безопасно для гидратации.
 *
 * Хук `useReducedMotion` из framer-motion на клиенте читает `matchMedia` уже в первом рендере,
 * а сервер не знает ни о каком медиазапросе и отдаёт `null`. Разметка, пришедшая с сервера, и
 * первый клиентский рендер расходились: React выбрасывал серверный HTML целиком («Minified React
 * error #418»), страница перерисовывалась с нуля, шрифты предзагружались второй раз, а LCP на
 * медленном телефоне уходил с 0,7 до 2,7 секунды. Страдали именно те, кто включил режим
 * (сверка 16.10.2026).
 *
 * Здесь серверный снимок — всегда `false`: первый клиентский рендер при гидратации совпадает с
 * серверной разметкой, а настоящее значение React подставляет сразу следом обычным обновлением
 * (не расхождением). Подписка на `change` сохраняется: переключили режим в системе при открытой
 * странице — страница это увидит.
 *
 * Во всех компонентах вместо `useReducedMotion` из framer-motion брать этот хук: правило держит
 * `tests/unit.ts` (раздел «Уменьшение движения»).
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Без `matchMedia` (старый движок, тестовая среда) считаем, что движение разрешено. */
function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
}

export function subscribeReducedMotion(onChange: () => void): () => void {
  const list = query();
  if (!list) return () => {};
  // Safari до 14 знает только addListener
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }
  list.addListener(onChange);
  return () => list.removeListener(onChange);
}

export function getReducedMotionSnapshot(): boolean {
  return query()?.matches ?? false;
}

/** То, что видит сервер и первый клиентский рендер при гидратации. */
export function getReducedMotionServerSnapshot(): boolean {
  return false;
}

export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}
