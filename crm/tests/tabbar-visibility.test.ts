/**
 * Нижняя панель разделов прячется при прокрутке вниз и возвращается
 * (lib/tabbar-visibility.ts, просьба владельца 17.10.2026).
 *
 * Правила — чистая функция без DOM и часов, поэтому каждое сочетание
 * «прокрутка, остановка, смена раздела, фокус» проверяется таблицей событий.
 * Как это выглядит в браузере — tests/e2e/bottom-tabs-hide.spec.ts; как это
 * подключено к панели — tests/components/bottom-tabs-hide.test.tsx.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EDGE_ZONE_PX,
  FINISH_GUARD_MS,
  GEOMETRY_TOLERANCE_PX,
  HEAL_FAIL_PAUSE_MS,
  HEAL_MIN_INTERVAL_MS,
  HIDE_AFTER_DOWN_PX,
  HIDE_MIN_SCROLL_Y_PX,
  INITIAL_TABBAR_STATE,
  PIN_AFTER_ROUTE_MS,
  SETTLE_MS,
  SHOW_AFTER_UP_PX,
  TABBAR_SLIDE_MS,
  nextTabbarState,
  panelGeometryOk,
  translateYOf,
  type PanelGeometry,
  type TabbarEvent,
  type TabbarState,
} from "@/lib/tabbar-visibility";
import { ROOT, filesMatching, read } from "./helpers/jsx-source";

/** Высота прокручиваемого содержимого: 5000, в окне 600 — прокручивать можно до 4400. */
const MAX = 4400;

const scroll = (dy: number, y: number, extra: Partial<Extract<TabbarEvent, { type: "scroll" }>> = {}): TabbarEvent => ({
  type: "scroll",
  now: 1000,
  source: 0,
  dy,
  y,
  max: MAX,
  ...extra,
});

function feed(events: TabbarEvent[], from: TabbarState = INITIAL_TABBAR_STATE): TabbarState {
  return events.reduce(nextTabbarState, from);
}

/** Прокрутка вниз шагами по `step` пикселей от `from` до `to` включительно. */
function scrollDown(from: number, to: number, step: number, extra: Partial<Extract<TabbarEvent, { type: "scroll" }>> = {}) {
  const events: TabbarEvent[] = [];
  for (let y = from + step; y <= to; y += step) events.push(scroll(step, y, extra));
  return events;
}

/** Спрятанная панель на глубине страницы: так выглядит состояние после листания вниз. */
const hiddenAt = (y: number) => feed([scroll(HIDE_AFTER_DOWN_PX, y)]);

describe("числа правила держатся как решил владелец", () => {
  it("24 px вниз, глубже 80 px, 8 px вверх, зона у краёв 8 px, 600 мс, 2500 мс, 200 мс", () => {
    expect(HIDE_AFTER_DOWN_PX).toBe(24);
    expect(HIDE_MIN_SCROLL_Y_PX).toBe(80);
    expect(SHOW_AFTER_UP_PX).toBe(8);
    expect(EDGE_ZONE_PX).toBe(8);
    expect(SETTLE_MS).toBe(600);
    expect(PIN_AFTER_ROUTE_MS).toBe(2500);
    expect(TABBAR_SLIDE_MS).toBe(200);
    // Запас страховки перехода (lib/hooks/use-tabbar-visibility.ts): после конца выезда
    expect(FINISH_GUARD_MS).toBe(60);
  });
});

describe("прячется при прокрутке вниз", () => {
  it("панель видна, пока ничего не листали", () => {
    expect(INITIAL_TABBAR_STATE.hidden).toBe(false);
  });

  it("одним рывком: 24 px прячут, 23 px — нет", () => {
    expect(feed([scroll(23, 300)]).hidden).toBe(false);
    expect(feed([scroll(24, 300)]).hidden).toBe(true);
    expect(feed([scroll(400, 400)]).hidden).toBe(true);
  });

  it("малыми шагами: прячет на том шаге, где накопилось 24 px, и не раньше", () => {
    // Шаги по 6 px: на четвёртом накоплено 24
    const events = scrollDown(200, 224, 6);
    expect(events).toHaveLength(4);
    expect(feed(events.slice(0, 3)).hidden).toBe(false);
    expect(feed(events).hidden).toBe(true);
  });

  it("кадрами по 23 px (как реальная прокрутка пальцем) прячет на втором кадре, не на первом", () => {
    expect(feed(scrollDown(100, 400, 23)).hidden).toBe(true);
    expect(feed(scrollDown(100, 400, 23).slice(0, 1)).hidden).toBe(false);
  });

  it("дрожание ниже порога не прячет: вперёд-назад копит не больше одного шага", () => {
    const jitter: TabbarEvent[] = [];
    let y = 300;
    for (let i = 0; i < 40; i++) {
      jitter.push(scroll(10, (y += 10)));
      jitter.push(scroll(-5, (y -= 5)));
    }
    expect(feed(jitter).hidden).toBe(false);
  });

  it("и не показывает: разворот меньше 8 px спрятанную панель не возвращает", () => {
    const state = hiddenAt(300);
    expect(feed([scroll(-7, 293)], state).hidden).toBe(true);
    // дрожание вниз-вверх малыми шагами у спрятанной панели — тоже
    expect(feed([scroll(5, 298), scroll(-5, 293), scroll(5, 298), scroll(-7, 291)], state).hidden).toBe(true);
  });
});

