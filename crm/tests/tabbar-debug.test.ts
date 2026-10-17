// @vitest-environment jsdom
/**
 * Временная диагностика нижней панели (lib/tabbar-debug.ts): флаг в localStorage и общий журнал.
 *
 * Главное: по умолчанию выключена, а недоступное хранилище (приватный режим Safari, запрет сайта,
 * переполнение) не роняет ни чтение, ни запись. Как это выглядит на странице —
 * tests/components/tabbar-debug.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TABBAR_DEBUG_CHANGE_EVENT,
  TABBAR_DEBUG_KEY,
  TABBAR_DEBUG_LOG_SIZE,
  TABBAR_NOHIDE_KEY,
  getTabbarDebug,
  readTabbarDebugFlag,
  readTabbarNoHideFlag,
  resetTabbarDebug,
  subscribeTabbarDebug,
  tabbarDebugCountHeal,
  tabbarDebugCountRefresh,
  tabbarDebugLog,
  tabbarDebugNoteScroll,
  tabbarDebugSetHidden,
  tabbarDebugSinceScroll,
  writeTabbarDebugFlag,
  writeTabbarNoHideFlag,
} from "@/lib/tabbar-debug";

beforeEach(() => {
  window.localStorage.clear();
  resetTabbarDebug();
});
afterEach(() => vi.restoreAllMocks());

/** localStorage, который бросает на любое обращение, как в приватном режиме. */
function breakStorage() {
  const boom = () => {
    throw new DOMException("хранилище недоступно", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
}

describe("флаг диагностики", () => {
  it("по умолчанию выключен", () => {
    expect(readTabbarDebugFlag()).toBe(false);
  });

  it("включается и выключается; значение — только «1»", () => {
    expect(writeTabbarDebugFlag(true)).toBe(true);
    expect(window.localStorage.getItem(TABBAR_DEBUG_KEY)).toBe("1");
    expect(readTabbarDebugFlag()).toBe(true);
    expect(writeTabbarDebugFlag(false)).toBe(true);
    expect(window.localStorage.getItem(TABBAR_DEBUG_KEY)).toBeNull();
    expect(readTabbarDebugFlag()).toBe(false);
    // Чужое значение под тем же ключом не включает диагностику
    window.localStorage.setItem(TABBAR_DEBUG_KEY, "true");
    expect(readTabbarDebugFlag()).toBe(false);
  });

  it("при записи сообщает слушателям вкладки (событие storage приходит только в другие вкладки)", () => {
    const heard = vi.fn();
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    writeTabbarDebugFlag(true);
    writeTabbarDebugFlag(false);
    window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("хранилище недоступно: чтение — «выключено», запись — false, ничего не бросает", () => {
    breakStorage();
    expect(() => readTabbarDebugFlag()).not.toThrow();
    expect(readTabbarDebugFlag()).toBe(false);
    const heard = vi.fn();
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    expect(() => writeTabbarDebugFlag(true)).not.toThrow();
    expect(writeTabbarDebugFlag(true), "не записано — честный false").toBe(false);
    expect(writeTabbarDebugFlag(false)).toBe(false);
    window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    expect(heard, "слушателям не сообщают о том, чего не было").not.toHaveBeenCalled();
  });

  it("сам объект localStorage недоступен (обращение к window.localStorage бросает) — то же", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("запрещено", "SecurityError");
    });
    expect(readTabbarDebugFlag()).toBe(false);
    expect(writeTabbarDebugFlag(true)).toBe(false);
  });
});

describe("стоп-кран «не прятать панель при прокрутке»", () => {
  it("по умолчанию выключен: панель прячется как обычно", () => {
    expect(readTabbarNoHideFlag()).toBe(false);
  });

  it("включается и выключается под своим ключом, значение — только «1»; отладочную строку не трогает", () => {
    expect(writeTabbarNoHideFlag(true)).toBe(true);
    expect(window.localStorage.getItem(TABBAR_NOHIDE_KEY)).toBe("1");
    expect(readTabbarNoHideFlag()).toBe(true);
    expect(readTabbarDebugFlag(), "отладочная строка — отдельный флаг").toBe(false);
    expect(writeTabbarDebugFlag(true)).toBe(true);
    expect(writeTabbarNoHideFlag(false)).toBe(true);
    expect(window.localStorage.getItem(TABBAR_NOHIDE_KEY)).toBeNull();
    expect(readTabbarNoHideFlag()).toBe(false);
    expect(readTabbarDebugFlag(), "выключение стоп-крана строку не выключило").toBe(true);
    window.localStorage.setItem(TABBAR_NOHIDE_KEY, "true");
    expect(readTabbarNoHideFlag()).toBe(false);
  });

  it("при записи сообщает слушателям вкладки тем же событием, что и отладочный флаг", () => {
    const heard = vi.fn();
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    writeTabbarNoHideFlag(true);
    writeTabbarNoHideFlag(false);
    window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("хранилище недоступно: чтение — «прячется как обычно», запись — false, ничего не бросает", () => {
    breakStorage();
    expect(() => readTabbarNoHideFlag()).not.toThrow();
    expect(readTabbarNoHideFlag()).toBe(false);
    const heard = vi.fn();
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    expect(writeTabbarNoHideFlag(true), "не записано — честный false").toBe(false);
    expect(writeTabbarNoHideFlag(false)).toBe(false);
    window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, heard);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("время от последней прокрутки", () => {
  it("прокрутки не было — null; после неё — сколько прошло; сброс возвращает null", () => {
    expect(tabbarDebugSinceScroll(5000)).toBeNull();
    tabbarDebugNoteScroll(1000);
    expect(tabbarDebugSinceScroll(1250)).toBe(250);
    tabbarDebugNoteScroll(2000);
    expect(tabbarDebugSinceScroll(2010)).toBe(10);
    // Часы не идут назад: отрицательного интервала не бывает
    expect(tabbarDebugSinceScroll(1500)).toBe(0);
    resetTabbarDebug();
    expect(tabbarDebugSinceScroll(5000)).toBeNull();
  });

  it("отметка прокрутки сводку не публикует: десятки событий в секунду не перерисовывают строку", () => {
    const heard = vi.fn();
    const unsubscribe = subscribeTabbarDebug(heard);
    for (let i = 0; i < 50; i++) tabbarDebugNoteScroll(i);
    unsubscribe();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("журнал и счётчики", () => {
  it("пустой в начале, события идут в порядке прихода", () => {
    expect(getTabbarDebug()).toEqual({ hidden: false, healed: 0, refreshed: 0, entries: [] });
    tabbarDebugLog("первое", 1000);
    tabbarDebugLog("второе", 2000);
    expect(getTabbarDebug().entries).toEqual([
      { at: 1000, text: "первое" },
      { at: 2000, text: "второе" },
    ]);
  });

  it("хранит не больше десяти последних (круг жеста — касание, смена, конец касания, остановка, освежение): старые вытесняются", () => {
    expect(TABBAR_DEBUG_LOG_SIZE).toBe(10);
    for (let i = 1; i <= 14; i++) tabbarDebugLog(`событие ${i}`, i);
    const texts = getTabbarDebug().entries.map((e) => e.text);
    expect(texts).toEqual(Array.from({ length: 10 }, (_, i) => `событие ${i + 5}`));
  });

  it("счётчики лечений и освежений и состояние растут независимо", () => {
    tabbarDebugCountHeal();
    tabbarDebugCountHeal();
    tabbarDebugCountRefresh();
    tabbarDebugSetHidden(true);
    expect(getTabbarDebug()).toMatchObject({ healed: 2, refreshed: 1, hidden: true });
  });

  it("подписчикам сообщается об изменении; без изменения состояния — нет; после отписки — тоже нет", () => {
    const heard = vi.fn();
    const unsubscribe = subscribeTabbarDebug(heard);
    tabbarDebugSetHidden(false); // уже false
    expect(heard).not.toHaveBeenCalled();
    tabbarDebugSetHidden(true);
    tabbarDebugLog("x");
    expect(heard).toHaveBeenCalledTimes(2);
    unsubscribe();
    tabbarDebugLog("y");
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("сводка неизменяема: прежний объект не правится, новое событие — новый объект", () => {
    const before = getTabbarDebug();
    tabbarDebugLog("z");
    expect(getTabbarDebug()).not.toBe(before);
    expect(before.entries).toEqual([]);
  });
});
