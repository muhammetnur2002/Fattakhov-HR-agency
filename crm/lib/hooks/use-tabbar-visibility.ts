"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  TABBAR_DEBUG_CHANGE_EVENT,
  readTabbarNoHideFlag,
  tabbarDebugCountHeal,
  tabbarDebugCountRefresh,
  tabbarDebugLog,
  tabbarDebugNoteScroll,
  tabbarDebugSetHidden,
  tabbarDebugSinceScroll,
} from "@/lib/tabbar-debug";
import { isIosWebKit } from "@/lib/tabbar-env";
import {
  FINISH_GUARD_MS,
  HEAL_FAIL_PAUSE_MS,
  HEAL_MIN_INTERVAL_MS,
  INITIAL_TABBAR_STATE,
  SETTLE_MS,
  TABBAR_SLIDE_MS,
  nextTabbarState,
  panelGeometryOk,
  translateYOf,
  type PanelGeometry,
  type TabbarEvent,
  type TabbarState,
} from "@/lib/tabbar-visibility";

/**
 * Нижняя панель разделов прячется при прокрутке вниз и возвращается (просьба владельца
 * 17.10.2026). Правила — в `lib/tabbar-visibility.ts`; здесь только DOM: слушатели, таймер
 * остановки и метка `data-hidden` на элементе панели. Вид скрытого состояния —
 * `[data-bottom-tabs][data-hidden]` в app/globals.css.
 *
 * Метка ставится прямо на элемент, без состояния React: прокрутка — десятки событий
 * в секунду, перерисовывать панель на каждое незачем.
 *
 * Safari на iPhone после PR #144 оставлял панель посреди страницы, полупрозрачной, и не
 * возвращал её ни прокруткой вверх, ни у верха, ни на другом разделе, пока человек не
 * коснётся экрана (в Chromium этого нет). На скриншоте владельца панель висела примерно на
 * 260 pt выше нижнего края — слой потерял привязку к окну и ехал вместе со страницей. Что именно
 * ломается в WebKit, на устройстве не подтверждено, поэтому здесь страховки, каждая из которых
 * безвредна, если ничего не зависло:
 *  - после каждой записи метки — принудительная перерисовка (чтение геометрии): переход
 *    начинается сразу, а не когда браузер соберётся;
 *  - через TABBAR_SLIDE_MS + FINISH_GUARD_MS после последней смены — `getAnimations().finish()`:
 *    переход, который к этому времени не кончился, застыл, и конечное положение ставится силой;
 *  - при показе страницы (в том числе из кэша «назад»), возврате вкладки и смене размера окна —
 *    повторная сверка: метка по состоянию, у верха и низа панель показана;
 *  - самолечение: после смены состояния, на остановке прокрутки, на смене раздела и после сна
 *    сверяется положение панели с окном (`getBoundingClientRect`); не там, где должна, — слой
 *    пересоздаётся (`display: none`, чтение высоты, возврат). Не чаще раза в HEAL_MIN_INTERVAL_MS;
 *    не помогло — молчит HEAL_FAIL_PAUSE_MS;
 *  - на iOS (где переход в стилях отключён) слой, кроме того, освежается профилактически, когда
 *    листание остановилось или раздел сменился после того, как панель меняла состояние: зависший
 *    слой на уровне композитора (панель нарисована не там, а раскладка считает её на месте) сверка
 *    положения не видит, а пересоздание слоя лечит.
 * Сам вид (только сдвиг, свой слой, на iOS без перехода) — в app/globals.css, правило
 * `[data-bottom-tabs]`. Журнал и счётчики лечения пишутся в `lib/tabbar-debug.ts` — их показывает
 * временная отладочная панель (components/shell/tabbar-debug.tsx).
 *
 * Стоп-кран: флаг «Не прятать панель при прокрутке» (настройки, `readTabbarNoHideFlag`) — листание
 * панель не прячет вовсе, всё остальное работает как обычно. Нужен, пока причина зависания на iPhone
 * не найдена: зависла ли панель, которую не прятали, говорит, что дело не в прятании. Флаг читается
 * при старте и по смене (событие окна), а не на каждый scroll.
 *
 * Слушаем `document` с захватом: событие scroll не всплывает, а прокручиваться может не только
 * страница, но и вложенный список или колонка доски. Положение каждого элемента помнится
 * отдельно: сдвиг считается по нему одному, и переход пальца из списка на страницу не даёт
 * ложного «вверх» или «вниз». Горизонтальная прокрутка (ленты чипов, воронка) сдвига по
 * вертикали не имеет и не учитывается.
 *
 * Скрытая панель остаётся в дереве страницы: Tab и читалка до неё доходят, а фокус внутри
 * панели её показывает и держит видимой.
 */