describe("не прячет у начала страницы", () => {
  it("на глубине до 80 px включительно панель остаётся, глубже — прячется", () => {
    expect(feed([scroll(40, 80)]).hidden).toBe(false);
    expect(feed([scroll(40, 81)]).hidden).toBe(true);
  });

  it("листание из начала: на 80 px ещё видна, дальше прячется на первом же шаге", () => {
    // Шаги по 20 px: на 20, 40, 60 и 80 панель видна (глубина не больше 80), на 100 накоплено
    // уже 100 px вниз и глубина больше 80 — прячется
    const events = scrollDown(0, 100, 20);
    expect(feed(events.slice(0, 4)).hidden).toBe(false);
    expect(feed(events).hidden).toBe(true);
  });
});

describe("возвращается сразу при прокрутке вверх", () => {
  it("8 px вверх возвращают, 7 — нет", () => {
    const state = hiddenAt(400);
    expect(feed([scroll(-7, 393)], state).hidden).toBe(true);
    expect(feed([scroll(-8, 392)], state).hidden).toBe(false);
  });

  it("малыми шагами: возвращает на том шаге, где накопилось 8 px", () => {
    const state = hiddenAt(400);
    const steps = [scroll(-2, 398), scroll(-2, 396), scroll(-2, 394), scroll(-2, 392)];
    expect(feed(steps.slice(0, 3), state).hidden).toBe(true);
    expect(feed(steps, state).hidden).toBe(false);
  });

  it("после возврата нужно снова 24 px вниз, чтобы спрятать: счётчик вниз начат заново", () => {
    const shownAgain = feed([scroll(-8, 392)], hiddenAt(400));
    expect(feed([scroll(23, 415)], shownAgain).hidden).toBe(false);
    expect(feed([scroll(24, 416)], shownAgain).hidden).toBe(true);
  });
});

describe("возвращается по остановке прокрутки", () => {
  it("settle показывает спрятанную панель и обнуляет счётчики", () => {
    const state = feed([{ type: "settle" }], hiddenAt(500));
    expect(state.hidden).toBe(false);
    expect(state.down).toBe(0);
    expect(state.up).toBe(0);
  });

  it("пока человек не начнёт листать вниз снова, она на месте; 24 px — и снова спрятана", () => {
    const state = feed([{ type: "settle" }], hiddenAt(500));
    expect(feed([scroll(23, 523)], state).hidden).toBe(false);
    expect(feed([scroll(24, 524)], state).hidden).toBe(true);
  });

  it("settle на видимой панели ничего не меняет", () => {
    expect(feed([{ type: "settle" }])).toEqual(INITIAL_TABBAR_STATE);
  });
});

describe("всегда видна у верха и у низа", () => {
  it("у верха (до 8 px включительно) спрятанная панель возвращается, глубже 8 — нет", () => {
    expect(feed([scroll(-300, 8)], hiddenAt(308)).hidden).toBe(false);
    // сдвиг вверх меньше порога возврата и ещё не у верха: остаётся спрятанной
    expect(feed([scroll(-6, 94)], hiddenAt(100)).hidden).toBe(true);
  });

  it("у верха не прячет, как бы ни листали вниз внутри зоны", () => {
    expect(feed([scroll(8, 8)]).hidden).toBe(false);
    expect(feed([scroll(50, 5)]).hidden).toBe(false);
  });

  it("у низа (до конца 8 px включительно) спрятанная панель возвращается и не прячется", () => {
    const hidden = hiddenAt(MAX - 500);
    expect(feed([scroll(40, MAX - 8)], hidden).hidden).toBe(false);
    expect(feed([scroll(40, MAX - 9)], INITIAL_TABBAR_STATE).hidden).toBe(true);
    expect(feed([scroll(40, MAX - 8)], INITIAL_TABBAR_STATE).hidden).toBe(false);
  });

  it("если страница чуть выше окна (max меньше 80), прятать нечего", () => {
    expect(feed([scroll(40, 60, { max: 60 })]).hidden).toBe(false);
    expect(feed([scroll(40, 50, { max: 70 })]).hidden).toBe(false);
  });

  it("в зоне края счётчики не копятся: прокрутка у самого края не прячет следующую", () => {
    expect(feed([scroll(40, MAX - 8)])).toMatchObject({ hidden: false, down: 0, up: 0 });
    expect(feed([scroll(-40, 8)], hiddenAt(300))).toMatchObject({ hidden: false, down: 0, up: 0 });
    // Вышли из зоны наверху и листаем вниз: копится с нуля, а не с того, что было в зоне
    const left = feed([scroll(30, 8), scroll(10, 18)]);
    expect(left.down).toBe(10);
  });
});

