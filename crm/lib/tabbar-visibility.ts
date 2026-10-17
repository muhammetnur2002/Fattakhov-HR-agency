/**
 * Когда нижняя панель разделов на телефоне видна, а когда спрятана
 * (components/shell/bottom-tabs.tsx, просьба владельца 17.10.2026).
 *
 * Панель прячется, когда человек листает страницу вниз, и возвращается, как только
 * он ею снова может воспользоваться. Раньше она не уезжала, а тускнела и возвращалась
 * только касанием самой панели: её почти не было видно и она не появлялась обратно,
 * поэтому люди нажимали кнопки по памяти.
 *
 * Модуль чистый: ни DOM, ни таймеров, ни часов. Время приходит в событии, таймеры
 * ставит хук (lib/hooks/use-tabbar-visibility.ts) и присылает событие `settle`.
 * Поэтому любое сочетание «прокрутка, остановка, смена раздела, фокус» проверяется
 * таблицей событий (tests/tabbar-visibility.test.ts) без браузера.
 */

/**
 * Сколько прокрутки вниз подряд накопить, чтобы спрятать панель. Меньше — это дрожание
 * пальца и «резинка», а не листание: панель не должна мигать от каждого касания.
 */
export const HIDE_AFTER_DOWN_PX = 24;

/**
 * Насколько страница должна быть прокручена от верха, чтобы панель прятали. У самого
 * начала страницы панель нужна — человек ещё выбирает, куда идти.
 */
export const HIDE_MIN_SCROLL_Y_PX = 80;

/**
 * Сколько прокрутки вверх подряд возвращает панель сразу. Меньше, чем на скрытие:
 * вернуть панель дёшево, а потерять — значит заставить человека искать её.
 */
export const SHOW_AFTER_UP_PX = 8;

/**
 * Зона у верха и у низа прокручиваемого элемента, где панель видна всегда. Попадает
 * сюда и «резинка» iOS: за краем прокрутка отрицательная (вверху) или больше предела
 * (внизу) и не считается ни листанием вниз, ни вверх.
 */
export const EDGE_ZONE_PX = 8;

/**
 * Через сколько после последнего события прокрутки панель возвращается сама: человек
 * перестал листать — значит, смотрит на страницу и может потянуться к панели.
 */
export const SETTLE_MS = 600;

/**
 * Сколько после смены раздела прокрутка панель не прячет. Новая страница открывается
 * прокруткой к началу и первыми движениями пальца; без паузы панель мигнула бы
 * под пальцем сразу после нажатия на вкладку.
 */
export const PIN_AFTER_ROUTE_MS = 2500;

/**
 * Длительность выезда и появления. Живёт в CSS (`--tabbar-slide-ms` в app/globals.css):
 * там же правило для «уменьшить движение». Здесь — для тестов, которые сверяют, что
 * число в стилях и число в описании не разошлись.
 */
export const TABBAR_SLIDE_MS = 200;

/**
 * Запас после конца выезда, по истечении которого хук доводит незаконченный переход до
 * конечного положения (`getAnimations().finish()`, lib/hooks/use-tabbar-visibility.ts).
 * Safari на iPhone изредка «замораживает» переход панели на середине и не продолжает его,
 * пока человек не коснётся экрана: к моменту TABBAR_SLIDE_MS + запас переход уже не может
 * идти по-настоящему, значит застыл. Запас нужен, чтобы не обрезать честный переход,
 * который начался с задержкой в кадр-другой.
 */
export const FINISH_GUARD_MS = 60;

/**
 * Допуск сверки положения панели с окном, px. Округления и безопасная зона дают расхождение
 * в доли пикселя; четыре — запас, за которым панель уже не там, где задумана.
 */
export const GEOMETRY_TOLERANCE_PX = 4;

/**
 * Не чаще раза в столько лечится положение панели (хук, `heal`). Лечение — принудительное
 * пересоздание слоя, и частить с ним незачем: каждое событие сверки не должно дёргать раскладку.
 */
