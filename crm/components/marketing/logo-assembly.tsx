"use client";

import { useEffect, useRef } from "react";

/**
 * Знак «HR» — вектор. Фигуры куба (верхняя грань с «F», левая «H», правая «R») состоят из прямых
 * линий под 30°, поэтому контуры сняты с `public/brand/mark-dark.png` и выровнены в сетке 222x256
 * (как у растра). Растр на 440px мутнел: PNG в 222px растягивался вдвое. Контуры остаются
 * чёткими на любой ширине.
 *
 * Знак поделён на девять кусков по естественным швам: «F» — левое плечо, верхняя и нижняя планка;
 * «H» — две стойки и перекладина; «R» — стойка, петля и ножка. Куски заходят друг под друга на
 * 0,8 единицы: все одного цвета и непрозрачны, поэтому в собранном виде шва нет, а на стыке
 * антиалиасинг не оставляет светлой линии.
 *
 * `d` — путь куска (evenodd: у петли «R» есть окно). `cx`/`cy` — центр куска в сетке знака:
 * от него считается направление вылета и точка вращения.
 */
const MARK_W = 222;
const MARK_H = 256;

type PieceShape = { id: string; d: string; cx: number; cy: number };

const SHAPES: PieceShape[] = [
  { id: "f1", d: "M111 0L111.6 0.4L111.6 32.3L111 32L96.5 40.3L111.6 49.3L111.6 82.4L67.5 57.3L29.5 78.5L4 64.3Z", cx: 87, cy: 44 },
  { id: "f2", d: "M110.8 39.4L110.8 48.8L175.5 87.3L148.3 103.3L110.8 82L110.8 39.4Z", cx: 128, cy: 67 },
  { id: "f3", d: "M111 0L218 63.8L191.5 78.3L111 32L110.8 32.1L110.8 41L110.8 41L110.8 0.1Z", cx: 134, cy: 36 },
  { id: "h1", d: "M0 74L22.8 86L22.8 147.5L23.8 148.1L23.8 177.4L23 177L23 208L0 195.5Z", cx: 17, cy: 152 },
  { id: "h2", d: "M22.2 85.7L22.8 86L22.8 147.5L85 182.5L85 121.5L85.8 121.9L85.8 244L85 243.5L85 211.5L23 177L23 208L22.2 207.6Z", cx: 54, cy: 170 },
  { id: "h3", d: "M84.2 182L85 182.5L85 121.5L106 133.3L106 255.5L85 243.5L85 211.5L84.2 211.1Z", cx: 90, cy: 193 },
  { id: "r1", d: "M139.6 210.9L138.8 211.3L138.8 242L115.8 255.5L115.8 132.5L139.6 119.1ZM138.8 150.5L139.6 150L139.6 179.6L138.8 180Z", cx: 131, cy: 195 },
  { id: "r2", d: "M221.3 73.3L221.3 163.8L196.3 178L197.3 178.7L166.1 197.4L165.5 197L138.8 211.3L138.8 213.8L138.2 214.2L138.2 119.9ZM138.8 150.5L197.5 117L197.5 147.5L138.8 180Z", cx: 172, cy: 175 },
  { id: "r3", d: "M221.3 162.7L221.3 163.8L196.3 178L220 194.5L188.8 213.3L165.5 197L153.1 203.7Z", cx: 195, cy: 188 },
];

/** Центр куба: от него куски разлетаются в стороны. */
const CENTER_X = 111;
const CENTER_Y = 128;

/**
 * Порядок прилёта: по очереди с трёх граней, чтобы знак складывался со всех сторон сразу,
 * а не сначала целиком «F», потом целиком «H».
 */
const ORDER = ["f1", "r1", "h1", "f3", "r2", "h2", "f2", "r3", "h3"];

/** Доля прогресса между стартами соседних кусков и длительность полёта одного. Последний садится на 0.9. */
const STAGGER = 0.055;
const FLIGHT = 0.46;

/** Расстояние вылета и изгиб дуги — в процентах размера знака; начальный масштаб куска. */
const DISTANCE = 42;
const ARC = 12;
const START_SCALE = 0.9;

/** Последняя десятая прогресса: куски уже сели, знак «схлопывается» и коротко вспыхивает. */
const SETTLE_FROM = 0.9;
const SETTLE_SCALE = 0.02;
const SETTLE_GLOW = 0.2;