describe("резинка iOS за краем не считается прокруткой", () => {
  it("вверху: отрицательная прокрутка вниз-вверх панель не прячет", () => {
    // Потянули страницу вниз за верхний край (y < 0) и отпустили: y возвращается к 0
    const events = [scroll(-20, -20), scroll(-10, -30), scroll(+30, 0), scroll(+4, 4)];
    expect(feed(events).hidden).toBe(false);
  });

  it("вверху: возврат резинки вниз (dy > 0 в зоне края) не прячет спрятанную панель", () => {
    // Спрятана на глубине, пролистали вверх до самого края и дальше — резинка
    const bounce = feed([scroll(-300, -10), scroll(+10, 0)], hiddenAt(290));
    expect(bounce.hidden).toBe(false);
    expect(bounce.down).toBe(0);
  });

  it("внизу: прокрутка за нижний край (y > max) не прячет и показывает", () => {
    const over = feed([scroll(30, MAX + 25)], hiddenAt(MAX - 300));
    expect(over.hidden).toBe(false);
    expect(over.down).toBe(0);
    // возврат резинки вверх к max — тоже край
    expect(feed([scroll(-25, MAX)], over).hidden).toBe(false);
  });

  it("внизу: пролистали до конца и дальше резинкой — следующее листание вниз копится с нуля", () => {
    const afterBounce = feed([scroll(40, MAX - 6), scroll(25, MAX + 19), scroll(-19, MAX)]);
    expect(afterBounce).toMatchObject({ hidden: false, down: 0, up: 0 });
  });
});

describe("смена раздела", () => {
  const T = 10_000;

  it("панель на месте, даже если была спрятана", () => {
    expect(feed([{ type: "route", now: T }], hiddenAt(500)).hidden).toBe(false);
  });

  it("2500 мс прокрутка её не прячет: 2499 — на месте, 2500 — снова прячет", () => {
    const state = feed([{ type: "route", now: T }], hiddenAt(500));
    expect(feed([scroll(300, 600, { now: T + 1 })], state).hidden).toBe(false);
    expect(feed([scroll(300, 600, { now: T + PIN_AFTER_ROUTE_MS - 1 })], state).hidden).toBe(false);
    expect(feed([scroll(300, 600, { now: T + PIN_AFTER_ROUTE_MS })], state).hidden).toBe(true);
  });

  it("то, что прокручено под закреплением, не копится: после него нужно свои 24 px", () => {
    const state = feed([{ type: "route", now: T }]);
    const during = feed([scroll(20, 300, { now: T + 100 }), scroll(20, 320, { now: T + 200 })], state);
    expect(during.down).toBe(0);
    expect(feed([scroll(23, 343, { now: T + 3000 })], during).hidden).toBe(false);
    expect(feed([scroll(24, 344, { now: T + 3000 })], during).hidden).toBe(true);
  });

  it("прокрутка вверх в закреплении тоже в порядке: панель на месте", () => {
    const state = feed([{ type: "route", now: T }]);
    expect(feed([scroll(-100, 200, { now: T + 50 })], state).hidden).toBe(false);
  });

  it("новая смена раздела продлевает закрепление от своего момента", () => {
    const first = feed([{ type: "route", now: T }]);
    const second = feed([{ type: "route", now: T + 2000 }], first);
    expect(second.pinnedUntil).toBe(T + 2000 + PIN_AFTER_ROUTE_MS);
    expect(feed([scroll(300, 600, { now: T + 4000 })], second).hidden).toBe(false);
  });
});

describe("фокус и касание панели", () => {
  it("касание панели возвращает спрятанную и обнуляет счётчик", () => {
    const state = feed([{ type: "touch" }], hiddenAt(500));
    expect(state).toMatchObject({ hidden: false, down: 0, up: 0 });
  });

  it("клавиатурный фокус в панели показывает её и не даёт прятать, сколько ни листай", () => {
    const state = feed([{ type: "focus", keyboard: true }], hiddenAt(500));
    expect(state.hidden).toBe(false);
    expect(feed([scroll(400, 900)], state).hidden).toBe(false);
    expect(feed([scroll(400, 900), scroll(400, 1300)], state).hidden).toBe(false);
  });

  it("фокус ушёл — прячется как обычно, но не от накопленного под фокусом", () => {
    const focused = feed([{ type: "focus", keyboard: true }, scroll(400, 900)]);
    const blurred = feed([{ type: "blur" }], focused);
    expect(blurred.hidden).toBe(false);
    expect(blurred.down).toBe(0);
    expect(feed([scroll(23, 923)], blurred).hidden).toBe(false);
    expect(feed([scroll(24, 924)], blurred).hidden).toBe(true);
  });

  it("фокус от нажатия пальцем (не клавиатурный) показывает панель, но прятать не запрещает", () => {
    const state = feed([{ type: "focus", keyboard: false }], hiddenAt(500));
    expect(state.hidden).toBe(false);
    expect(state.focusInside).toBe(false);
    expect(feed([scroll(400, 900)], state).hidden).toBe(true);
  });

  it("клавиатурный фокус, затем нажатие пальцем: запрет снимается вместе с клавиатурным фокусом", () => {
    const state = feed([{ type: "focus", keyboard: true }, { type: "focus", keyboard: false }]);
    expect(state.focusInside).toBe(false);
  });
});

