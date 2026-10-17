"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import {
  TABBAR_DEBUG_CHANGE_EVENT,
  getTabbarDebug,
  readTabbarDebugFlag,
  readTabbarNoHideFlag,
  subscribeTabbarDebug,
  tabbarDebugSinceScroll,
  type TabbarDebugEntry,
} from "@/lib/tabbar-debug";
import { isIosWebKit, isStandaloneApp } from "@/lib/tabbar-env";

/**
 * Временная отладочная строка нижней панели разделов (lib/tabbar-debug.ts): поверх страницы
 * вверху слева, мелким моноширинным текстом. Показывается, только пока в «Настройках» включён
 * переключатель «Диагностика панели разделов (временно)»; по умолчанию выключена, и без флага
 * компонент не рисует ничего и не слушает ничего, кроме самого флага.
 *
 * Не интерактивна (`pointer-events: none`, скрыта от читалки), стоит `position: fixed` и потому
 * не влияет на раскладку страницы. Намеренно без `transform`, `will-change` и прочих намёков
 * на композитный слой: отладка не должна менять то, что отлаживает.
 *
 * Контрольный квадрат 8×8 внизу слева (`position: fixed; bottom: 0; left: 0`), тоже без
 * `transform`, `backdrop-filter` и `will-change`: обычный фиксированный слой. На скриншоте видно,
 * уехал ли он вместе с панелью (отвязались все фиксированные слои страницы) или остался на месте
 * (отвязалась только панель — слой с размытием и сдвигом). Строка «контроль» даёт его положение числом.
 *
 * Шрифт задан списком прямо здесь, а не утилитой `font-mono`: в теме `--font-mono` указывает
 * на Geist Mono, которого в проекте нет, и утилита давала обычный шрифт текста.
 *
 * Читает положение панели и окна сама: раз в 250 мс и только когда страницу не листают
 * (последний scroll был больше SCROLL_QUIET_MS назад). Чтение раскладки (`getBoundingClientRect`,
 * `getComputedStyle`) заставляет браузер сбросить стили и разметку, а зависание панели — сбой на
 * границе главного потока и композитора: отладка не должна читать раскладку в каждом кадре
 * прокрутки и на каждое событие журнала, иначе «с включённой строкой не зависает» ничего не
 * докажет. Поэтому строка может отставать: сразу после жеста показания раскладки (y, окно, rect,
 * tf, контроль) обновятся не позже, чем через ~0,5 с после остановки. Состояние хука, журнал,
 * метка `data-hidden` и стоп-кран раскладку не трогают и свежие всегда. Воспроизводимость стоит
 * проверять и без строки.
 */

/** Не читать раскладку, пока от последнего scroll прошло меньше этого, мс. */
export const SCROLL_QUIET_MS = 300;

/** Период чтения показаний, мс. */
export const LIVE_READ_MS = 250;

/**
 * Показания, ради которых читается раскладка (`getBoundingClientRect`, `getComputedStyle`,
 * `scrollTop`): положение страницы, окна и панели. Читаются редко и не во время прокрутки.
 */
type Live = {
  pageY: number;
  max: number;
  innerHeight: number;
  clientHeight: number;
  vvHeight: number | null;
  vvTop: number | null;
  vvPageTop: number | null;
  vvScale: number | null;
  rectTop: number | null;
  rectBottom: number | null;
  /** Контрольный квадрат внизу слева: обычный фиксированный слой без transform и размытия. */
  controlTop: number | null;
  controlBottom: number | null;
  transform: string | null;
  standalone: boolean;
  ios: boolean;
};

/**
 * Показания, которые раскладку не трогают (атрибут и флаг в хранилище): их можно перечитывать на
 * каждое событие журнала, и «панель: СКРЫТА (метка: ...)» всегда сверяет свежее с свежим.
 */
type Cheap = {
  /** Метка `data-hidden` на панели прямо сейчас; `null` — панели нет в разметке. */
  markHidden: boolean | null;
  /** Включён стоп-кран «Не прятать панель при прокрутке». */
  noHide: boolean;
};

function readLive(nav: HTMLElement | null, control: HTMLElement | null): Live {
  const scroller = document.scrollingElement ?? document.documentElement;
  const viewport = window.visualViewport;
  const rect = nav?.getBoundingClientRect() ?? null;
  const controlRect = control?.getBoundingClientRect() ?? null;
  return {
    pageY: scroller.scrollTop,
    max: scroller.scrollHeight - scroller.clientHeight,
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    vvHeight: viewport?.height ?? null,
    vvTop: viewport?.offsetTop ?? null,
    vvPageTop: viewport?.pageTop ?? null,
    vvScale: viewport?.scale ?? null,
    rectTop: rect?.top ?? null,
    rectBottom: rect?.bottom ?? null,
    controlTop: controlRect?.top ?? null,
    controlBottom: controlRect?.bottom ?? null,
    transform: nav ? getComputedStyle(nav).transform : null,
    standalone: isStandaloneApp(),
    ios: isIosWebKit(),
  };
}