export function useTabbarVisibility(
  ref: RefObject<HTMLElement | null>,
  pathname: string,
  sheetOpen: boolean,
) {
  // Отправка событий в машину состояний, принудительная перерисовка и сверка положения после
  // события; их создаёт первый эффект, остальные ими пользуются
  const apiRef = useRef<{
    send: (event: TabbarEvent) => void;
    repaint: () => void;
    after: (reason: string) => void;
  }>({
    send: () => {},
    repaint: () => {},
    after: () => {},
  });

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    let state: TabbarState = INITIAL_TABBAR_STATE;
    let settleTimer: number | undefined;
    let finishTimer: number | undefined;
    // iOS определяется по возможности WebKit, а не по User-Agent (lib/tabbar-env.ts); тем же
    // условием стили отключают переход панели
    const ios = isIosWebKit();
    // Стоп-кран: панель не прячется листанием (флаг в настройках, читается при старте и по смене)
    let noHide = readTabbarNoHideFlag();
    // Метка менялась после последнего освежения слоя (профилактика на iOS)
    let dirty = false;
    let lastHealAt = Number.NEGATIVE_INFINITY;
    let healPausedUntil = 0;

    /**
     * Переходы панели, которые ещё идут (не закончены и не сняты). `pending` — в старых Safari,
     * где переход до первого кадра ещё не «бежит»; типы DOM этого значения не знают.
     */
    const runningTransitions = (): number => {
      try {
        return (nav.getAnimations?.() ?? []).filter((animation) => {
          const playState: string = animation.playState;
          return playState === "running" || playState === "pending";
        }).length;
      } catch {
        return 0;
      }
    };

    /**
     * Доводит переходы панели до конечного положения. Без Web Animations API ничего не делает.
     * Журнал отмечает, что переход действительно не закончился сам: это признак зависания.
     */
    const finishTransitions = () => {
      try {
        const unfinished = runningTransitions();
        if (unfinished > 0) tabbarDebugLog(`переход не закончился сам: ${unfinished}`);
        for (const animation of nav.getAnimations?.() ?? []) {
          try {
            animation.finish();
          } catch {
            // Переход, который нельзя закончить (его уже сняли), не должен мешать остальным
          }
        }
      } catch {
        // Старый браузер или среда без getAnimations: страховка просто не работает
      }
    };

    /**
     * Пересоздание слоя панели: пока `display: none`, браузер выбрасывает её слой и картинку,
     * а чтение высоты заставляет это сделать сейчас, до возврата стиля. Всё в одной задаче, ни
     * одного кадра между «нет» и «есть»: мигания нет. Метка и положение остаются теми же —
     * заново созданный элемент встаёт сразу в конечное состояние, без перехода.
     */
    const recreateLayer = () => {
      // Элемент в `display: none` теряет фокус; кто был на вкладке панели, остаётся на ней
      const focused = document.activeElement;
      const hadFocus = focused instanceof HTMLElement && nav.contains(focused);
      nav.style.display = "none";
      void nav.offsetHeight;
      nav.style.display = "";
      void nav.offsetHeight;
      if (hadFocus && document.activeElement !== focused) {
        try {
          focused.focus({ preventScroll: true });
        } catch {
          // Фокус вернуть не вышло: страница работает, человек нажмёт Tab заново
        }
      }
    };

    /**
     * Принудительная перерисовка. Чтение геометрии сразу после записи метки заставляет браузер
     * применить стиль сейчас и начать переход в этом же кадре. Страховка по времени доводит
     * переход до конца, а затем сверяет положение панели; отсчёт всегда от последней смены.
     * `finishNow` — переход заведомо устарел (страница спала), его конец ставится сразу.
     */
    const repaint = (finishNow = false) => {
      void nav.getBoundingClientRect();
      window.clearTimeout(finishTimer);
      if (finishNow) {
        finishTransitions();
        verify("после сна", true);
      } else {
        finishTimer = window.setTimeout(() => {
          finishTransitions();
          verify("после перехода", true);
        }, TABBAR_SLIDE_MS + FINISH_GUARD_MS);
      }
    };

    /** Где панель сейчас; null — измерять нечего или нельзя (не нарисована, окно приближено). */
    const measure = (): PanelGeometry | null => {
      const rect = nav.getBoundingClientRect();
      // Не нарисована: на планшете и компьютере панели нет (md:hidden), в jsdom вёрстки нет
      if (rect.width === 0 && rect.height === 0) return null;
      // Страница приближена щипком: координаты раскладки и окно расходятся, сверять нечего
      const viewport = window.visualViewport;
      if (viewport && Math.abs(viewport.scale - 1) > 0.02) return null;
      const bottomOffset = Number.parseFloat(getComputedStyle(nav).bottom);
      if (!Number.isFinite(bottomOffset)) return null;
      return {
        top: rect.top,
        bottom: rect.bottom,
        windowHeights: [window.innerHeight, document.documentElement.clientHeight],
        bottomOffset,
      };
    };

    /** Панель должна стоять за краем окна: состояние хука или правило стилей (ввод, экран без вкладок). */
    const expectHidden = (): boolean =>
      state.hidden || translateYOf(getComputedStyle(nav).transform) > 1;

    /** Лечение: метка по состоянию, слой пересоздан, положение проверено ещё раз. */
    const heal = (reason: string) => {
      const now = performance.now();
      if (now - lastHealAt < HEAL_MIN_INTERVAL_MS) return;
      lastHealAt = now;
      syncMark();
      recreateLayer();
      tabbarDebugCountHeal();
      const after = measure();
      if (after && !panelGeometryOk(expectHidden(), after)) {
        healPausedUntil = now + HEAL_FAIL_PAUSE_MS;
        tabbarDebugLog(`не там (${reason}), лечение не помогло`);
      } else {
        tabbarDebugLog(`не там (${reason}), вылечено`);
      }
    };

    /**
     * Сверка положения панели с окном. Идущий переход не проверяют: посреди него панель
     * законно не на месте, его проверит таймер по концу. Остальное — по правилам
     * `panelGeometryOk`: видимая стоит низом у нижнего края с зазором, спрятанная целиком за краем.
     */
    function verify(reason: string, afterFinish: boolean) {
      if (performance.now() < healPausedUntil) return;
      if (!afterFinish && runningTransitions() > 0) return;
      const geometry = measure();
      if (!geometry) return;
      if (!panelGeometryOk(expectHidden(), geometry)) heal(reason);
    }

    /** Освежает слой профилактически, если панель меняла состояние. Только iOS. */
    const refreshIfDirty = (reason: string) => {
      if (!ios || !dirty) return;
      dirty = false;
      recreateLayer();
      tabbarDebugCountRefresh();
      tabbarDebugLog(`слой освежён (${reason})`);
    };

    /** Метка на элементе — по состоянию, не по памяти о прошлой смене. Возвращает, менялась ли. */
    const syncMark = (): boolean => {
      if (nav.hasAttribute("data-hidden") === state.hidden) return false;
      if (state.hidden) nav.dataset.hidden = "";
      else delete nav.dataset.hidden;
      dirty = true;
      return true;
    };

    const pageScroller = () => document.scrollingElement ?? document.documentElement;

    // Номер и последнее положение каждого прокручиваемого элемента. Страница — номер 0:
    // её положение известно с самого начала (браузер мог восстановить прокрутку после
    // обновления), остальные узнаются по первому событию
    const positions = new WeakMap<object, { id: number; y: number }>();
    let nextId = 1;
    positions.set(document, { id: 0, y: pageScroller().scrollTop });

    /**
     * Положение страницы и время от последнего scroll — для журнала: по ним видно, как смена
     * состояния расположена относительно прокрутки (посреди неё или после остановки). Положение —
     * то, что хук и так запомнил на последнем scroll или сверке; DOM здесь не читается, чтобы
     * запись в журнал (особенно на касание) не заставляла браузер считать раскладку.
     */
    const trace = (): string => {
      const since = tabbarDebugSinceScroll();
      return `y ${Math.round(positions.get(document)?.y ?? 0)} +${since === null ? "-" : Math.round(since)}мс`;
    };

    const send = (event: TabbarEvent) => {
      let next = nextTabbarState(state, event);
      // Стоп-кран: прятать нельзя, остальное (счётчики, закрепление, фокус) считается как обычно
      if (noHide && next.hidden) next = { ...next, hidden: false };
      state = next;
      tabbarDebugSetHidden(state.hidden);
      if (syncMark()) {
        tabbarDebugLog(`${state.hidden ? "скрыта" : "видна"} (${event.type}) ${trace()}`);
        repaint();
      }
    };

    /** Флаг «не прятать» сменили в настройках: спрятанная панель в этот момент возвращается сразу. */
    const onNoHideChange = () => {
      const next = readTabbarNoHideFlag();
      if (next === noHide) return;
      noHide = next;
      tabbarDebugLog(next ? "не прятать: включено" : "не прятать: выключено");
      if (next) send({ type: "settle" });
    };

    /**
     * Событие, после которого панель должна стоять на месте (остановка прокрутки, смена раздела):
     * освежить слой, если на iOS она меняла состояние, перерисовать, сверить положение.
     */
    const after = (reason: string) => {
      refreshIfDirty(reason);
      repaint();
      verify(reason, false);
    };
    apiRef.current = { send, repaint: () => repaint(), after };


    const onSettle = () => {
      send({ type: "settle" });
      after("остановка прокрутки");
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      let scroller: Element;
      let key: object;
      if (target === document) {
        scroller = pageScroller();
        key = document;
      } else if (target instanceof Element) {
        scroller = target;
        key = target;
      } else {
        return;
      }
      tabbarDebugNoteScroll(performance.now());
      const y = scroller.scrollTop;
      const known = positions.get(key);
      if (!known) {
        // Первое событие этого элемента: откуда он начал, неизвестно, запоминаем место
        positions.set(key, { id: nextId++, y });
        return;
      }
      const dy = y - known.y;
      known.y = y;
      if (dy === 0) return;
      send({
        type: "scroll",
        now: performance.now(),
        source: known.id,
        dy,
        y,
        max: scroller.scrollHeight - scroller.clientHeight,
      });
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(onSettle, SETTLE_MS);
    };

    /**
     * Страница вернулась к человеку или сменила размер: метка по состоянию, у верха и низа
     * панель показана, картинка перерисована. `finishNow` — переход заведомо устарел (страница
     * спала или пришла из кэша), и его конечное положение ставится сразу; при смене размера
     * (адресная строка Safari сворачивается прямо во время листания) идущий переход не рвём.
     * После сна слою на iOS доверять нельзя, и он освежается в любом случае.
     */
    const resync = (reason: string, finishNow: boolean) => {
      tabbarDebugLog(reason);
      const scroller = pageScroller();
      // Положение страницы могло смениться без события scroll (восстановление из кэша «назад»):
      // отсчёт следующего сдвига идёт от него, а не от того, что было до сна
      const known = positions.get(document);
      if (known) known.y = scroller.scrollTop;
      send({ type: "resync", y: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight });
      if (finishNow) {
        dirty = true;
        refreshIfDirty(reason);
      }
      repaint(finishNow);
    };
    const onPageShow = (event: Event) =>
      resync((event as PageTransitionEvent).persisted ? "pageshow (из кэша)" : "pageshow", true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") resync("вкладка снова видна", true);
    };
    const onResize = () => resync("resize окна", false);
    const onViewportResize = () => resync("resize области", false);

    const onFocusIn = (event: FocusEvent) => {
      let keyboard = true;
      try {
        keyboard = (event.target as Element).matches(":focus-visible");
      } catch {
        // Старый браузер без :focus-visible: безопаснее считать фокус клавиатурным
      }
      send({ type: "focus", keyboard });
    };
    // Переход фокуса между вкладками внутри панели — это focusout и сразу focusin: «ушёл»
    // тут же сменяется «пришёл», и состояние то же, поэтому relatedTarget не разбираем
    const onFocusOut = () => send({ type: "blur" });
    const onPointerDown = () => send({ type: "touch" });

    // Касания экрана — только в журнал: касание как раз возвращает зависшую панель, и по времени
    // касания видно, было ли зависание до него. Состояния не меняют, слушатели пассивные
    const onTouch = (event: Event) => {
      const touches = (event as TouchEvent).touches?.length ?? 0;
      tabbarDebugLog(`${event.type} (${touches}) ${trace()}`);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("resize", onResize);
    // Адресная строка Safari меняет видимую область, не всегда меняя окно
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onViewportResize);
    nav.addEventListener("focusin", onFocusIn);
    nav.addEventListener("focusout", onFocusOut);
    nav.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("touchstart", onTouch, { capture: true, passive: true });
    document.addEventListener("touchend", onTouch, { capture: true, passive: true });
    window.addEventListener("storage", onNoHideChange);
    window.addEventListener(TABBAR_DEBUG_CHANGE_EVENT, onNoHideChange);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("resize", onResize);
      viewport?.removeEventListener("resize", onViewportResize);
      nav.removeEventListener("focusin", onFocusIn);
      nav.removeEventListener("focusout", onFocusOut);
      nav.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("touchstart", onTouch, { capture: true });
      document.removeEventListener("touchend", onTouch, { capture: true });
      window.removeEventListener("storage", onNoHideChange);
      window.removeEventListener(TABBAR_DEBUG_CHANGE_EVENT, onNoHideChange);
      window.clearTimeout(settleTimer);
      window.clearTimeout(finishTimer);
      apiRef.current = { send: () => {}, repaint: () => {}, after: () => {} };
    };
  }, [ref]);

  // Открылся другой раздел: панель на месте, и ближайшие секунды прокрутка её не прячет.
  // Только при смене раздела, не при первом показе: иначе листание в первую секунду после
  // загрузки страницы не прятало бы панель
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    tabbarDebugLog(`раздел: ${pathname}`);
    apiRef.current.send({ type: "route", now: performance.now() });
    // Перерисовка принудительная, даже если метка не менялась: на новой странице Safari мог
    // остаться с застывшим кадром панели. Там же — сверка положения и, на iOS, освежение слоя
    apiRef.current.after("смена раздела");
  }, [pathname]);

  useEffect(() => {
    apiRef.current.send({ type: "sheet", open: sheetOpen });
  }, [sheetOpen]);
}
