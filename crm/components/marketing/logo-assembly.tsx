"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/**
 * Сетка плиток: 5x5. Меньше — распад выглядит грубо, больше — десятки
 * одинаковых <img> в разметке ради эффекта, который держится секунды.
 */
const GRID = 5;

/** Ширина и высота знака (px, как в `mark-light.png`): задают пропорцию блока. */
const MARK_W = 222;
const MARK_H = 256;

/**
 * Запас на стыках плиток. Соседние плитки встают на дробные пиксели, и между ними
 * тонкой линией просвечивает фон. Лишний пиксель справа и снизу прячет шов: плитка
 * показывает ту же картинку дальше, так что знак не искажается.
 */
const SEAM = 1;

/** С какого прогресса плитка начинает лететь (разброс 0..START_SPREAD) и сколько лететь. */
const START_SPREAD = 0.45;
const FLIGHT = 0.55;

/** Куда сдвинута плитка до начала сборки, px, и на сколько повёрнута, градусы. */
const MAX_SHIFT = 280;
const MAX_TURN = 70;

export type Tile = {
  col: number;
  row: number;
  /** Смещение и поворот в начале (прогресс 0). */
  dx: number;
  dy: number;
  turn: number;
  /** С какого прогресса секции плитка начинает движение. */
  start: number;
};

/**
 * Детерминированный генератор (mulberry32). Math.random дал бы разные плитки на сервере и в
 * браузере, и React ругался бы на расхождение разметки при гидратации. Здесь одно зерно —
 * всегда один и тот же «взрыв».
 */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Значения плиток считаются один раз при загрузке модуля, а не на каждом кадре и не на каждом рендере. */
export const TILES: Tile[] = (() => {
  const rnd = seeded(20261017);
  const signed = (max: number) => Math.round((rnd() * 2 - 1) * max);
  const tiles: Tile[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      tiles.push({
        col,
        row,
        dx: signed(MAX_SHIFT),
        dy: signed(MAX_SHIFT),
        turn: signed(MAX_TURN),
        start: Math.round(rnd() * START_SPREAD * 1000) / 1000,
      });
    }
  }
  return tiles;
})();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Плавное замедление к концу: плитка «садится» на место, а не втыкается. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Округление: лишние знаки после запятой в стилях ничего не дают, а строки раздувают. */
const round = (v: number, scale = 10) => Math.round(v * scale) / scale;

/** Стиль плитки при данном прогрессе секции (0 — разбросана и невидима, 1 — на месте). */
export function tileStyle(tile: Tile, progress: number): { transform: string; opacity: string } {
  const e = easeOut(clamp01((progress - tile.start) / FLIGHT));
  const k = 1 - e;
  return {
    transform: `translate3d(${round(tile.dx * k)}px, ${round(tile.dy * k)}px, 0) rotate(${round(tile.turn * k)}deg)`,
    // Проявляется быстрее, чем летит: к середине полёта плитка уже непрозрачна
    opacity: String(round(clamp01(e * 2), 1000)),
  };
}

/**
 * Где на экране проходит «0» и «1». Блок стоит справа от шагов и тянется на их высоту:
 * сборка начинается, когда его верх поднялся до 75% высоты окна, и заканчивается, когда
 * пройдено 90% его высоты. Тогда знак успевает стать цельным, пока шаги ещё на виду.
 */
const START_AT = 0.75;
const RANGE = 0.9;

/**
 * Знак «HR», который собирается из кусков по мере прокрутки раздела «Как это работает».
 *
 * Анимация привязана к положению прокрутки, а не ко времени: вниз знак собирается, вверх
 * разбирается. Это украшение, поэтому весь блок скрыт от читалок (шаги слева остаются
 * единственным содержанием) и не берёт фокус.
 *
 * Только от 1024px: на телефоне блока нет в потоке (`hidden`), и слушатели там не
 * заводятся вовсе. Прокрутку слушаем, только пока блок в окне (IntersectionObserver), —
 * на остальной странице обработчика нет.
 *
 * Скорость:
 * - один пассивный обработчик, работа в `requestAnimationFrame`, раз за кадр читаем
 *   один прямоугольник блока и больше ничего из вёрстки;
 * - стили плиток пишем прямо в DOM, без состояния React: перерисовка 25 компонентов на каждый
 *   пиксель прокрутки была бы лишней;
 * - меняются только `transform` и `opacity` (`will-change`), раскладку они не трогают;
 * - значения плиток посчитаны один раз (`TILES`).
 *
 * Без движения (`prefers-reduced-motion: reduce`) знак сразу цельный: в разметке плитки
 * стоят на местах, а разбросать их может только скрипт. Заодно и без скрипта знак виден целиком.
 */
