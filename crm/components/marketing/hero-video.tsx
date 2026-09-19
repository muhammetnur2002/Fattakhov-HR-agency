"use client";

import { useEffect, useRef } from "react";

/**
 * Фоновый ролик героя.
 *
 * Атрибут autoplay не везде надёжен сам по себе — например, если видео
 * смонтировалось до того, как вкладка стала видимой. Явный play()
 * подстраховывает; беззвучное видео и так разрешено политикой
 * автовоспроизведения, ждать жест пользователя незачем.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    ref.current?.play().catch(() => {
      /* автовоспроизведение отклонено — останется постер, это не критично для фона */
    });
  }, []);

  return (
    <video
      ref={ref}
      aria-hidden
      autoPlay
      muted
      loop
      playsInline
      poster="/brand/slate-speckle.jpg"
      // На узком экране 16:9 вытягивается почти в квадрат, и знак с
      // подписью из ролика перекрывает крупные кнопки, — там достаточно
      // статичного кадра постера.
      className="pointer-events-none absolute inset-0 hidden size-full object-cover motion-reduce:hidden md:block"
    >
      <source src="/brand/hero-loop.mp4" type="video/mp4" />
    </video>
  );
}
