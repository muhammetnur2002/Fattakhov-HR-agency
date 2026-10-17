/**
 * Нижняя панель разделов прячется при прокрутке вниз и возвращается (просьба владельца
 * 17.10.2026), проверка в настоящем браузере на телефоне, пальцем.
 *
 * Общий набор для обоих кабинетов: его вызывают `bottom-tabs-hide.spec.ts` (агентство)
 * и `client-bottom-tabs-hide.spec.ts` (клиент, свой вход по имени файла в playwright.config.ts).
 * Правила и числа — `lib/tabbar-visibility.ts` и tests/tabbar-visibility.test.ts; здесь то,
 * что видно только в браузере: панель на самом деле уезжает за край окна, не ловит нажатия,
 * возвращается за 200 мс и не мешает «уменьшить движение».
 *
 * Прокрутка — настоящий жест пальцем (протокол отладки Chromium, `Input.synthesizeScrollGesture`
 * с касанием), а не `window.scrollTo`: у жеста те же события scroll, что у человека, — десятки
 * в секунду с шагом около 20 px.
 *
 * Панель прячется только сдвигом (без прозрачности): спрятанная — целиком за нижним краем окна,
 * видимая — целиком в окне, а непрозрачна она всегда. Промежуточного положения в конце перехода
 * не бывает (в Safari на iPhone оно возникало, см. lib/hooks/use-tabbar-visibility.ts) — это
 * проверяют тесты «конец перехода», «20 раз вниз-вверх» и «переход застыл». Настоящий Safari
 * здесь недоступен: всё это в Chromium.
 *
 * Дополнительно к поведению: «предки панели» (ничто над ней не ломает `position: fixed`),
 * «правило для iOS» (в стилях есть `@supports (-webkit-touch-callout: none)` без перехода:
 * Chromium это условие не выполняет, поэтому проверяется сам текст правила), «диагностика»
 * (переключатели в настройках, строка и контрольный квадрат поверх страницы, ничего не двигают),
 * «стоп-кран» (флаг «Не прятать панель при прокрутке») и «сверка положения» (панель не там, где
 * должна, — лечение пробуется и попадает в журнал). Состояние iPhone целиком — «iOS (подмена
 * признака WebKit)»: подменён `CSS.supports` (путь хука) и снят переход (то, что на iOS делает
 * правило `@supports`, а Chromium его не выполняет).
 *
 * Часы тут существенны: панель сама возвращается через 600 мс после остановки прокрутки, поэтому
 * проверки «спрятана» идут сразу после жеста, одним обращением к странице.
 */
import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { TABBAR_DEBUG_LOG_SIZE } from "../../../lib/tabbar-debug";
import { FINISH_GUARD_MS, PIN_AFTER_ROUTE_MS, SETTLE_MS, TABBAR_SLIDE_MS } from "../../../lib/tabbar-visibility";

export type TabbarHideConfig = {
  /** Название набора: кабинет. */
  role: string;
  /** Длинный список, который можно прокручивать. */
  listPath: string;
  /** Страница покороче: с неё нажимают вкладку и попадают на длинную. */
  shortPath: string;
  /** Подпись вкладки, ведущей с короткой страницы на длинную. */
  tabName: string;
  /** «Настройки»: внизу страницы — переключатель временной диагностики панели. */
  settingsPath: string;
};

const NAV = "nav[data-bottom-tabs]";

type Snapshot = {
  hidden: boolean;
  top: number;
  bottom: number;
  left: number;
  right: number;
  opacity: number;
  animations: number;
  innerWidth: number;
  pointerEvents: string;
  display: string;
  scrollY: number;
  innerHeight: number;
  toEnd: number;
  overflowX: number;
};