export const HEAL_MIN_INTERVAL_MS = 250;

/**
 * Если после лечения положение всё равно неверное, повторно лечить не пытаются столько:
 * значит, дело не в зависшем слое (приближение щипком, необычная область просмотра), и бесконечное
 * пересоздание только мешало бы. Пока не истечёт, сверка молчит; в отладочной панели это видно.
 */
export const HEAL_FAIL_PAUSE_MS = 10_000;

/**
 * Положение панели в окне и всё, что нужно, чтобы решить, верное ли оно.
 * `windowHeights` — высоты, от нижнего края которых панель может стоять: окно (`innerHeight`)
 * и область страницы (`documentElement.clientHeight`); на iPhone они расходятся, когда
 * адресная строка свёрнута или развёрнута, и верным считается любое из двух.
 */
export type PanelGeometry = {
  top: number;
  bottom: number;
  windowHeights: readonly number[];
  /** Зазор от низа окна (`bottom` из стилей панели, px). */
  bottomOffset: number;
};

/**
 * Стоит ли панель там, где должна. Видимая: низ на высоте окна минус зазор (с допуском),
 * верх внутри окна. Спрятанная: целиком за нижним краем окна, верх не выше самого края.
 * Чистая функция: ни DOM, ни часов; положение приходит готовым числом.
 */
export function panelGeometryOk(expectHidden: boolean, g: PanelGeometry): boolean {
  return g.windowHeights.some((height) => {
    if (expectHidden) return g.top >= height - 1;
    return (
      Math.abs(g.bottom - (height - g.bottomOffset)) <= GEOMETRY_TOLERANCE_PX &&
      g.top >= 0 &&
      g.top < height
    );
  });
}

/**
 * Сдвиг по вертикали из вычисленного `transform` (`getComputedStyle(...).transform`), px.
 * Браузер отдаёт `none`, `matrix(a, b, c, d, tx, ty)` или `matrix3d(16 чисел)`; всё остальное
 * (незнакомая запись) считается нулём. По нему хук отличает «панель спрятана правилом
 * стилей» (ввод в поле, экран без вкладок) от «должна стоять на месте».
 */
export function translateYOf(transform: string): number {
  const match = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!match) return 0;
  const values = match[2].split(",").map((part) => Number.parseFloat(part));
  const y = match[1] ? values[13] : values[5];
  return Number.isFinite(y) ? y : 0;
}

export type TabbarState = {
  /** Панель спрятана (метка data-hidden на элементе). */
  hidden: boolean;
  /** Сколько прокручено вниз подряд, px. */
  down: number;
  /** Сколько прокручено вверх подряд, px. */
  up: number;
  /**
   * Чья прокрутка копится. У каждого прокручиваемого элемента (страница, список,
   * колонка доски) свой номер: при смене счётчики обнуляются, иначе два листания
   * из разных контейнеров складывались бы в одно.
   */
  source: number | null;
  /** До какого момента (мс по часам события) прокрутка панель не прячет. */
  pinnedUntil: number;
  /** Клавиатурный фокус внутри панели: пока он там, панель не прячется. */
  focusInside: boolean;
  /** Шторка «Ещё» открыта: панель под ней, прятать нечего. */
  sheetOpen: boolean;
};

export const INITIAL_TABBAR_STATE: TabbarState = {
  hidden: false,
  down: 0,
  up: 0,
  source: null,
  pinnedUntil: 0,
  focusInside: false,
  sheetOpen: false,
};