/**
 * Итоговая видимость собранного знака. Задана на всей группе, а не на каждом куске: куски заходят
 * друг под друга на шве, и при прозрачности 0.7 у каждого шов выходил бы ярче (0.7 + 0.7 поверх).
 * Группа с общей прозрачностью рисуется целиком, и нахлёст не виден. Сами куски проявляются 0→1.
 */
const MARK_OPACITY_CLASS = "opacity-70";

type Piece = PieceShape & {
  /** Куда смещён кусок в начале (проценты размера знака): наружу от центра куба. */
  dx: number;
  dy: number;
  /** Изгиб дуги: поперёк направления вылета. */
  px: number;
  py: number;
  turn: number;
  start: number;
  /** Точка вращения куска: его центр, а не центр знака. */
  origin: string;
};

const round = (v: number, scale = 10) => Math.round(v * scale) / scale;

/**
 * Значения кусков считаются один раз при загрузке модуля и целиком из геометрии: случайных чисел
 * нет, поэтому сервер и браузер строят одну и ту же разметку, а гидратация не расходится.
 */
export const PIECES: Piece[] = SHAPES.map((shape) => {
  const vx = shape.cx - CENTER_X;
  const vy = shape.cy - CENTER_Y;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const order = ORDER.indexOf(shape.id);
  const sign = order % 2 === 0 ? 1 : -1;
  return {
    ...shape,
    dx: round(ux * DISTANCE),
    dy: round(uy * DISTANCE),
    // Поперёк вылета: кусок идёт по дуге, а не по прямой
    px: round(-uy * ARC * sign),
    py: round(ux * ARC * sign),
    turn: sign * (11 + (order % 3) * 3),
    start: round(order * STAGGER, 1000),
    origin: `${((shape.cx / MARK_W) * 100).toFixed(1)}% ${((shape.cy / MARK_H) * 100).toFixed(1)}%`,
  };
});

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Плавное замедление к концу: кусок «садится» на место, а не втыкается. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Стиль куска при данном прогрессе секции (0 — разлетелся и невидим, 1 — на месте). */
export function pieceStyle(piece: Piece, progress: number): { transform: string; opacity: string } {
  const t = clamp01((progress - piece.start) / FLIGHT);
  const e = easeOutCubic(t);
  const u = 1 - e;
  // Дуга: ноль в начале и в конце, максимум посередине пути
  const bow = 4 * u * (1 - u);
  const x = piece.dx * u + piece.px * bow;
  const y = piece.dy * u + piece.py * bow;
  const scale = START_SCALE + (1 - START_SCALE) * e;
  return {
    transform: `translate(${round(x)}%, ${round(y)}%) rotate(${round(piece.turn * u)}deg) scale(${round(scale, 1000)})`,
    // Проявляется раньше, чем долетит: к середине полёта кусок уже плотный
    opacity: String(round(clamp01(t / 0.45), 1000)),
  };
}

/** Финальное «схлопывание»: короткий всплеск от 0 в начале последней десятой до 0 в конце. */
export function settleAmount(progress: number): number {
  const t = clamp01((progress - SETTLE_FROM) / (1 - SETTLE_FROM));
  return Math.sin(Math.PI * t);
}

/**
 * Где на экране проходит «0» и «1». Знак стоит на уровне заголовка третьего шага, то есть ниже верха
 * блока, поэтому считаем по его собственному (непрокрученному) верху: сборка начинается, когда верх
 * знака поднялся до 90% высоты окна, и кончается на 40%. До того как знак прилипнет к верху окна,
 * он уже цельный.
 */
const START_AT = 0.9;
const RANGE = 0.5;

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
 * - стили пишем прямо в DOM, без состояния React: перерисовка на каждый пиксель прокрутки
 *   была бы лишней;
 * - каждый кусок — свой слой с `will-change`, меняются только `transform` и `opacity`;
 *   размытия и фильтров нет, свечение — полупрозрачный радиальный градиент под знаком;
 * - значения кусков посчитаны один раз (`PIECES`).
 *
 * Без движения (`prefers-reduced-motion: reduce`) знак сразу цельный: в разметке куски
 * стоят на местах, а разлететься им может только скрипт. Заодно и без скрипта знак виден целиком.
 */
