"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Когда ролик показывается: широкий экран, обычные настройки движения и нормальная сеть.
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

/** Показатели сети из браузера (Network Information API): есть не везде, поэтому всё необязательное. */
type NetworkInformation = EventTarget & { saveData?: boolean; effectiveType?: string };

function connection(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/**
 * Ролик — украшение, а не содержание: 240 КБ ради него не тратим, когда человек просил экономить
 * трафик («Экономия данных») или сеть совсем медленная (2G по оценке браузера). Статичный кадр
 * остаётся. Нет данных о сети (Safari, Firefox) — считаем, что сеть обычная.
 *
 * «3g» ролик НЕ скрывает, хотя раньше скрывал: Chrome выводит `effectiveType` из задержки и скорости и на
 * обычном ноутбуке с посредственным Wi-Fi или через VPN легко показывает «3g». Заметный элемент первого
 * экрана пропадал бы у части обычных посетителей ради выигрыша, которого замер не показал: ролик стартует
 * после LCP (2,4 с против 1,7 с) и на метрики не влияет. Нужно скрывать и на 3G — добавить `"3g"` в
 * `SLOW_TYPES`, тест укажет на строку.
 */
const SLOW_TYPES = ["slow-2g", "2g"];

export function connectionAllowsVideo(): boolean {
  const network = connection();
  if (!network) return true;
  if (network.saveData === true) return false;
  return network.effectiveType === undefined || !SLOW_TYPES.includes(network.effectiveType);
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  const network = connection();
  network?.addEventListener?.("change", onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    network?.removeEventListener?.("change", onChange);
  };
}

const getSnapshot = () => window.matchMedia(QUERY).matches && connectionAllowsVideo();
// На сервере и при гидратации ролика нет: статичный кадр уже на месте, ролик ляжет поверх
const getServerSnapshot = () => false;

/**
 * Фоновый ролик героя.
 *
 * Атрибута `poster` нет намеренно: кадр под роликом (hero.tsx) — тот же рисунок и лежит там
 * всегда, ролик в `<video>` без кадров прозрачен. Свой постер был бы вторым адресом той же
 * картинки (оптимизатор отдаёт кадр героя в WebP под размер экрана, а постер — только один
 * фиксированный адрес) и скачивался бы ещё раз.
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
      /* автовоспроизведение отклонено — останется кадр под роликом, это не критично для фона */
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
      className="pointer-events-none absolute inset-0 size-full object-cover"
    >
      <source src="/brand/hero-loop.mp4" type="video/mp4" />
    </video>
  );
}