const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate((sel) => {
    const nav = document.querySelector(sel)!;
    const cs = getComputedStyle(nav);
    const rect = nav.getBoundingClientRect();
    return {
      hidden: nav.hasAttribute("data-hidden"),
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      opacity: Number(cs.opacity),
      animations: nav.getAnimations().length,
      innerWidth: window.innerWidth,
      pointerEvents: cs.pointerEvents,
      display: cs.display,
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      toEnd: document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, NAV);

/**
 * Панель целиком за нижним краем окна: верх на краю или ниже. Прозрачность не участвует:
 * спрятанная панель непрозрачна, различаются состояния только положением.
 */
const isOffscreen = (s: Snapshot) => s.top >= s.innerHeight - 0.5 && s.opacity === 1;
/** Панель на своём месте, целиком в окне и непрозрачная. */
const isShown = (s: Snapshot, restTop: number) =>
  !s.hidden && Math.abs(s.top - restTop) < 1 && s.bottom <= s.innerHeight && s.opacity === 1;

/**
 * Жест пальцем в точке (x, y): `dy` больше нуля — содержимое едет вниз (палец вверх),
 * `dx` больше нуля — вправо (палец влево).
 */
async function swipeAt(cdp: CDPSession, x: number, y: number, { dy = 0, dx = 0 }: { dy?: number; dx?: number }, speed = 1400) {
  await cdp.send("Input.synthesizeScrollGesture", {
    x,
    y,
    yDistance: -dy,
    xDistance: -dx,
    speed,
    gestureSourceType: "touch",
    preventFling: true,
  });
}

/** Жест пальцем по странице: `dy` больше нуля — страница едет вниз (палец вверх). */
async function swipe(cdp: CDPSession, dy: number, speed = 1400) {
  await swipeAt(cdp, 187, 360, { dy }, speed);
}

/**
 * Поверх страницы встают два своих прокручиваемых контейнера: вертикальный список и боковая
 * лента (как лента чипов). `position: fixed` — страница под ними не растёт и не сдвигается,
 * `overscroll-behavior: contain` — дойдя до конца, жест не уходит в страницу. Страницы кабинета
 * подходящего контейнера под пальцем не дают, поэтому он вставляется.
 */
async function addScrollers(page: Page) {
  await page.evaluate(() => {
    const make = (id: string, css: string, inner: string) => {
      const box = document.createElement("div");
      box.id = id;
      box.style.cssText = `position:fixed;left:16px;width:343px;z-index:5;background:#ddd;overscroll-behavior:contain;${css}`;
      const content = document.createElement("div");
      content.style.cssText = inner;
      box.append(content);
      document.body.append(box);
    };
    make("t-list", "top:96px;height:220px;overflow-y:auto;overflow-x:hidden;", "height:4000px;");
    // Содержимое ленты высокое, хотя вертикально она не листается: scrollHeight велик, и "край страницы"
    // её не прикрывает — удержать панель на месте может только то, что вертикаль не менялась
    make("t-strip", "top:340px;height:60px;overflow-x:auto;overflow-y:hidden;", "width:2000px;height:3000px;");
  });
}

/** Записывает каждую смену метки data-hidden: чтобы проверять «ни разу не пряталась» без часов. */
async function recordMarks(page: Page) {
  await page.evaluate((sel) => {
    const nav = document.querySelector(sel)!;
    const w = window as unknown as { __marks: boolean[] };
    w.__marks = [];
    new MutationObserver(() => w.__marks.push(nav.hasAttribute("data-hidden"))).observe(nav, {
      attributes: true,
      attributeFilter: ["data-hidden"],
    });
  }, NAV);
}
const readMarks = (page: Page) => page.evaluate(() => (window as unknown as { __marks: boolean[] }).__marks);

/** Страница открыта, слушатели панели уже стоят (они ставятся после гидратации), панель на месте. */
async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForSelector(NAV);
  // Ждём, пока приложение отвечает, а не только загрузилось: слушатель scroll ставит эффект
  await page.waitForTimeout(300);
  const s = await snapshot(page);
  expect(isShown(s, s.top), "панель на месте после загрузки").toBe(true);
  return s.top;
}

export function registerTabbarHideTests(config: TabbarHideConfig) {
  test.describe(`панель разделов прячется и возвращается — ${config.role}`, () => {
    test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

    test("вниз на 400 px: уезжает за край окна, гаснет, не ловит нажатия и не даёт прокрутки вбок", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      const s = await snapshot(page);
      expect(s.scrollY, "страница действительно прокрутилась").toBeGreaterThan(350);
      expect(s.hidden).toBe(true);
      expect(isOffscreen(s), `панель пересекает окно: top=${s.top}, окно ${s.innerHeight}`).toBe(true);
      expect(s.pointerEvents).toBe("none");
      expect(s.overflowX, "страница не уехала вбок").toBe(0);
      expect(restTop, "до жеста панель стояла в окне").toBeLessThan(s.innerHeight - 40);
    });

    test("у самого верха (до 80 px) и при малом шаге панель не трогает, глубже — прячет", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      // 20 px — меньше порога в 24
      await swipe(cdp, 20, 400);
      let s = await snapshot(page);
      expect(s.scrollY).toBeGreaterThan(10);
      expect(isShown(s, restTop)).toBe(true);
      // Ещё 30 px: подряд накоплено 50 > 24, но страница не глубже 80 px от верха — панель нужна, на месте
      await swipe(cdp, 30, 400);
      s = await snapshot(page);
      expect(s.scrollY, "жест не вышел за 80 px").toBeGreaterThan(40);
      expect(s.scrollY).toBeLessThan(80);
      expect(isShown(s, restTop), "до 80 px от верха панель не прячется").toBe(true);
      // Ещё 100 px подряд в ту же сторону: накоплено больше 24 и страница глубже 80 — спрятана
      await swipe(cdp, 100, 400);
      s = await snapshot(page);
      expect(s.scrollY).toBeGreaterThan(100);
      expect(s.hidden).toBe(true);
    });

    test("вверх на 60 px: сразу на месте, не дожидаясь остановки", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      expect((await snapshot(page)).hidden).toBe(true);

      const started = Date.now();
      await swipe(cdp, -60, 600);
      await page.waitForFunction(
        ([sel, top]) => {
          const nav = document.querySelector(sel as string)!;
          return !nav.hasAttribute("data-hidden") && Math.abs(nav.getBoundingClientRect().top - (top as number)) < 1;
        },
        [NAV, restTop],
        { timeout: 2000 },
      );
      const elapsed = Date.now() - started;
      // Вернулась жестом, а не по таймеру: остановка вернула бы её не раньше SETTLE_MS после конца жеста
      expect(elapsed, `вернулась за ${elapsed} мс`).toBeLessThan(SETTLE_MS);
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);
      expect((await snapshot(page)).overflowX).toBe(0);
    });

    test("остановка: пока листают её нет, через 600 мс без движения она на месте", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      await page.waitForTimeout(300);
      expect(isOffscreen(await snapshot(page)), "через 300 мс после жеста ещё спрятана").toBe(true);

      // 800 мс без прокрутки (отсчёт идёт от последнего события, оно было до конца жеста)
      await page.waitForTimeout(800 - 300 + 200);
      const s = await snapshot(page);
      expect(isShown(s, restTop), `через ~1 с: hidden=${s.hidden} top=${s.top}`).toBe(true);
      expect(s.pointerEvents).toBe("auto");
    });

    test("вверху и внизу страницы панель видна, даже если только что была спрятана", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      expect((await snapshot(page)).hidden).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);

      await swipe(cdp, 400);
      expect((await snapshot(page)).hidden).toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);
      // и остаётся, пока человек у конца страницы
      await page.waitForTimeout(SETTLE_MS + 300);
      const s = await snapshot(page);
      expect(s.toEnd, "страница действительно дошла до конца").toBeLessThanOrEqual(8);
      expect(isShown(s, restTop)).toBe(true);
    });

    test("жестом вниз доехали до конца страницы: панель на месте уже на конце, не дожидаясь остановки", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      // Встаём за 500 px до конца и даём панели вернуться после прыжка
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight - 500));
      await page.waitForTimeout(SETTLE_MS + 400);
      await page.evaluate((sel) => {
        const nav = document.querySelector(sel)!;
        const w = window as unknown as { __marks: boolean[] };
        w.__marks = [];
        new MutationObserver(() => w.__marks.push(nav.hasAttribute("data-hidden"))).observe(nav, {
          attributes: true,
          attributeFilter: ["data-hidden"],
        });
      }, NAV);

      await swipe(cdp, 500, 700);
      const returnedAfter = Date.now();
      await page.waitForFunction(
        ([sel, top]) => {
          const nav = document.querySelector(sel as string)!;
          return !nav.hasAttribute("data-hidden") && Math.abs(nav.getBoundingClientRect().top - (top as number)) < 1;
        },
        [NAV, restTop],
        { timeout: 2000 },
      );
      expect(Date.now() - returnedAfter, "вернулась на конце страницы, а не по таймеру остановки").toBeLessThan(SETTLE_MS);
      const marks = await page.evaluate(() => (window as unknown as { __marks: boolean[] }).__marks);
      expect(marks, "по дороге панель пряталась, иначе проверка ничего не доказывает").toContain(true);
      expect(marks.at(-1)).toBe(false);
      // Положение вернулось раньше, чем непрозрачность дошла до единицы: ждём конца перехода
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);
      expect((await snapshot(page)).toEnd, "жест дошёл до конца страницы").toBeLessThanOrEqual(8);
    });

    test("нажатие на вкладку: панель на месте и 2,5 с не прячется, потом снова прячется", async ({ page }) => {
      const restTop = await open(page, config.shortPath);
      const cdp = await page.context().newCDPSession(page);
      const tab = page.locator(NAV).getByRole("link", { name: config.tabName });
      const tabBox = (await tab.boundingBox())!;

      await page.touchscreen.tap(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
      // Раздел принят приложением: подсветка вкладки меняется вместе с адресом в React
      await expect(tab).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
      const routed = Date.now();
      // Сама страница, а не заготовка загрузки: у заготовки короткая высота, и жест упёрся бы в её конец
      // (там панель видна по другой причине — «конец страницы»), а не в закрепление после смены раздела
      await expect(page.getByRole("heading", { level: 1, name: config.tabName })).toBeVisible({ timeout: 15_000 });

      await swipe(cdp, 500, 2500);
      const during = await snapshot(page);
      expect(during.scrollY, "страница прокрутилась на всю длину жеста").toBeGreaterThan(400);
      expect(Date.now() - routed, "проверка идёт внутри закрепления").toBeLessThan(PIN_AFTER_ROUTE_MS - 500);
      expect(isShown(during, restTop), "панель на месте в первые секунды").toBe(true);

      // Закрепление кончилось
      await page.waitForTimeout(Math.max(0, PIN_AFTER_ROUTE_MS + 400 - (Date.now() - routed)));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      await swipe(cdp, 400);
      const after = await snapshot(page);
      expect(after.hidden).toBe(true);
      expect(isOffscreen(after)).toBe(true);
    });

    test("Tab в спрятанную панель показывает её и держит, пока фокус внутри; без фокуса — снова прячется", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      const hidden = await snapshot(page);
      expect(hidden.hidden).toBe(true);

      // Из начала страницы Shift+Tab ведёт к последнему элементу — нижней панели
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("Shift+Tab");
        if (await page.evaluate((sel) => !!document.activeElement?.closest(sel), NAV)) break;
      }
      expect(await page.evaluate((sel) => !!document.activeElement?.closest(sel), NAV), "фокус пришёл в панель").toBe(true);
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);
      expect((await snapshot(page)).scrollY, "фокус на панели страницу не сдвинул").toBeGreaterThan(hidden.scrollY - 2);
      expect((await snapshot(page)).scrollY).toBeLessThan(hidden.scrollY + 2);

      // Пока фокус внутри, листание панель не прячет
      await swipe(cdp, 400);
      expect(isShown(await snapshot(page), restTop)).toBe(true);

      // Фокус ушёл — прячется как обычно
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.evaluate(() => window.scrollTo(0, 100));
      await page.waitForTimeout(100);
      await swipe(cdp, 400);
      expect((await snapshot(page)).hidden).toBe(true);
    });

    test("шторка «Ещё» открыта: прокрутка панель не прячет", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const more = page.locator(NAV).getByRole("button", { name: "Ещё" });
      const box = (await more.boundingBox())!;

      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByRole("dialog")).toBeVisible();

      const before = (await snapshot(page)).scrollY;
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(50);
      const s = await snapshot(page);
      expect(s.scrollY, "страница под шторкой прокрутилась, иначе проверка ничего не доказывает").toBeGreaterThan(before + 300);
      expect(s.hidden, "панель под открытой шторкой не прячется").toBe(false);
      expect(isShown(s, restTop)).toBe(true);

      // Та же прокрутка без шторки панель прячет — иначе «не прячется» ничего бы не значило
      // (закрываем нажатием: после Escape фокус с клавиатуры вернулся бы на «Ещё» и держал панель видимой)
      await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).tap();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(50);
      expect((await snapshot(page)).hidden, "без шторки та же прокрутка прячет панель").toBe(true);
    });

    test("боковая лента: листается вбок — панель не трогает, хотя страница глубже 80 px", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await addScrollers(page);

      // Встаём глубже 80 px и даём панели вернуться после прыжка: дальше любая вертикаль её спрятала бы
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.waitForTimeout(SETTLE_MS + 400);
      expect(isShown(await snapshot(page), restTop)).toBe(true);
      await recordMarks(page);

      await swipeAt(cdp, 187, 370, { dx: 400 }, 700);
      const strip = await page.evaluate(() => document.getElementById("t-strip")!.scrollLeft);
      expect(strip, "лента действительно уехала вбок").toBeGreaterThan(200);
      expect((await snapshot(page)).scrollY, "страница не сдвинулась").toBe(300);
      expect(await readMarks(page), "ни одной смены метки: боковая прокрутка вертикалью не считается").toEqual([]);
      expect(isShown(await snapshot(page), restTop)).toBe(true);

      // Та же страница вертикальным жестом панель прячет — иначе «не тронуло» ничего бы не значило
      // (жест ниже ленты: на самой ленте он не перешёл бы в страницу — overscroll-behavior: contain)
      await swipeAt(cdp, 187, 520, { dy: 200 });
      expect((await snapshot(page)).hidden).toBe(true);
    });

    test("вложенный список: листается вниз — панель прячется, хотя страница стоит; вверх на 8 px — возвращается сразу", async ({ page }) => {
      // Так задумано: направление считается по каждому прокручиваемому элементу, а не только по странице
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await addScrollers(page);
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.waitForTimeout(SETTLE_MS + 400);
      expect(isShown(await snapshot(page), restTop)).toBe(true);

      await swipeAt(cdp, 187, 200, { dy: 300 }, 1400);
      const hidden = await snapshot(page);
      expect(await page.evaluate(() => document.getElementById("t-list")!.scrollTop), "список прокрутился").toBeGreaterThan(250);
      expect(hidden.scrollY, "страница под списком не сдвинулась").toBe(300);
      expect(hidden.hidden, "вниз по списку — спрятана").toBe(true);

      const started = Date.now();
      await swipeAt(cdp, 187, 200, { dy: -60 }, 600);
      await page.waitForFunction(
        ([sel, top]) => {
          const nav = document.querySelector(sel as string)!;
          return !nav.hasAttribute("data-hidden") && Math.abs(nav.getBoundingClientRect().top - (top as number)) < 1;
        },
        [NAV, restTop],
        { timeout: 2000 },
      );
      expect(Date.now() - started, "вернулась жестом вверх по списку, а не по таймеру").toBeLessThan(SETTLE_MS);
    });

    test("список, потом страница: переход между контейнерами не даёт ложного «вверх»", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      await addScrollers(page);
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.waitForTimeout(SETTLE_MS + 400);
      expect(isShown(await snapshot(page), restTop)).toBe(true);

      // Список уехал далеко (640 px), страница стоит на 300. Затем страница сдвигается вниз на 60 px
      // (до 360 — всё ещё меньше положения списка). Если помнить одно положение на всех, второй сдвиг
      // выглядел бы как прокрутка вверх на 280 px и вернул бы панель. Всё внутри одного вызова, за доли
      // секунды: остановка за это время панель не возвращает, а метки читаются до неё
      const result = await page.evaluate(async () => {
        const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const nav = document.querySelector("nav[data-bottom-tabs]")!;
        const marks: boolean[] = [];
        new MutationObserver(() => marks.push(nav.hasAttribute("data-hidden"))).observe(nav, {
          attributes: true,
          attributeFilter: ["data-hidden"],
        });
        const list = document.getElementById("t-list")!;
        list.scrollTop = 40; // первое событие элемента лишь запоминает место
        await frames();
        list.scrollTop = 640;
        await frames();
        const afterList = nav.hasAttribute("data-hidden");
        window.scrollTo(0, 360);
        await frames();
        return { afterList, afterPage: nav.hasAttribute("data-hidden"), scrollY: window.scrollY, marks };
      });
      expect(result.scrollY).toBe(360);
      expect(result.afterList, "список вниз на 600 px спрятал панель").toBe(true);
      expect(result.afterPage, "страница вниз на 60 px не вернула её: у каждого элемента своё положение").toBe(true);
      expect(result.marks, "панель спряталась один раз и не мигала").toEqual([true]);
    });

    test("конец перехода: спрятанная — целиком за нижним краем, вернувшаяся — целиком в окне, непрозрачна всегда", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      await page.waitForTimeout(TABBAR_SLIDE_MS + 100);
      const hidden = await snapshot(page);
      expect(hidden.hidden).toBe(true);
      expect(hidden.top, `верх панели ${hidden.top} в окне высотой ${hidden.innerHeight}`).toBeGreaterThanOrEqual(hidden.innerHeight);
      expect(hidden.opacity, "спрятанная панель непрозрачна: прячет её только положение").toBe(1);
      expect(hidden.animations, "переход кончился, зависших нет").toBe(0);

      await swipe(cdp, -80, 600);
      await page.waitForFunction(
        (sel) => !document.querySelector(sel as string)!.hasAttribute("data-hidden"),
        NAV,
        { timeout: 2000 },
      );
      await page.waitForTimeout(TABBAR_SLIDE_MS + 100);
      const shown = await snapshot(page);
      expect(isShown(shown, restTop)).toBe(true);
      expect(shown.left, "целиком в окне слева").toBeGreaterThanOrEqual(0);
      expect(shown.right, "целиком в окне справа").toBeLessThanOrEqual(shown.innerWidth);
      expect(shown.bottom).toBeLessThanOrEqual(shown.innerHeight);
      expect(shown.opacity).toBe(1);
      expect(shown.animations).toBe(0);
    });

    test("20 раз вниз-вверх: в конце каждого перехода панель либо за краем, либо на своём месте, никогда посередине", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(SETTLE_MS + 400);
      expect(isShown(await snapshot(page), restTop)).toBe(true);

      for (let i = 1; i <= 20; i++) {
        await swipe(cdp, 220, 1600);
        await page.waitForTimeout(TABBAR_SLIDE_MS + 80);
        const down = await snapshot(page);
        expect(down.scrollY, `круг ${i}: страница ушла вниз`).toBeGreaterThan(550);
        expect(down.hidden, `круг ${i}: после листания вниз спрятана`).toBe(true);
        expect(down.top, `круг ${i}: за краем (верх ${down.top})`).toBeGreaterThanOrEqual(down.innerHeight);
        expect(down.opacity).toBe(1);
        expect(down.animations, `круг ${i}: переход кончился`).toBe(0);

        await swipe(cdp, -220, 1600);
        await page.waitForTimeout(TABBAR_SLIDE_MS + 80);
        const up = await snapshot(page);
        expect(up.hidden, `круг ${i}: после листания вверх вернулась`).toBe(false);
        expect(Math.abs(up.top - restTop), `круг ${i}: на своём месте (верх ${up.top}, место ${restTop})`).toBeLessThan(1);
        expect(up.opacity).toBe(1);
        expect(up.animations, `круг ${i}: переход кончился`).toBe(0);
      }
    });

    test("переход застыл на середине (время страницы остановлено): доводка ставит конечное положение сама", async ({ page }) => {
      // Так в Safari на iPhone выглядела жалоба: метка встала, а переход не двигается, пока не коснёшься.
      // Остановка времени документа в Chromium (протокол отладки, Animation.setPlaybackRate = 0) делает то же:
      // переход не идёт, хотя состояние верное. Без доводки панель осталась бы на месте, и «спрятанная» была бы в окне
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.waitForTimeout(SETTLE_MS + 400);
      expect(isShown(await snapshot(page), restTop)).toBe(true);

      await cdp.send("Animation.enable");
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
      try {
        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(50);
        const frozen = await snapshot(page);
        expect(frozen.hidden, "метка встала").toBe(true);
        expect(frozen.top, "а панель с места не сдвинулась: переход заморожен").toBeLessThan(frozen.innerHeight - 40);

        await page.waitForTimeout(TABBAR_SLIDE_MS + FINISH_GUARD_MS + 150);
        const done = await snapshot(page);
        expect(done.hidden).toBe(true);
        expect(done.top, `доводка поставила конечное положение (верх ${done.top})`).toBeGreaterThanOrEqual(done.innerHeight);
        expect(done.animations, "застывших переходов не осталось").toBe(0);

        // И обратно: страница у верха, переход снова заморожен — панель всё равно на месте
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(TABBAR_SLIDE_MS + FINISH_GUARD_MS + 150);
        expect(isShown(await snapshot(page), restTop)).toBe(true);
      } finally {
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
      }
    });

    test("смена раздела при спрятанной панели: панель на месте, а не остаётся за краем", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      await page.waitForTimeout(TABBAR_SLIDE_MS + 50);
      expect(isOffscreen(await snapshot(page))).toBe(true);

      // Ссылка страницы в видимой части: нажатие на неё открывает другой раздел (клиентская навигация)
      const target = await page.evaluate((limit) => {
        const here = location.pathname;
        for (const a of document.querySelectorAll<HTMLAnchorElement>("main a[href^='/']")) {
          const r = a.getBoundingClientRect();
          if (r.top > 70 && r.bottom < limit && r.width > 20 && new URL(a.href).pathname !== here) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
        return null;
      }, restTop - 10);
      expect(target, "в видимой части нашлась ссылка на другую страницу").not.toBeNull();
      const here = new URL(page.url()).pathname;
      await page.touchscreen.tap(target!.x, target!.y);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).not.toBe(here);

      await expect.poll(async () => isShown(await snapshot(page), restTop), { timeout: 5000 }).toBe(true);
      await page.waitForTimeout(TABBAR_SLIDE_MS + 100);
      const s = await snapshot(page);
      expect(isShown(s, restTop), `после смены раздела: метка=${s.hidden}, верх=${s.top}`).toBe(true);
      expect(s.animations).toBe(0);
    });

    test("ввод в поле: панель уезжает вниз, как раньше, и это отдельный механизм", async ({ page }) => {
      const restTop = await open(page, config.listPath);

      await page.locator('main input[type="text"]').first().tap();
      await expect.poll(async () => isOffscreen(await snapshot(page))).toBe(true);
      const s = await snapshot(page);
      expect(s.pointerEvents).toBe("none");
      expect(s.hidden, "прятал не data-hidden, а правило про поле ввода").toBe(false);

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);
    });

    test("«Уменьшить движение»: перехода нет, панель исчезает и появляется мгновенно", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      const rest = await page.evaluate((sel) => {
        const cs = getComputedStyle(document.querySelector(sel)!);
        return { property: cs.transitionProperty, duration: cs.transitionDuration };
      }, NAV);
      expect(rest.property).toBe("none");

      // В момент, когда метка встала, положение уже конечное: перехода, который тянул бы его, нет
      await page.evaluate((sel) => {
        const nav = document.querySelector(sel)!;
        new MutationObserver(() => {
          const w = window as unknown as { __topAtMark: number[] };
          (w.__topAtMark ??= []).push(nav.hasAttribute("data-hidden") ? nav.getBoundingClientRect().top : -1);
        }).observe(nav, { attributes: true, attributeFilter: ["data-hidden"] });
      }, NAV);
      await swipe(cdp, 400);
      await swipe(cdp, -60, 600);
      const marks = await page.evaluate(() => (window as unknown as { __topAtMark: number[] }).__topAtMark);
      expect(marks.length, "панель спряталась и вернулась").toBeGreaterThanOrEqual(2);
      expect(marks[0], "в момент скрытия панель уже за краем окна").toBeGreaterThanOrEqual(667 - 0.5);
      const s = await snapshot(page);
      expect(isShown(s, restTop)).toBe(true);
    });

    test("без «уменьшить движение»: переход только transform за 200 мс, свой слой навсегда", async ({ page }) => {
      await open(page, config.listPath);
      const rest = await page.evaluate((sel) => {
        const cs = getComputedStyle(document.querySelector(sel)!);
        return {
          property: cs.transitionProperty,
          duration: cs.transitionDuration,
          willChange: cs.willChange,
          backface: cs.backfaceVisibility,
          transform: cs.transform,
          opacity: cs.opacity,
        };
      }, NAV);
      // Прозрачности в переходе нет: в Safari на iPhone она зависала на середине
      expect(rest.property).toBe("transform");
      expect(rest.duration).toBe(`${TABBAR_SLIDE_MS / 1000}s`);
      // Слой у панели в покое тот же, что и в движении: Safari не создаёт и не разрушает его на стыке перехода
      expect(rest.willChange).toBe("transform");
      expect(rest.backface).toBe("hidden");
      expect(rest.transform, "в покое — единичное преобразование, а не none").toBe("matrix(1, 0, 0, 1, 0, 0)");
      expect(rest.opacity).toBe("1");
    });

    test("предки панели не ломают position: fixed: ни transform, ни filter, ни will-change, ни contain, ни анимации", async ({ page }) => {
      // Предок с transform, filter, perspective, contain: paint или will-change: transform делает панель
      // «fixed» относительно себя, а не окна: она ехала бы вместе со страницей. На iPhone панель висела
      // посреди страницы, так что предков проверяем на обеих страницах кабинета (все четыре предка:
      // оболочка кабинета, body, html)
      for (const path of [config.listPath, config.shortPath]) {
        // Без open(): его проверка «панель в окне» сама бы упала раньше и скрыла, какой предок виноват
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForSelector(NAV);
        const rows = await page.evaluate((sel) => {
          const nav = document.querySelector(sel)!;
          const out: { el: string; breaks: string[] }[] = [];
          for (let el = nav.parentElement; el; el = el.parentElement) {
            const cs = getComputedStyle(el);
            const breaks: string[] = [];
            if (cs.transform !== "none") breaks.push(`transform=${cs.transform}`);
            if (cs.filter !== "none") breaks.push(`filter=${cs.filter}`);
            if (cs.backdropFilter !== "none") breaks.push(`backdrop-filter=${cs.backdropFilter}`);
            if (cs.perspective !== "none") breaks.push(`perspective=${cs.perspective}`);
            if (/transform|perspective|filter/.test(cs.willChange)) breaks.push(`will-change=${cs.willChange}`);
            if (/paint|layout|strict|content/.test(cs.contain)) breaks.push(`contain=${cs.contain}`);
            if (cs.containerType !== "normal") breaks.push(`container-type=${cs.containerType}`);
            if (cs.contentVisibility !== "visible") breaks.push(`content-visibility=${cs.contentVisibility}`);
            if (cs.animationName !== "none") breaks.push(`animation=${cs.animationName}`);
            if (cs.opacity !== "1") breaks.push(`opacity=${cs.opacity}`);
            if (cs.clipPath !== "none") breaks.push(`clip-path=${cs.clipPath}`);
            out.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""), breaks });
          }
          return out;
        }, NAV);
        expect(rows.length, `${path}: предков до html`).toBeLessThanOrEqual(4);
        for (const row of rows) expect(row.breaks, `${path}: предок ${row.el}`).toEqual([]);
        // Сама панель: fixed, и от окна, а не от предка
        const own = await page.evaluate((sel) => {
          const nav = document.querySelector(sel) as HTMLElement;
          return { position: getComputedStyle(nav).position, offsetParent: nav.offsetParent === null };
        }, NAV);
        expect(own.position).toBe("fixed");
        expect(own.offsetParent, "у fixed-элемента нет offsetParent: привязан к окну").toBe(true);
      }
    });

    test("правило для iOS есть в стилях: @supports (-webkit-touch-callout: none) без перехода, без прозрачности", async ({ page }) => {
      // Chromium условия не выполняет (оно только у WebKit на iOS), поэтому в Chromium проверяем сам текст правила:
      // оно есть в собранных стилях и отключает переход панели, а прозрачности не касается
      await open(page, config.listPath);
      const rules = await page.evaluate(() => {
        const found: { condition: string; selector: string; transition: string; opacity: string }[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
          let list: CSSRuleList;
          try {
            list = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of Array.from(list)) {
            if (rule instanceof CSSSupportsRule && rule.conditionText.includes("-webkit-touch-callout")) {
              for (const inner of Array.from(rule.cssRules)) {
                const style = (inner as CSSStyleRule).style;
                found.push({
                  condition: rule.conditionText,
                  selector: (inner as CSSStyleRule).selectorText,
                  transition: style.getPropertyValue("transition"),
                  opacity: style.getPropertyValue("opacity"),
                });
              }
            }
          }
        }
        return found;
      });
      const panelRule = rules.find((r) => r.selector === "[data-bottom-tabs]");
      expect(panelRule, `правило панели под @supports: ${JSON.stringify(rules)}`).toBeTruthy();
      expect(panelRule!.condition.replace(/\s+/g, " ")).toBe("(-webkit-touch-callout: none)");
      expect(panelRule!.transition).toBe("none");
      expect(panelRule!.opacity, "прозрачности в правиле нет").toBe("");
      // В Chromium условие ложно, и переход остаётся: правило ничего не испортило остальным браузерам
      const live = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)!).transitionProperty, NAV);
      expect(live).toBe("transform");
    });

    test("диагностика: по умолчанию выключена; переключатель внизу «Настроек» показывает строку поверх страницы, ничего не сдвигая", async ({ page }) => {
      await page.goto(config.settingsPath, { waitUntil: "networkidle" });
      await page.waitForSelector(NAV);
      await page.waitForTimeout(300);
      // На настройках клиента автофокус в поле пароля прячет панель правилом про ввод, а любое нажатие по странице
      // снимает с поля фокус, и панель возвращается: снимаем фокус сами и мерим положение панели, когда её переход
      // кончился, чтобы сравнивать «до» и «после» включения диагностики, а не движение панели
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForFunction((sel) => document.querySelector(sel as string)!.getAnimations().length === 0, NAV);
      await page.waitForTimeout(TABBAR_SLIDE_MS + 100);
      await expect(page.getByTestId("tabbar-debug"), "без флага строки нет").toHaveCount(0);

      const toggle = page.getByLabel("Диагностика панели разделов (временно)");
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).not.toBeChecked();
      // Переключатель — последнее на странице, мелко
      const placement = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("label")).find((l) => l.textContent?.includes("Диагностика панели разделов (временно)"))!;
        const main = document.querySelector("main")!;
        const mainBottom = main.getBoundingClientRect().bottom + window.scrollY;
        const rect = label.getBoundingClientRect();
        return { fromEnd: mainBottom - (rect.bottom + window.scrollY), fontSize: parseFloat(getComputedStyle(label).fontSize) };
      });
      expect(placement.fromEnd, "переключатель внизу страницы, под ним только отступ main").toBeLessThan(300);
      expect(placement.fontSize, "мелко").toBeLessThanOrEqual(14);

      const before = await page.evaluate((sel) => {
        const nav = document.querySelector(sel)!.getBoundingClientRect();
        return { scrollHeight: document.documentElement.scrollHeight, navTop: nav.top, navBottom: nav.bottom, flag: localStorage.getItem("fhr-tabbar-debug") };
      }, NAV);
      expect(before.flag).toBeNull();

      await toggle.check();
      const overlay = page.getByTestId("tabbar-debug");
      await expect(overlay).toBeVisible();
      const style = await overlay.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          position: cs.position,
          pointerEvents: cs.pointerEvents,
          ariaHidden: el.getAttribute("aria-hidden"),
          fontFamily: cs.fontFamily,
          fontSize: parseFloat(cs.fontSize),
          left: el.getBoundingClientRect().left,
          top: el.getBoundingClientRect().top,
          text: (el as HTMLElement).innerText,
        };
      });
      expect(style.position).toBe("fixed");
      expect(style.pointerEvents, "не интерактивна").toBe("none");
      expect(style.ariaHidden).toBe("true");
      expect(style.fontFamily.toLowerCase(), "моноширинный шрифт").toMatch(/mono|menlo|courier/);
      expect(style.fontSize, "мелкий").toBeLessThanOrEqual(10);
      expect(style.left, "вверху слева").toBeLessThan(10);
      expect(style.top).toBeLessThan(10);
      for (const part of ["панель:", "y ", "окно ", "vv h ", "pageTop ", "rect t ", "контроль t ", "tf ", "лечений ", "iOS:", "приложение:", "не прятать: нет"]) {
        expect(style.text, `в строке есть «${part}»`).toContain(part);
      }
      // Раскладка не сдвинулась: ни высота страницы, ни положение панели
      const after = await page.evaluate((sel) => {
        const nav = document.querySelector(sel)!.getBoundingClientRect();
        return { scrollHeight: document.documentElement.scrollHeight, navTop: nav.top, navBottom: nav.bottom };
      }, NAV);
      expect(after.scrollHeight).toBe(before.scrollHeight);
      expect(after.navTop).toBeCloseTo(before.navTop, 1);
      expect(after.navBottom).toBeCloseTo(before.navBottom, 1);
      // Нажатие под строкой достаёт до страницы, а не до строки
      const hit = await page.evaluate(() => {
        const box = document.querySelector('[data-testid="tabbar-debug"]')!.getBoundingClientRect();
        return document.elementFromPoint(box.left + 6, box.top + 6)?.closest('[data-testid="tabbar-debug"]') !== null;
      });
      expect(hit, "строка не перехватывает нажатия").toBe(false);

      // Флаг пережил перезагрузку; выключили — строка исчезла и флаг снят
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByTestId("tabbar-debug")).toBeVisible();
      await expect(page.getByLabel("Диагностика панели разделов (временно)")).toBeChecked();
      await page.getByLabel("Диагностика панели разделов (временно)").uncheck();
      await expect(page.getByTestId("tabbar-debug")).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("fhr-tabbar-debug"))).toBeNull();
    });

    test("диагностика: строка показывает, как панель спряталась и вернулась", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fhr-tabbar-debug", "1"));
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await expect(page.getByTestId("tabbar-debug")).toBeVisible();

      await swipe(cdp, 400);
      await expect(page.getByTestId("tabbar-debug")).toContainText("панель: СКРЫТА (метка: да)");
      await expect(page.getByTestId("tabbar-debug")).toContainText("скрыта (scroll)");
      const during = await page.getByTestId("tabbar-debug").innerText();
      expect(during).toMatch(/rect t \d+\.\d b \d+\.\d/);
      await expect.poll(async () => isShown(await snapshot(page), restTop), { timeout: 4000 }).toBe(true);
      await expect(page.getByTestId("tabbar-debug")).toContainText("панель: видна (метка: нет)");
      await expect(page.getByTestId("tabbar-debug")).toContainText("видна (settle)");
      // Журнал — не больше десяти последних событий
      const lines = (await page.getByTestId("tabbar-debug").innerText()).split("\n");
      expect(lines.filter((l) => /^\d\d:\d\d:\d\d\.\d{3} /.test(l)).length).toBeLessThanOrEqual(TABBAR_DEBUG_LOG_SIZE);
      expect(lines.join("\n")).toContain("лечений 0");
      // Смена состояния — с положением страницы и временем от последнего scroll; касания документа — отдельными записями
      expect(lines.join("\n")).toMatch(/скрыта \(scroll\) y \d+ \+\d+мс/);
      expect(lines.join("\n")).toMatch(/видна \(settle\) y \d+ \+\d+мс/);
    });

    test("диагностика: касания документа попадают в журнал, а контрольный квадрат стоит внизу слева и не уезжает с панелью", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fhr-tabbar-debug", "1"));
      await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      const control = page.getByTestId("tabbar-debug-control");
      await expect(control).toBeVisible();

      const placement = () =>
        control.evaluate((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            position: cs.position,
            width: r.width,
            height: r.height,
            left: r.left,
            bottom: r.bottom,
            innerHeight: window.innerHeight,
            pointerEvents: cs.pointerEvents,
            transform: cs.transform,
            backdrop: cs.backdropFilter,
            filter: cs.filter,
            willChange: cs.willChange,
          };
        });
      const rest = await placement();
      expect(rest.position).toBe("fixed");
      expect([rest.width, rest.height], "восемь на восемь").toEqual([8, 8]);
      expect(rest.left, "у левого края").toBe(0);
      expect(rest.bottom, "у нижнего края окна").toBe(rest.innerHeight);
      expect(rest.pointerEvents).toBe("none");
      // Обычный фиксированный слой: ни сдвига, ни размытия, ни намёка на композитный слой
      expect(rest.transform).toBe("none");
      expect(rest.backdrop).toBe("none");
      expect(rest.filter).toBe("none");
      expect(rest.willChange).toBe("auto");

      await swipe(cdp, 400);
      await expect(page.getByTestId("tabbar-debug")).toContainText("панель: СКРЫТА");
      const during = await placement();
      expect(during.bottom, "панель уехала, контроль на месте").toBe(during.innerHeight);
      const text = await page.getByTestId("tabbar-debug").innerText();
      expect(text).toMatch(/контроль t \d+\.\d b \d+\.\d/);
      expect(text).toMatch(/touchstart \(1\) y \d+ \+(\d+|-)мс/);
      await expect.poll(async () => (await page.getByTestId("tabbar-debug").innerText()).match(/touchend \(0\) y \d+ \+\d+мс/) !== null).toBe(true);
    });

    test("стоп-кран: флаг «Не прятать панель при прокрутке» — панель не прячется ни жестом, ни остановкой; выключили — прячется", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fhr-tabbar-nohide", "1"));
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await recordMarks(page);
      for (let i = 0; i < 3; i++) {
        await swipe(cdp, 400);
        const s = await snapshot(page);
        expect(s.scrollY, `круг ${i + 1}: страница прокручена`).toBeGreaterThan(80);
        expect(isShown(s, restTop), `круг ${i + 1}: панель на месте`).toBe(true);
        await swipe(cdp, -300);
      }
      await page.waitForTimeout(SETTLE_MS + 300);
      expect(await readMarks(page), "метка не менялась вовсе").toEqual([]);

      // Выключили в этой же вкладке тем же событием, каким пользуется переключатель: прежние правила
      await page.evaluate(() => {
        localStorage.removeItem("fhr-tabbar-nohide");
        window.dispatchEvent(new Event("fhr-tabbar-debug-change"));
      });
      await swipe(cdp, 400);
      expect((await snapshot(page)).hidden, "стоп-кран снят — прячется").toBe(true);
    });

    test("стоп-кран включается переключателем внизу «Настроек» и действует на других страницах", async ({ page }) => {
      await page.goto(config.settingsPath, { waitUntil: "networkidle" });
      await page.waitForSelector(NAV);
      const noHide = page.getByLabel("Не прятать панель при прокрутке (временно)");
      await noHide.scrollIntoViewIfNeeded();
      await expect(noHide).not.toBeChecked();
      await expect(page.getByLabel("Диагностика панели разделов (временно)"), "второй переключатель первого не трогает").not.toBeChecked();
      await noHide.check();
      expect(await page.evaluate(() => localStorage.getItem("fhr-tabbar-nohide"))).toBe("1");
      expect(await page.evaluate(() => localStorage.getItem("fhr-tabbar-debug")), "отладочная строка не включилась").toBeNull();
      await expect(page.getByTestId("tabbar-debug")).toHaveCount(0);

      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);
      await swipe(cdp, 400);
      expect(isShown(await snapshot(page), restTop), "после жеста вниз панель на месте").toBe(true);
      await page.evaluate(() => localStorage.removeItem("fhr-tabbar-nohide"));
    });

    test("сверка положения: панель не там, где должна, — лечение пробуется, попадает в журнал и не зацикливается", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fhr-tabbar-debug", "1"));
      const restTop = await open(page, config.listPath);
      await expect(page.getByTestId("tabbar-debug")).toBeVisible();
      expect(await page.getByTestId("tabbar-debug").innerText()).toContain("лечений 0");

      // Панель сдвинута на 200 px выше места (так выглядела жалоба: висит посреди страницы). Лечение пересоздаёт
      // слой, но встроенный стиль с места не убрать, поэтому в Chromium оно «не помогает» — проверяем, что сверка
      // заметила, попробовала один раз и замолчала, а не крутится
      await page.evaluate((sel) => {
        (document.querySelector(sel) as HTMLElement).style.transform = "translate3d(0, -200px, 0)";
      }, NAV);
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.dispatchEvent(new Event("resize")));
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(TABBAR_SLIDE_MS + FINISH_GUARD_MS + 300);
      const text = await page.getByTestId("tabbar-debug").innerText();
      expect(text, "сверка заметила, что панель не там").toContain("не там (");
      expect(text).toContain("лечений 1");
      expect(text, "и честно записала, что лечение не помогло").toContain("лечение не помогло");
      expect(await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).style.display, NAV), "стиль display возвращён").toBe("");

      // Больше десяти секунд молчит: ещё несколько событий лечения не добавляют
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.dispatchEvent(new Event("resize")));
        await page.waitForTimeout(350);
      }
      expect(await page.getByTestId("tabbar-debug").innerText()).toContain("лечений 1");

      // Положение вернули — панель на месте, и сверка не находит в ней ничего
      await page.evaluate((sel) => {
        (document.querySelector(sel) as HTMLElement).style.transform = "";
      }, NAV);
      await expect.poll(async () => isShown(await snapshot(page), restTop)).toBe(true);
    });

    test("iOS (подмена признака WebKit): после листания слой освежается, панель на месте и не застревает", async ({ page }) => {
      // Chromium `-webkit-touch-callout` не знает, поэтому признак iOS подменён: хук идёт iOS-путём (освежает слой,
      // когда листание остановилось после смены состояния). Что освежение не ломает панель и не зацикливается —
      // проверяется здесь; что оно лечит зависание в настоящем Safari — нет, это проверяет владелец на iPhone
      await page.addInitScript(() => {
        localStorage.setItem("fhr-tabbar-debug", "1");
        const real = CSS.supports.bind(CSS);
        Object.defineProperty(CSS, "supports", {
          configurable: true,
          value: (...args: string[]) => (String(args[0]).includes("-webkit-touch-callout") ? true : real(...(args as [string, string]))),
        });
      });
      const restTop = await open(page, config.listPath);
      // На iOS правило @supports ещё и снимает переход панели: Chromium условия не выполняет, и без этой строки
      // тест был бы половиной iPhone (хук iOS, но плавный выезд). Теперь состояние то же, что на телефоне
      await page.addStyleTag({ content: "[data-bottom-tabs]{transition:none!important}" });
      const cdp = await page.context().newCDPSession(page);
      await expect(page.getByTestId("tabbar-debug")).toContainText("iOS: да");
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(SETTLE_MS + 400);
      const base = Number((/освежений (\d+)/.exec(await page.getByTestId("tabbar-debug").innerText()) ?? [])[1]);
      expect(Number.isFinite(base), "счётчик освежений показан").toBe(true);

      for (let i = 1; i <= 5; i++) {
        // Каждый круг начинается с одного и того же места: иначе пять кругов по 220 px упираются в конец короткой
        // страницы (на 390×844 клиентский список кончался на четвёртом круге), срабатывает край, и панель не прячется
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.waitForTimeout(80);
        await swipe(cdp, 220, 1600);
        const hidden = await snapshot(page);
        expect(hidden.hidden, `круг ${i}: спрятана`).toBe(true);
        expect(hidden.animations, `круг ${i}: перехода нет вовсе, как на iPhone`).toBe(0);
        expect(isOffscreen(hidden), `круг ${i}: за краем сразу, без промежуточных положений`).toBe(true);
        // Остановка листания возвращает панель и освежает слой, ровно один раз за круг
        await expect.poll(async () => isShown(await snapshot(page), restTop), { timeout: 4000 }).toBe(true);
        await expect(page.getByTestId("tabbar-debug")).toContainText(`освежений ${base + i}`);
        const shown = await snapshot(page);
        expect(shown.display, `круг ${i}: панель отрисована`).not.toBe("none");
        expect(shown.opacity).toBe(1);
        expect(await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).style.display, NAV), `круг ${i}: display возвращён`).toBe("");
      }
      const text = await page.getByTestId("tabbar-debug").innerText();
      expect(text).toContain("слой освежён (остановка прокрутки)");
      expect(text, "освежение не считается лечением: панель была на месте").toContain("лечений 0");
    });

    test("нажатие по месту панели, пока она спрятана, достигает страницы", async ({ page }) => {
      const restTop = await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      // Нажимаем сразу, пока панель ещё не вернулась по таймеру: ищем ссылку страницы в полосе, где панель стояла
      // Середина полосы: у углов панель скруглена, и там страница видна из-под неё и без всякого прятания.
      // Под полосой может оказаться промежуток между карточками — подкручиваем вниз (панель остаётся спрятанной)
      const findLink = (top: number) =>
        page.evaluate((restTop) => {
          for (let y = restTop + 20; y <= restTop + 36; y += 4) {
            for (let x = 100; x <= window.innerWidth - 100; x += 8) {
              const el = document.elementFromPoint(x, y);
              if (el?.closest("main a[href]")) return { x, y };
            }
          }
          return null;
        }, top);
      let target = await findLink(restTop);
      for (let i = 0; i < 8 && !target; i++) {
        await page.evaluate(() => window.scrollBy(0, 30));
        target = await findLink(restTop);
      }
      expect(target, "в полосе панели нашлась ссылка страницы").not.toBeNull();
      const here = new URL(page.url()).pathname + new URL(page.url()).search;
      await page.touchscreen.tap(target!.x, target!.y);
      await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search, { timeout: 15_000 }).not.toBe(here);
    });

    test("спрятанная панель не перехватывает нажатия сама по себе, даже если стоит на месте", async ({ page }) => {
      await open(page, config.listPath);
      const cdp = await page.context().newCDPSession(page);

      await swipe(cdp, 400);
      // Возвращаем спрятанную панель на место, не снимая метку: остаётся одно правило — pointer-events
      const hit = await page.evaluate((sel) => {
        const nav = document.querySelector(sel) as HTMLElement;
        nav.style.transition = "none";
        nav.style.transform = "none";
        const r = nav.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { hidden: nav.hasAttribute("data-hidden"), insideNav: !!el?.closest(sel), top: r.top };
      }, NAV);
      expect(hit.hidden, "метка на месте").toBe(true);
      expect(hit.top, "панель поставлена на своё место").toBeLessThan(667 - 56);
      expect(hit.insideNav, "нажатие в середину спрятанной панели достаёт до страницы").toBe(false);
    });
  });
}