describe("шторка «Ещё»", () => {
  it("открытие показывает панель, пока шторка открыта, она не прячется", () => {
    const state = feed([{ type: "sheet", open: true }], hiddenAt(500));
    expect(state).toMatchObject({ hidden: false, sheetOpen: true });
    expect(feed([scroll(400, 900)], state).hidden).toBe(false);
  });

  it("после закрытия прячется как обычно, но не от накопленного под шторкой", () => {
    const open = feed([{ type: "sheet", open: true }, scroll(400, 900)]);
    const closed = feed([{ type: "sheet", open: false }], open);
    expect(closed.hidden).toBe(false);
    expect(feed([scroll(23, 923)], closed).hidden).toBe(false);
    expect(feed([scroll(24, 924)], closed).hidden).toBe(true);
  });
});

describe("прокрутка из разных контейнеров", () => {
  it("счётчики разных элементов не складываются: 20 px страницы и 20 px списка — не спрятано", () => {
    const events = [scroll(20, 300, { source: 0 }), scroll(20, 320, { source: 1 })];
    expect(feed(events).hidden).toBe(false);
  });

  it("а 24 px подряд из одного контейнера прячут, в каком бы он ни был", () => {
    expect(feed([scroll(12, 300, { source: 1 }), scroll(12, 312, { source: 1 })]).hidden).toBe(true);
  });

  it("переход из контейнера в контейнер сбрасывает и «вверх»: 5 px и ещё 5 px из другого не возвращают", () => {
    const state = hiddenAt(400);
    expect(feed([scroll(-5, 395, { source: 0 }), scroll(-5, 120, { source: 2 })], state).hidden).toBe(true);
  });

  it("край считается у того элемента, что прокручивается: внизу списка панель на месте", () => {
    // Список из 700 px в окне 300: прокручивается на 400; его конец — у панели
    const state = feed([scroll(60, 392, { source: 3, max: 400 })], hiddenAt(500));
    expect(state.hidden).toBe(false);
  });

  it("горизонтальная прокрутка (сдвиг по вертикали нулевой) состояния не меняет", () => {
    const state = hiddenAt(500);
    expect(feed([scroll(0, 500)], state)).toBe(state);
    expect(feed([scroll(0, 500)])).toBe(INITIAL_TABBAR_STATE);
  });
});

describe("сверка после сна и смены размера (resync)", () => {
  const resync = (y: number, max = MAX): TabbarEvent => ({ type: "resync", y, max });

  it("у верха спрятанная панель возвращается: восстановление из кэша «назад» и возврат вкладки", () => {
    const state = hiddenAt(500);
    expect(feed([resync(0)], state).hidden).toBe(false);
    expect(feed([resync(EDGE_ZONE_PX)], state).hidden).toBe(false);
    // Одним пикселем глубже зоны — состояние не меняется
    expect(feed([resync(EDGE_ZONE_PX + 1)], state).hidden).toBe(true);
  });

  it("у низа возвращается так же, как у верха", () => {
    const state = hiddenAt(500);
    expect(feed([resync(MAX)], state).hidden).toBe(false);
    expect(feed([resync(MAX - EDGE_ZONE_PX)], state).hidden).toBe(false);
    expect(feed([resync(MAX - EDGE_ZONE_PX - 1)], state).hidden).toBe(true);
  });

  it("посреди страницы ничего не меняет ни у спрятанной панели, ни у видимой", () => {
    const hidden = hiddenAt(500);
    expect(feed([resync(2000)], hidden)).toEqual(hidden);
    expect(feed([resync(2000)], INITIAL_TABBAR_STATE)).toEqual(INITIAL_TABBAR_STATE);
  });

  it("за краем («резинка» iOS) и на странице без прокрутки панель на месте", () => {
    const state = hiddenAt(500);
    expect(feed([resync(-30)], state).hidden).toBe(false);
    expect(feed([resync(MAX + 25)], state).hidden).toBe(false);
    expect(feed([resync(0, 0)], state).hidden).toBe(false);
  });

  it("не трогает остальное состояние: закрепление, фокус, шторку и источник прокрутки", () => {
    const pinned = feed([{ type: "route", now: 1000 }, { type: "focus", keyboard: true }, { type: "sheet", open: true }]);
    const state = feed([resync(0)], { ...pinned, hidden: true, source: 3 });
    expect(state.hidden).toBe(false);
    expect(state.pinnedUntil).toBe(pinned.pinnedUntil);
    expect(state.focusInside).toBe(true);
    expect(state.sheetOpen).toBe(true);
    expect(state.source).toBe(3);
  });

  it("счётчики после возврата с нуля: нужно снова 24 px, чтобы спрятать", () => {
    const back = feed([resync(0)], feed([scroll(20, 300)]));
    expect(back.down).toBe(0);
    expect(feed([scroll(23, 323)], back).hidden).toBe(false);
    expect(feed([scroll(24, 324)], back).hidden).toBe(true);
  });
});

