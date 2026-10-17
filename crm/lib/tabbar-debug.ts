/**
 * Временная диагностика нижней панели разделов на телефоне владельца.
 *
 * Зачем. В Safari на iPhone панель после PR #144 зависала посреди страницы, а воспроизвести это
 * без устройства нельзя (Xcode, симулятор и WebKit для Playwright недоступны). Диагностика даёт
 * владельцу способ показать, что именно происходит: поверх страницы вверху слева выводится
 * строка с состоянием панели, положением страницы, окном и последними событиями. Скриншот
 * этой строки — данные для следующей правки.
 *
 * Включается переключателем внизу «Настроек» («Диагностика панели разделов (временно)»),
 * а не параметром ссылки: кабинет на телефоне открыт как приложение с экрана «Домой», адресной
 * строки там нет. Флаг лежит в `localStorage` этого браузера, по умолчанию выключен, и
 * недоступное хранилище (приватный режим, запрет сайта) не ломает ничего: читается как «выключено».
 *
 * Второй флаг — «Не прятать панель при прокрутке» (`TABBAR_NOHIDE_KEY`): хук не прячет панель
 * листанием вовсе. Это стоп-кран (если панель зависла, ею можно пользоваться, пока причину ищут)
 * и способ разделить причины: зависает ли панель, если её не прятать, или дело не в прятании.
 * Работает и без отладочной строки; тот же приём хранения и те же правила чтения.
 *
 * Этот модуль — флаг и общий журнал: хук панели (`lib/hooks/use-tabbar-visibility.ts`) пишет
 * в него всегда (несколько строк в памяти, ничего не рисуется), экран отладки
 * (`components/shell/tabbar-debug.tsx`) читает, пока флаг включён. Убрать диагностику, когда
 * причина найдена: этот файл, оба компонента, вызовы `tabbarDebug*` в хуке и переключатель
 * в настройках обоих кабинетов.
 */

/** Ключ флага отладочной строки в `localStorage`. */
export const TABBAR_DEBUG_KEY = "fhr-tabbar-debug";

/** Ключ флага «не прятать панель при прокрутке» в `localStorage`. */
export const TABBAR_NOHIDE_KEY = "fhr-tabbar-nohide";

/**
 * Событие окна: один из двух флагов сменили в этой вкладке (событие `storage` приходит только
 * в другие). Слушатель перечитывает свой флаг сам.
 */
export const TABBAR_DEBUG_CHANGE_EVENT = "fhr-tabbar-debug-change";

/**
 * Сколько последних событий хранить и показывать. Один жест пальцем даёт касание, смену состояния,
 * конец касания, остановку и освежение слоя — шести записей не хватало на один круг.
 */
export const TABBAR_DEBUG_LOG_SIZE = 10;

/** Флаг по ключу включён. Любая ошибка хранилища — «выключено». */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Записывает флаг и сообщает об этом остальным слушателям вкладки. Возвращает, удалось ли
 * записать: в приватном режиме Safari хранилище бросает, и переключатель честно скажет об этом.
 */
function writeFlag(key: string, on: boolean): boolean {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new Event(TABBAR_DEBUG_CHANGE_EVENT));
  } catch {
    // Слушатели не получили весть, но флаг записан: следующая загрузка его прочтёт
  }
  return true;
}

/** Отладочная строка включена. Любая ошибка хранилища — «выключено». */
export function readTabbarDebugFlag(): boolean {
  return readFlag(TABBAR_DEBUG_KEY);
}

/** Записывает флаг отладочной строки; `false` — хранилище недоступно, записать не вышло. */
export function writeTabbarDebugFlag(on: boolean): boolean {
  return writeFlag(TABBAR_DEBUG_KEY, on);
}

/** Панель не прячется при прокрутке (стоп-кран). Любая ошибка хранилища — «прячется как обычно». */
export function readTabbarNoHideFlag(): boolean {
  return readFlag(TABBAR_NOHIDE_KEY);
}

/** Записывает флаг «не прятать»; `false` — хранилище недоступно, записать не вышло. */
export function writeTabbarNoHideFlag(on: boolean): boolean {
  return writeFlag(TABBAR_NOHIDE_KEY, on);
}

export type TabbarDebugEntry = {
  /** Время события, мс по часам страницы (`Date.now()`). */
  at: number;
  text: string;
};

export type TabbarDebugSnapshot = {
  /** Что считает состояние хука: панель должна быть спрятана. */
  hidden: boolean;
  /** Сколько раз сверка нашла панель не на месте и вылечила (`heal`). */
  healed: number;
  /** Сколько раз слой панели освежён профилактически (iOS, после смены состояния). */
  refreshed: number;
  /** Последние события, старые первыми. */
  entries: readonly TabbarDebugEntry[];
};

let snapshot: TabbarDebugSnapshot = { hidden: false, healed: 0, refreshed: 0, entries: [] };
const listeners = new Set<() => void>();
// Время последнего события scroll по часам страницы (`performance.now()`). Вне сводки: оно меняется
// десятки раз в секунду, а сводка перерисовывает отладочную строку. Нужно двум: журналу (сколько
// прошло от последней прокрутки до смены состояния) и строке, которая не читает раскладку, пока листают
let lastScrollAt = Number.NEGATIVE_INFINITY;

function publish(next: TabbarDebugSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Текущая сводка. Объект неизменяемый: новая сводка — новый объект. */
export function getTabbarDebug(): TabbarDebugSnapshot {
  return snapshot;
}

/** Подписка на изменения сводки; возвращает отписку. */
export function subscribeTabbarDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Событие в журнал. Старые вытесняются: хранится не больше TABBAR_DEBUG_LOG_SIZE. */
export function tabbarDebugLog(text: string, at: number = Date.now()) {
  publish({
    ...snapshot,
    entries: [...snapshot.entries, { at, text }].slice(-TABBAR_DEBUG_LOG_SIZE),
  });
}

/** Состояние хука изменилось. Без изменений ничего не публикуется. */
export function tabbarDebugSetHidden(hidden: boolean) {
  if (snapshot.hidden !== hidden) publish({ ...snapshot, hidden });
}

/** Сверка вылечила положение панели. */
export function tabbarDebugCountHeal() {
  publish({ ...snapshot, healed: snapshot.healed + 1 });
}

/** Слой панели освежён профилактически. */
export function tabbarDebugCountRefresh() {
  publish({ ...snapshot, refreshed: snapshot.refreshed + 1 });
}

/** Хук увидел событие scroll. Ничего не публикует: вызывается на каждое событие прокрутки. */
export function tabbarDebugNoteScroll(now: number = performance.now()) {
  lastScrollAt = now;
}

/** Сколько мс прошло от последнего scroll; `null` — прокрутки на этой странице ещё не было. */
export function tabbarDebugSinceScroll(now: number = performance.now()): number | null {
  return Number.isFinite(lastScrollAt) ? Math.max(0, now - lastScrollAt) : null;
}

/** Сбрасывает сводку. Для тестов: состояние модуля живёт, пока жива страница. */
export function resetTabbarDebug() {
  lastScrollAt = Number.NEGATIVE_INFINITY;
  publish({ hidden: false, healed: 0, refreshed: 0, entries: [] });
}