const n = (value: number | null, digits = 0) => (value === null ? "-" : value.toFixed(digits));
const yesNo = (value: boolean) => (value ? "да" : "нет");

function clock(at: number): string {
  const d = new Date(at);
  const two = (v: number) => String(v).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

/** Текст отладочной строки: чистая функция от показаний, чтобы тест проверял её без DOM. */
export function formatTabbarDebug(
  live: Live & Cheap,
  debug: { hidden: boolean; healed: number; refreshed: number; entries: readonly TabbarDebugEntry[] },
): string {
  const mark = live.markHidden === null ? "панели нет" : yesNo(live.markHidden);
  return [
    `панель: ${debug.hidden ? "СКРЫТА" : "видна"} (метка: ${mark})`,
    `y ${n(live.pageY)} из ${n(live.max)}  окно ${n(live.innerHeight)}/${n(live.clientHeight)}`,
    `vv h ${n(live.vvHeight)} top ${n(live.vvTop, 1)} pageTop ${n(live.vvPageTop, 1)} x${n(live.vvScale, 2)}`,
    `rect t ${n(live.rectTop, 1)} b ${n(live.rectBottom, 1)}`,
    `контроль t ${n(live.controlTop, 1)} b ${n(live.controlBottom, 1)}`,
    `tf ${live.transform ?? "-"}`,
    `лечений ${debug.healed}  освежений ${debug.refreshed}`,
    `iOS: ${yesNo(live.ios)}  приложение: ${yesNo(live.standalone)}`,
    `не прятать: ${yesNo(live.noHide)}`,
    ...debug.entries.map((entry) => `${clock(entry.at)} ${entry.text}`),
  ].join("\n");
}

function TabbarDebugView({ navRef }: { navRef: RefObject<HTMLElement | null> }) {
  const debug = useSyncExternalStore(subscribeTabbarDebug, getTabbarDebug, getTabbarDebug);
  const [live, setLive] = useState<Live | null>(null);
  const [cheap, setCheap] = useState<Cheap>({ markHidden: null, noHide: false });
  const controlRef = useRef<HTMLDivElement>(null);

  // Метка и стоп-кран: раскладку не трогают, поэтому обновляются на каждое событие журнала и смену флага
  useEffect(() => {
    const nav = navRef.current;
    setCheap({ markHidden: nav ? nav.hasAttribute("data-hidden") : null, noHide: readTabbarNoHideFlag() });
  }, [navRef, debug]);
  useEffect(() => {
    const read = () => setCheap((prev) => ({ ...prev, noHide: readTabbarNoHideFlag() }));
    window.addEventListener("storage", read);
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, read);
    };
  }, []);

  // Показания окна и панели: один раз при показе и затем раз в LIVE_READ_MS, пропуская периоды, когда
  // страницу листают. На прокрутку, на смену размера и на события журнала не подписываемся: каждое
  // такое чтение раскладки — лишний сброс стилей в самый чувствительный момент
  useEffect(() => {
    const measure = () => setLive(readLive(navRef.current, controlRef.current));
    measure();
    const interval = window.setInterval(() => {
      const since = tabbarDebugSinceScroll();
      if (since !== null && since < SCROLL_QUIET_MS) return;
      measure();
    }, LIVE_READ_MS);
    return () => window.clearInterval(interval);
  }, [navRef]);

  return (
    <>
      <div
        aria-hidden
        data-testid="tabbar-debug"
        className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+2px)] left-0.5 z-[2147483647] max-w-[calc(100vw-4px)] overflow-hidden rounded bg-black/80 px-1.5 py-1 [font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-[9px] leading-[1.25] whitespace-pre text-[#9dffb0] select-none print:hidden"
      >
        {live ? formatTabbarDebug({ ...live, ...cheap }, debug) : "…"}
      </div>
      <div
        ref={controlRef}
        aria-hidden
        data-testid="tabbar-debug-control"
        className="pointer-events-none fixed bottom-0 left-0 z-[2147483647] h-[8px] w-[8px] bg-[#ff2bd6] print:hidden"
      />
    </>
  );
}

/** Строка отладки для панели `navRef`; без флага в «Настройках» — ничего. */
export function TabbarDebug({ navRef }: { navRef: RefObject<HTMLElement | null> }) {
  // Флаг читается после показа, не при первой отрисовке: на сервере localStorage нет, и разметка
  // сервера и клиента обязана совпасть
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(readTabbarDebugFlag());
    read();
    // Другая вкладка сменила флаг — `storage`; эта — своё событие
    window.addEventListener("storage", read);
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, read);
    };
  }, []);
  return on ? <TabbarDebugView navRef={navRef} /> : null;
}