describe("чистота функции", () => {
  it("исходное состояние не меняется, одно и то же событие даёт один ответ", () => {
    const state = hiddenAt(500);
    const snapshot = structuredClone(state);
    const a = nextTabbarState(state, scroll(-30, 470));
    const b = nextTabbarState(state, scroll(-30, 470));
    expect(a).toEqual(b);
    expect(state).toEqual(snapshot);
    expect(INITIAL_TABBAR_STATE).toEqual({
      hidden: false,
      down: 0,
      up: 0,
      source: null,
      pinnedUntil: 0,
      focusInside: false,
      sheetOpen: false,
    });
  });
});

describe("сверка положения панели с окном (panelGeometryOk)", () => {
  /** Окно 667 px, зазор от низа 10 px, панель высотой 56: на месте верх 601, низ 657. */
  const rest: PanelGeometry = { top: 601, bottom: 657, windowHeights: [667], bottomOffset: 10 };
  const at = (top: number, over: Partial<PanelGeometry> = {}): PanelGeometry => ({ ...rest, top, bottom: top + 56, ...over });

  it("числа сверки: допуск 4 px, лечение не чаще раза в 250 мс, после неудачи пауза 10 с", () => {
    expect(GEOMETRY_TOLERANCE_PX).toBe(4);
    expect(HEAL_MIN_INTERVAL_MS).toBe(250);
    expect(HEAL_FAIL_PAUSE_MS).toBe(10_000);
  });

  it("видимая: низ на высоте окна минус зазор — на месте, в пределах допуска тоже", () => {
    expect(panelGeometryOk(false, rest)).toBe(true);
    expect(panelGeometryOk(false, at(601 + GEOMETRY_TOLERANCE_PX))).toBe(true);
    expect(panelGeometryOk(false, at(601 - GEOMETRY_TOLERANCE_PX))).toBe(true);
  });

  it("видимая: дальше допуска — не на месте (повисла посреди страницы, 260 pt выше нижнего края)", () => {
    expect(panelGeometryOk(false, at(601 - GEOMETRY_TOLERANCE_PX - 1))).toBe(false);
    expect(panelGeometryOk(false, at(601 + GEOMETRY_TOLERANCE_PX + 1))).toBe(false);
    expect(panelGeometryOk(false, at(601 - 260))).toBe(false);
    // и наполовину спрятанная — тоже не на месте
    expect(panelGeometryOk(false, at(601 + 28))).toBe(false);
  });

  it("видимая: верх обязан быть внутри окна", () => {
    // Окно ниже самой панели: низ сошёлся с зазором, а верх вышел за верхний край
    expect(panelGeometryOk(false, { top: -3, bottom: 53, windowHeights: [63], bottomOffset: 10 })).toBe(false);
    expect(panelGeometryOk(false, { top: 0, bottom: 56, windowHeights: [66], bottomOffset: 10 })).toBe(true);
  });

  it("спрятанная: верх на краю окна или ниже — на месте; выше края хоть на пиксель — нет", () => {
    expect(panelGeometryOk(true, at(667))).toBe(true);
    expect(panelGeometryOk(true, at(691))).toBe(true);
    expect(panelGeometryOk(true, at(666.5))).toBe(true);
    expect(panelGeometryOk(true, at(665))).toBe(false);
    expect(panelGeometryOk(true, at(601))).toBe(false);
  });

  it("верным считается любая из двух высот окна: innerHeight и clientHeight расходятся при свёрнутой адресной строке", () => {
    const g = at(601, { windowHeights: [700, 667] });
    expect(panelGeometryOk(false, g), "по второй высоте панель на месте").toBe(true);
    expect(panelGeometryOk(false, { ...g, windowHeights: [700, 720] })).toBe(false);
    expect(panelGeometryOk(true, at(700, { windowHeights: [760, 700] }))).toBe(true);
    expect(panelGeometryOk(false, { ...rest, windowHeights: [] }), "высот нет — сверять нечем, не на месте").toBe(false);
  });
});