export function LogoAssembly() {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const wide = window.matchMedia("(min-width: 1024px)");

    let cleanup: (() => void) | undefined;

    // Смещение знака вниз от верха блока, px: его центр встаёт на высоту опорной строки (заголовок
    // третьего шага). Считается при загрузке и при смене размеров, а не на прокрутке: перенос строк
    // в шагах зависит от ширины, и CSS этого заранее не знает.
    let offset = 0;
    const layout = () => {
      const box = boxRef.current;
      const anchor = root.parentElement?.querySelector("[data-assembly-anchor]");
      if (!box || !anchor || !wide.matches) return;
      const rootRect = root.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const center = anchorRect.top - rootRect.top + anchorRect.height / 2;
      // Не выше верха блока и не ниже его низа: иначе знак растянул бы раздел
      const max = Math.max(0, rootRect.height - box.offsetHeight);
      offset = Math.min(Math.max(center - box.offsetHeight / 2, 0), max);
      box.style.marginTop = `${Math.round(offset)}px`;
    };

    const apply = (progress: number) => {
      PIECES.forEach((piece, i) => {
        const el = pieceRefs.current[i];
        if (!el) return;
        const s = pieceStyle(piece, progress);
        el.style.transform = s.transform;
        el.style.opacity = s.opacity;
      });
      const settle = settleAmount(progress);
      if (groupRef.current) {
        groupRef.current.style.transform = settle > 0.001 ? `scale(${round(1 + SETTLE_SCALE * settle, 1000)})` : "";
      }
      if (glowRef.current) {
        glowRef.current.style.opacity = String(round(SETTLE_GLOW * settle, 1000));
      }
    };

    const assemble = () => {
      pieceRefs.current.forEach((el) => {
        if (!el) return;
        el.style.transform = "";
        el.style.opacity = "";
      });
      if (groupRef.current) groupRef.current.style.transform = "";
      if (glowRef.current) glowRef.current.style.opacity = "";
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
        const progress = clamp01((window.innerHeight * START_AT - (rect.top + offset)) / (window.innerHeight * RANGE));
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

    const relayout = () => {
      layout();
      setup();
    };
    relayout();

    // Шрифт и перенос строк в шагах меняют их высоту уже после первой отрисовки
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(layout) : undefined;
    resizeObserver?.observe(root);
    window.addEventListener("resize", layout, { passive: true });
    void document.fonts?.ready.then(layout);

    motion.addEventListener("change", relayout);
    wide.addEventListener("change", relayout);
    return () => {
      motion.removeEventListener("change", relayout);
      wide.removeEventListener("change", relayout);
      window.removeEventListener("resize", layout);
      resizeObserver?.disconnect();
      cleanup?.();
    };
  }, []);

  return (
    // Колонка тянется на высоту шагов (grid stretch), внутри знак липнет к верху окна.
    // Пропорция внутреннего блока задана сразу, поэтому место зарезервировано и сдвигов нет.
    // Ширина 210px: на сайте 1rem = 20px (шкала текста), поэтому в пикселях, а не в rem. Знак в 440px
    // забивал пустую половину раздела и выглядел грубо; 180–220px — аккуратная метка, а не плакат
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none hidden lg:block">
      <div
        ref={boxRef}
        className="sticky top-32 mx-auto w-full max-w-[210px] text-white"
        style={{ aspectRatio: `${MARK_W} / ${MARK_H}` }}
        data-logo-assembly
      >
        <div ref={groupRef} className={`absolute inset-0 will-change-transform ${MARK_OPACITY_CLASS}`}>
          {/* Свечение в момент сборки: полупрозрачный радиальный градиент, без blur и filter */}
          <div
            ref={glowRef}
            className="absolute -inset-[25%] opacity-0 will-change-[opacity]"
            data-glow
            style={{
              backgroundImage: "radial-gradient(closest-side, rgba(255,255,255,0.35), rgba(255,255,255,0))",
            }}
          />
          {PIECES.map((piece, i) => (
            <div
              key={piece.id}
              ref={(el) => {
                pieceRefs.current[i] = el;
              }}
              className="absolute inset-0 will-change-[transform,opacity]"
              data-piece={piece.id}
              style={{ transformOrigin: piece.origin }}
            >
              <svg viewBox={`0 0 ${MARK_W} ${MARK_H}`} className="block h-full w-full" fill="currentColor" focusable="false">
                <path d={piece.d} fillRule="evenodd" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