export function LogoAssembly() {
  const rootRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const wide = window.matchMedia("(min-width: 1024px)");

    let cleanup: (() => void) | undefined;

    const apply = (progress: number) => {
      TILES.forEach((tile, i) => {
        const el = tileRefs.current[i];
        if (!el) return;
        const s = tileStyle(tile, progress);
        el.style.transform = s.transform;
        el.style.opacity = s.opacity;
      });
    };

    const assemble = () => {
      tileRefs.current.forEach((el) => {
        if (!el) return;
        el.style.transform = "";
        el.style.opacity = "";
      });
    };

    const setup = () => {
      cleanup?.();
      cleanup = undefined;

      // Нет движения или экран узкий: знак цельный, слушателей нет
      if (!motion.matches || !wide.matches) {
        assemble();
        return;
      }

      let frame = 0;
      let last = -1;

      const update = () => {
        frame = 0;
        // Единственное чтение вёрстки за кадр
        const rect = root.getBoundingClientRect();
        const progress = clamp01((window.innerHeight * START_AT - rect.top) / (rect.height * RANGE || 1));
        // Не пишем в DOM, пока прогресс не сдвинулся заметно
        if (Math.abs(progress - last) < 0.001) return;
        last = progress;
        apply(progress);
      };

      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };

      const listen = () => {
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule, { passive: true });
        schedule();
      };
      const unlisten = () => {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      };

      // Исходное состояние сразу, до первой прокрутки
      update();

      const observer = new IntersectionObserver((entries) => {
        if (entries[entries.length - 1]?.isIntersecting) {
          listen();
        } else {
          unlisten();
          // Блок ушёл из окна: ставим крайнее состояние, чтобы при возврате не было скачка
          last = -1;
          update();
        }
      });
      observer.observe(root);

      cleanup = () => {
        observer.disconnect();
        unlisten();
      };
    };

    setup();
    motion.addEventListener("change", setup);
    wide.addEventListener("change", setup);
    return () => {
      motion.removeEventListener("change", setup);
      wide.removeEventListener("change", setup);
      cleanup?.();
    };
  }, []);

  return (
    // Колонка тянется на высоту шагов (grid stretch), внутри знак липнет к верху окна.
    // Пропорция внутреннего блока задана сразу, поэтому место зарезервировано и сдвигов нет
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none hidden lg:block">
      <div
        className="sticky top-28 mx-auto w-full max-w-[22rem]"
        style={{ aspectRatio: `${MARK_W} / ${MARK_H}` }}
        data-logo-assembly
      >
        {TILES.map((tile, i) => (
          <div
            key={i}
            ref={(el) => {
              tileRefs.current[i] = el;
            }}
            className="absolute overflow-hidden will-change-[transform,opacity]"
            data-tile
            style={{
              left: `${(tile.col * 100) / GRID}%`,
              top: `${(tile.row * 100) / GRID}%`,
              width: `calc(${100 / GRID}% + ${SEAM}px)`,
              height: `calc(${100 / GRID}% + ${SEAM}px)`,
            }}
          >
            {/* Каждая плитка показывает свой кусок одной и той же картинки: рисунок растянут на весь знак и сдвинут.
                Это next/image, а не фон CSS: сайт держит правило «никаких картинок фоном» (tests/site-speed-rule).
                Размеры считаются от ширины плитки без шва (100% - SEAM), иначе плитки уезжали бы друг от друга */}
            <Image
              src="/brand/mark-light.png"
              alt=""
              width={MARK_W}
              height={MARK_H}
              quality={92}
              sizes="352px"
              className="absolute max-w-none"
              style={{
                width: `calc((100% - ${SEAM}px) * ${GRID})`,
                height: `calc((100% - ${SEAM}px) * ${GRID})`,
                left: `calc((100% - ${SEAM}px) * ${-tile.col})`,
                top: `calc((100% - ${SEAM}px) * ${-tile.row})`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
