"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Когда ролик показывается: широкий экран и обычные настройки движения.
 *
 * На узком экране 16:9 вытягивается почти в квадрат, и знак с подписью из ролика
 * перекрывает крупные кнопки, — там достаточно статичного кадра (он лежит под
 * роликом всегда, см. hero.tsx). При «уменьшить движение» ролик тоже не нужен.
 *
 * Скрывать <video> через CSS мало: невидимый ролик браузер всё равно скачивает
 * (240 КБ на каждом телефоне) и проигрывает. Поэтому элемент не создаётся вовсе,
 * пока запрос не выполнен.
 */
const QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
// На сервере и при гидратации ролика нет: статичный кадр уже на месте, ролик ляжет поверх
const getServerSnapshot = () => false;

/**
 * Фоновый ролик героя.
 *
 * Атрибут autoplay не везде надёжен сам по себе — например, если видео
 * смонтировалось до того, как вкладка стала видимой. Явный play()
 * подстраховывает; беззвучное видео и так разрешено политикой
 * автовоспроизведения, ждать жест пользователя незачем.
 */
export function HeroVideo() {
  const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    ref.current?.play().catch(() => {
      /* автовоспроизведение отклонено — останется постер, это не критично для фона */
    });
  }, [show]);

  if (!show) return null;

  return (
    <video
      ref={ref}
      aria-hidden
      autoPlay
      muted
      loop
      playsInline
      poster="/brand/slate-speckle.jpg"
      className="pointer-events-none absolute inset-0 size-full object-cover"
    >
      <source src="/brand/hero-loop.mp4" type="video/mp4" />
    </video>
  );
}