describe("сдвиг по вертикали из вычисленного transform (translateYOf)", () => {
  it("none, единичная и сдвинутая матрицы", () => {
    expect(translateYOf("none")).toBe(0);
    expect(translateYOf("matrix(1, 0, 0, 1, 0, 0)")).toBe(0);
    expect(translateYOf("matrix(1, 0, 0, 1, 0, 90)")).toBe(90);
    expect(translateYOf("matrix(1, 0, 0, 1, 0, -200)")).toBe(-200);
    expect(translateYOf("matrix(1, 0, 0, 1, 12.5, 90.25)")).toBe(90.25);
  });

  it("matrix3d: сдвиг — четырнадцатое число (индекс 13)", () => {
    expect(translateYOf("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 90, 0, 1)")).toBe(90);
    expect(translateYOf("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)")).toBe(0);
  });

  it("незнакомая и пустая запись — ноль, а не NaN", () => {
    expect(translateYOf("")).toBe(0);
    expect(translateYOf("translateY(90px)")).toBe(0);
    expect(translateYOf("matrix(1, 0, 0)")).toBe(0);
    expect(translateYOf("matrix(a, b, c, d, e, f)")).toBe(0);
  });
});

describe("стили и исходники согласованы с правилами", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

  it("длительность выезда в стилях та же, что в описании правил (200 мс)", () => {
    const m = css.match(/--tabbar-slide-ms:\s*(\d+)ms/);
    expect(m, "в globals.css нет --tabbar-slide-ms").not.toBeNull();
    expect(Number(m![1])).toBe(TABBAR_SLIDE_MS);
  });

  /** Правила CSS без комментариев: селектор и тело, вложенные @media разворачиваются в свои правила. */
  const cssRules = (() => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    return Array.from(bare.matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => ({ selector: m[1].trim(), body: m[2] }));
  })();
  const barRules = cssRules.filter((r) => r.selector.includes("data-bottom-tabs"));
  const ruleFor = (selector: string) => {
    const rule = barRules.find((r) => r.selector === selector);
    expect(rule, `в globals.css нет правила ${selector}`).toBeDefined();
    return rule!.body;
  };
  /** Класс самого элемента панели: от data-bottom-tabs до ближайшего className. */
  const barClassName = () => {
    const text = read("components/shell/bottom-tabs.tsx");
    const m = text.match(/data-bottom-tabs\s[\s\S]*?className="([^"]*)"/);
    expect(m, "у панели нет className").not.toBeNull();
    return m![1];
  };

  it("спрятанная панель: уезжает за край (высота + зазор + безопасная зона), не ловит нажатия", () => {
    const body = ruleFor("[data-bottom-tabs][data-hidden]");
    expect(body).toMatch(/transform:\s*translate3d\(0,\s*var\(--tabbar-away\),\s*0\)/);
    expect(body).toMatch(/pointer-events:\s*none/);
    // Спрятанная панель остаётся в дереве страницы: Tab и читалка до неё доходят
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    // Расстояние: 100% высоты панели + зазор от низа + безопасная зона + запас на тень
    const base = ruleFor("[data-bottom-tabs]");
    expect(base).toMatch(
      /--tabbar-away:\s*calc\(100%\s*\+\s*var\(--tabbar-offset\)\s*\+\s*var\(--safe-bottom\)\s*\+\s*24px\)/,
    );
  });

  it("сторож: ни в одном правиле панели нет opacity, а анимируется один transform", () => {
    // Прозрачность у элемента с размытием фона зависает в Safari на iPhone (жалоба владельца
    // после PR #144): панель либо видна, либо уехала — различаются положением, не прозрачностью
    expect(barRules.length, "правила панели найдены").toBeGreaterThanOrEqual(5);
    for (const rule of barRules) {
      expect(rule.body, `в «${rule.selector}» есть opacity`).not.toMatch(/opacity/);
    }
    const cls = barClassName();
    expect(cls, "в классе панели есть opacity").not.toMatch(/opacity/);
    expect(cls).toContain("transition-[transform]");
    // Любая «общая» утилита перехода тянула бы за собой opacity, цвет и фильтры
    expect(cls).not.toMatch(/(^|\s)transition(-all|-colors|-shadow|-none)?(\s|$)/);
    expect(cls).toContain("duration-(--tabbar-slide-ms)");
  });

  it("сторож: панель всегда на своём слое — translateZ(0) в покое, will-change: transform, backface-visibility", () => {
    const body = ruleFor("[data-bottom-tabs]");
    // Не translate3d(0, 0, 0): минификатор сборки превращает его в плоский translate(0, 0), и 3D-подсказка
    // слою пропадает (проверка на настоящей сборке, PR #147). Сторож по готовому CSS — tests/tabbar-built-css.test.ts
    expect(body).toMatch(/(^|[;\s])transform:\s*translateZ\(0\)/);
    expect(body).not.toMatch(/(^|[;\s])transform:\s*translate3d\(0,\s*0,\s*0\)/);
    expect(body).toMatch(/will-change:\s*transform/);
    expect(body).toMatch(/(^|[;\s])backface-visibility:\s*hidden/);
    expect(body).toMatch(/-webkit-backface-visibility:\s*hidden/);
    // Стекло на месте: слой нужен именно из-за размытия фона
    expect(body).toMatch(/backdrop-filter:/);
  });

  it("правило про ввод в поле и экран без вкладок на месте: тот же сдвиг, без прозрачности", () => {
    expect(css).toContain("body:has([data-hides-bottom-tabs]) [data-bottom-tabs]");
    expect(css).toMatch(/textarea:focus\s*\)\s*\[data-bottom-tabs\]/);
    const focus = barRules.find((r) => r.selector.includes("textarea:focus"));
    expect(focus, "правило про поле ввода").toBeDefined();
    expect(focus!.selector).toContain("body:has([data-hides-bottom-tabs]) [data-bottom-tabs]");
    expect(focus!.body).toMatch(/transform:\s*translate3d\(0,\s*var\(--tabbar-away\),\s*0\)/);
    expect(focus!.body).toMatch(/pointer-events:\s*none/);
    expect(focus!.body).not.toMatch(/opacity/);
  });

  it("при «уменьшить движение» перехода нет: класс motion-reduce:transition-none на месте", () => {
    expect(barClassName()).toContain("motion-reduce:transition-none");
  });

  it("хук доводит переход до конца и сверяет панель после сна: getAnimations, finish, pageshow, visibilitychange, resize", () => {
    const text = read("lib/hooks/use-tabbar-visibility.ts");
    expect(text).toMatch(/getAnimations\?\.\(\)/);
    expect(text).toMatch(/\.finish\(\)/);
    expect(text).toContain("TABBAR_SLIDE_MS + FINISH_GUARD_MS");
    expect(text).toMatch(/getBoundingClientRect\(\)/);
    for (const event of ["pageshow", "visibilitychange", "resize"]) {
      expect(text, event).toContain(`"${event}"`);
    }
    expect(text).toContain("visualViewport");
  });

  it("сторож: на iOS перехода нет — @supports (-webkit-touch-callout: none) отключает transition у панели, без opacity", () => {
    // Правило вне слоёв: оно сильнее утилиты transition-[transform] на самой панели. Условие — возможность WebKit
    // на iOS, а не User-Agent; тем же условием хук (lib/tabbar-env.ts) решает, освежать ли слой
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const m = bare.match(/@supports\s*\(\s*-webkit-touch-callout:\s*none\s*\)\s*\{\s*\[data-bottom-tabs\]\s*\{([^{}]*)\}\s*\}/);
    expect(m, "в globals.css нет @supports (-webkit-touch-callout: none) { [data-bottom-tabs] { … } }").not.toBeNull();
    expect(m![1]).toMatch(/(^|[;\s])transition:\s*none/);
    expect(m![1]).not.toMatch(/opacity/);
    // Правило стоит на верхнем уровне, не внутри @layer: внутри слоя оно проиграло бы утилите класса на панели
    const before = bare.slice(0, bare.indexOf(m![0]));
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth, "правило не вложено ни в @layer, ни в @media").toBe(0);
    // Одно условие в стилях и в коде
    expect(read("lib/tabbar-env.ts")).toMatch(/CSS\.supports\("-webkit-touch-callout",\s*"none"\)/);
    expect(read("lib/hooks/use-tabbar-visibility.ts")).toContain("isIosWebKit()");
  });

  it("сторож: хук сверяет положение и лечит слой — getBoundingClientRect, display: none, offsetHeight, не чаще раза в 250 мс", () => {
    const text = read("lib/hooks/use-tabbar-visibility.ts");
    expect(text).toContain("panelGeometryOk(");
    expect(text).toMatch(/style\.display\s*=\s*"none"/);
    expect(text).toMatch(/style\.display\s*=\s*""/);
    expect(text).toMatch(/void nav\.offsetHeight/);
    expect(text).toContain("HEAL_MIN_INTERVAL_MS");
    expect(text).toContain("HEAL_FAIL_PAUSE_MS");
    // Сверка идёт после смены состояния (таймер), на остановке прокрутки, на смене раздела и после сна
    for (const reason of ["после перехода", "остановка прокрутки", "смена раздела", "после сна"]) {
      expect(text, reason).toContain(reason);
    }
  });

  it("сторож: диагностика и стоп-кран выключены по умолчанию, флаги читаются и пишутся под try/catch", () => {
    const lib = read("lib/tabbar-debug.ts");
    // Оба флага (отладочная строка и «не прятать») идут через одну пару функций с try/catch
    const read_ = lib.match(/function readFlag\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    expect(read_, "readFlag найдена").not.toBeNull();
    expect(read_![1]).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/);
    expect(read_![1]).toMatch(/catch\s*\{\s*return false/);
    const write_ = lib.match(/function writeFlag\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    expect(write_, "writeFlag найдена").not.toBeNull();
    expect(write_![1]).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/);
    for (const [name, key] of [
      ["readTabbarDebugFlag", "TABBAR_DEBUG_KEY"],
      ["readTabbarNoHideFlag", "TABBAR_NOHIDE_KEY"],
    ]) {
      expect(lib, name).toMatch(new RegExp(`export function ${name}\\(\\)[^{]*\\{\\s*return readFlag\\(${key}\\);`));
    }
    for (const [name, key] of [
      ["writeTabbarDebugFlag", "TABBAR_DEBUG_KEY"],
      ["writeTabbarNoHideFlag", "TABBAR_NOHIDE_KEY"],
    ]) {
      expect(lib, name).toMatch(new RegExp(`export function ${name}\\([^)]*\\)[^{]*\\{\\s*return writeFlag\\(${key},`));
    }
    // Разные ключи: один флаг не включает другой
    expect(lib).toContain('TABBAR_DEBUG_KEY = "fhr-tabbar-debug"');
    expect(lib).toContain('TABBAR_NOHIDE_KEY = "fhr-tabbar-nohide"');
    // Оба компонента начинают с «выключено» и читают флаг уже после показа
    for (const file of ["components/shell/tabbar-debug.tsx", "components/settings/tabbar-debug-toggle.tsx"]) {
      const text = read(file);
      expect(text, file).toMatch(/useState\(false\)|noHide: false/);
      expect(text, file).toMatch(/useEffect\(/);
    }
    // Хук читает стоп-кран при старте и по смене (событие окна), а не на каждый scroll
    const hook = read("lib/hooks/use-tabbar-visibility.ts");
    expect(hook).toContain("readTabbarNoHideFlag()");
    expect(hook).toMatch(/addEventListener\(TABBAR_DEBUG_CHANGE_EVENT,\s*onNoHideChange\)/);
    expect(hook).toMatch(/if \(noHide && next\.hidden\)/);
    // Строка не интерактивна и не двигает раскладку; без намёков на композитный слой
    const overlay = read("components/shell/tabbar-debug.tsx");
    expect(overlay).toContain("pointer-events-none");
    expect(overlay).toContain("fixed");
    expect(overlay).toContain("aria-hidden");
    const overlayClass = overlay.match(/data-testid="tabbar-debug"\s+className="([^"]*)"/);
    expect(overlayClass, "у строки есть className").not.toBeNull();
    expect(overlayClass![1]).not.toMatch(/will-change|translate|transform|backdrop|filter/);
    // Контрольный квадрат внизу слева: обычный фиксированный слой, без transform, размытия и will-change —
    // по нему на скриншоте видно, отвязалась одна панель или все фиксированные слои
    const controlClass = overlay.match(/data-testid="tabbar-debug-control"\s+className="([^"]*)"/);
    expect(controlClass, "у контрольного квадрата есть className").not.toBeNull();
    for (const part of ["fixed", "bottom-0", "left-0", "pointer-events-none", "h-[8px]", "w-[8px]"]) {
      expect(controlClass![1], part).toContain(part);
    }
    expect(controlClass![1]).not.toMatch(/will-change|translate|transform|backdrop|filter/);
    // Отладка не читает раскладку в каждом кадре прокрутки и на каждое событие журнала
    expect(overlay).not.toContain("requestAnimationFrame");
    expect(overlay).not.toMatch(/addEventListener\("scroll"/);
    expect(overlay).toContain("SCROLL_QUIET_MS");
    // Переключатель стоит внизу «Настроек» обоих кабинетов
    for (const page of ["app/(agency)/a/settings/page.tsx", "app/(client)/settings/page.tsx"]) {
      expect(read(page), page).toContain("<TabbarDebugToggle />");
    }
    const toggle = read("components/settings/tabbar-debug-toggle.tsx");
    expect(toggle).toContain("Диагностика панели разделов (временно)");
    expect(toggle).toContain("Не прятать панель при прокрутке (временно)");
  });

  it("прежней механики тускнения в исходниках больше нет", () => {
    // Слова собраны из частей, чтобы тест не нашёл самого себя
    const banned = [
      new RegExp(["use", "Fade", "When", "Idle"].join("")),
      new RegExp(["data", "-", "dim"].join("")),
      new RegExp(["dataset", "\\.", "dim"].join("")),
      new RegExp(["FADE", "_"].join("")),
    ];
    const offenders: string[] = [];
    const files = ["app", "components", "lib"].flatMap((dir) => filesMatching(dir, /\.(ts|tsx|css)$/).filter((f) => !f.includes("generated")));
    expect(files.length, "обход исходников нашёл файлы").toBeGreaterThan(200);
    for (const file of files) {
      const text = read(file);
      for (const re of banned) if (re.test(text)) offenders.push(`${file}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