export type TabbarEvent =
  /**
   * Вертикальная прокрутка. `dy` — сдвиг этого элемента с прошлого события (больше нуля —
   * вниз), посчитанный по нему одному; `y` — его положение от верха; `max` — наибольшее
   * положение (высота содержимого минус видимая высота).
   */
  | { type: "scroll"; now: number; source: number; dy: number; y: number; max: number }
  /** Прокрутка стихла: SETTLE_MS без событий. */
  | { type: "settle" }
  /** Открылся другой раздел. */
  | { type: "route"; now: number }
  /** Нажатие на саму панель. */
  | { type: "touch" }
  /**
   * Фокус пришёл в панель. `keyboard` — он клавиатурный (`:focus-visible`): после нажатия
   * пальцем на ссылку Chrome на Android оставляет фокус на ней, и если считать его, панель
   * после первой же вкладки больше не пряталась бы никогда.
   */
  | { type: "focus"; keyboard: boolean }
  /** Фокус ушёл из панели. */
  | { type: "blur" }
  /** Шторка «Ещё» открылась или закрылась. */
  | { type: "sheet"; open: boolean }
  /**
   * Страница вернулась к человеку или сменила размер (показ из кэша «назад», вкладка снова
   * видна, адресная строка Safari свернулась или развернулась) и хук сверяет панель с тем,
   * где страница стоит сейчас. `y` и `max` — положение страницы и её предел, как у `scroll`.
   * У верха и у низа панель видна всегда; посреди страницы состояние не меняется.
   */
  | { type: "resync"; y: number; max: number };

/** Панель на месте, счётчики прокрутки с нуля. */
function shown(state: TabbarState): TabbarState {
  return { ...state, hidden: false, down: 0, up: 0 };
}

/**
 * Прокручиваемый элемент стоит у верха или у низа. Попадает и «резинка» iOS: за краем `y`
 * меньше нуля или больше `max`.
 */
function atEdge(y: number, max: number): boolean {
  return y <= EDGE_ZONE_PX || max - y <= EDGE_ZONE_PX;
}

function onScroll(state: TabbarState, e: Extract<TabbarEvent, { type: "scroll" }>): TabbarState {
  // Горизонтальная прокрутка (ленты чипов, воронка) и событие без сдвига — не листание
  if (e.dy === 0) return state;

  // Верх и низ: панель видна всегда. Попадает и «резинка» — за краем y меньше нуля
  // или больше max, и это не листание вниз и не вверх
  if (atEdge(e.y, e.max)) {
    return { ...shown(state), source: e.source };
  }

  const sameSource = state.source === e.source;
  let down = sameSource ? state.down : 0;
  let up = sameSource ? state.up : 0;
  // Разворот обнуляет противоположный счётчик: дрожание вперёд-назад копит не больше шага
  if (e.dy > 0) {
    down += e.dy;
    up = 0;
  } else {
    up -= e.dy;
    down = 0;
  }

  let hidden = state.hidden;
  if (up >= SHOW_AFTER_UP_PX) hidden = false;

  const blocked = e.now < state.pinnedUntil || state.focusInside || state.sheetOpen;
  if (blocked) {
    // Пока прятать нельзя, листание не копится: иначе первое же событие после снятия запрета
    // спрятало бы панель, хотя человек за это время ничего не листал
    down = 0;
  } else if (down >= HIDE_AFTER_DOWN_PX && e.y > HIDE_MIN_SCROLL_Y_PX) {
    hidden = true;
  }

  return { ...state, hidden, down, up, source: e.source };
}

/** Следующее состояние панели. Чистая функция: то же состояние и событие — тот же ответ. */
export function nextTabbarState(state: TabbarState, event: TabbarEvent): TabbarState {
  switch (event.type) {
    case "scroll":
      return onScroll(state, event);
    case "settle":
    case "touch":
      return shown(state);
    case "route":
      return { ...shown(state), pinnedUntil: event.now + PIN_AFTER_ROUTE_MS };
    case "focus":
      return { ...shown(state), focusInside: event.keyboard };
    case "blur":
      return { ...state, focusInside: false };
    case "sheet":
      return event.open ? { ...shown(state), sheetOpen: true } : { ...state, sheetOpen: false };
    case "resync":
      return atEdge(event.y, event.max) ? shown(state) : state;
  }
}
