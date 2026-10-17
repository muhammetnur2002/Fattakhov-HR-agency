/**
 * Кабинет на телефоне и планшете: раскладка, которую нельзя сломать молча.
 *
 * Перенесено из CRM агентства (там — замеры 21–24.09.2026 на iPhone и iPad
 * по жалобам заказчика): страница вакансии уезжала вбок, доска кандидатов
 * была шириной в 4–5 экранов, разделы открывались только через бургер,
 * текст на телефоне был «огромным», кнопки — непропорциональны тексту.
 * Здесь — то, что их исключает. Корень 125% с 640px — как в CRM агентства
 * (с 03.10.2026), кроме кабинета на планшете пальцем: там корень 16px
 * и вся шкала — телефонная (см. app/globals.css).
 *
 * isMobile + hasTouch: браузер ведёт себя как телефон, и срабатывает
 * (pointer: coarse) — то самое условие, по которому меняются шкала текста
 * и цели касания. Жесты (долгое нажатие, свайп по доске) этим не проверить —
 * их подтверждает человек на устройстве. Внешний вид чекбокса на iOS — тоже:
 * дефект только в WebKit.
 */
import { expect, test, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

const VACANCY_ID = "vac_1";

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("страница вакансии не уезжает вбок, вместо доски — список по этапам", async ({ page }) => {
  await page.goto(`/a/vacancies/${VACANCY_ID}`);

  const stageTabs = page.getByRole("tablist", { name: "Этапы воронки" });
  await expect(stageTabs).toBeVisible();

  expect(await horizontalOverflow(page), "страница не должна прокручиваться по горизонтали").toBe(0);

  // Переключатель этапов — цели касания не меньше 40 точек
  const firstStage = stageTabs.getByRole("tab").first();
  const box = await firstStage.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40);
});

test("разделы — в нижней панели, одним касанием", async ({ page }) => {
  await page.goto("/a");

  const tabs = page.getByRole("navigation", { name: "Разделы" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Вакансии" })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "Ещё" })).toBeVisible();

  // Переход одним касанием и подсветка текущего раздела
  await tabs.getByRole("link", { name: "Вакансии" }).tap();
  await expect(page).toHaveURL(/\/a\/vacancies$/);
  await expect(tabs.getByRole("link", { name: "Вакансии" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

/*
  Не абсолютный пиксель — отношение высоты к кеглю (globals.css:
  min-height: 2.4em). 44, потом 40 были одним числом на кнопки с разным
  текстом, и жалоба («кнопка непропорциональна тексту») была именно про
  отношение. Кнопки оценки встречи (touch:size-10) — осознанное
  исключение со своим квадратом.
*/
test("кнопки на сенсорном экране — высота пропорциональна тексту", async ({ page }) => {
  await page.goto("/a/calendar");

  const { ratios, chips } = await page.evaluate(() => {
    // Чипы-фильтры («Все», «Ждут клиента», «Период») — не Button, а свой компонент с data-slot="filter-chip"; без них
    // в замере выпала бы именно та пилюля, на пропорцию которой жаловались трижды. Этапы воронки (data-tall) — навигация
    const measured = [...document.querySelectorAll("main [data-slot=button], main [data-slot=filter-chip]:not([data-tall])")]
      .filter((el) => !/\btouch:size-\d+\b/.test(el.className.toString()))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const fontSize = parseFloat(getComputedStyle(el).fontSize);
        return { el, r, ratio: r.height / fontSize };
      })
      .filter((x) => x.r.width > 1 && x.r.height > 1);
    return {
      ratios: measured.map((x) => Math.round(x.ratio * 100) / 100),
      chips: measured.filter((x) => x.el.getAttribute("data-slot") === "filter-chip").length,
    };
  });
  expect(ratios.length, "на странице должны быть кнопки — иначе тест ничего не проверяет").toBeGreaterThan(0);
  expect(chips, "в замер должны попасть чипы-фильтры («Период»)").toBeGreaterThan(0);
  for (const ratio of ratios) {
    expect(ratio, "высота кнопки относительно кегля вышла за 2.2–2.7").toBeGreaterThanOrEqual(2.2);
    expect(ratio, "высота кнопки относительно кегля вышла за 2.2–2.7").toBeLessThanOrEqual(2.7);
  }
});

/*
  Место под галочку занято у всех чипов (решение владельца, 16.10.2026): каждый невыбранный чип на 18 точек шире, чем
  был, и слева у него пустой слот. На телефоне ряд обязан это выдержать: чипы переносятся на следующую строку (ряд —
  `flex-wrap`), а не выходят за край и не уводят страницу вбок. Ряд этапов воронки (`role=tablist`) — исключение по
  замыслу: он прокручивается внутри себя. До правки на 320–390 страница вакансии на 320 точках и так была шире экрана
  на 37 точек из-за кнопок шапки — это не чипы, и проверка ряда чипов от неё не зависит.
*/
for (const width of [320, 375, 390]) {
  test(`чипы-фильтры на ${width}px: у каждого слот под галочку, ряд переносится и не выходит за край`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    // Аналитика рекрутёру отдаёт 404 (тесты идут под ним), поэтому здесь её нет: ряды «Период» — те же FilterChip
    for (const path of ["/a/clients", "/a/candidates", "/a/calendar"]) {
      await page.goto(path);
      // Календарь — клиентский компонент: ряд появляется после гидрации, а не вместе с загрузкой страницы
      await expect(page.locator('[data-slot="filter-chip-group"]').first()).toBeVisible();
      const groups = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="filter-chip-group"]')]
          .filter((g) => g.getBoundingClientRect().width > 0)
          .map((g) => {
            const gr = g.getBoundingClientRect();
            const chips = [...g.querySelectorAll('[data-slot="filter-chip"]')];
            return {
              label: g.getAttribute("aria-label"),
              chips: chips.length,
              noMark: chips.filter((c) => !(c.querySelector('[data-slot="filter-chip-mark"]')?.getBoundingClientRect().width ?? 0)).length,
              outside: chips
                .filter((c) => {
                  const r = c.getBoundingClientRect();
                  return r.right > gr.right + 0.5 || r.left < gr.left - 0.5;
                })
                .map((c) => (c.textContent ?? "").trim()),
            };
          }),
      );
      expect(groups.length, `${path}: на странице есть ряд чипов`).toBeGreaterThan(0);
      for (const g of groups) {
        expect(g.noMark, `${path}, «${g.label}»: у каждого чипа слот под галочку`).toBe(0);
        expect(g.outside, `${path}, «${g.label}»: чипы не выходят за край ряда`).toEqual([]);
      }
      expect(await horizontalOverflow(page), `${path}: страница не уезжает вбок на ${width}px`).toBe(0);
    }
  });
}

test("конец страницы не прячется под панель", async ({ page }) => {
  await page.goto("/a/vacancies");
  await page.waitForSelector("nav[data-bottom-tabs]");

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);

  const gap = await page.evaluate(() => {
    const bar = document.querySelector("nav[data-bottom-tabs]")!.getBoundingClientRect();
    const main = document.querySelector("main")!;
    let last: Element | null = main.lastElementChild;
    while (last && last.getBoundingClientRect().height === 0) last = last.previousElementSibling;
    return Math.round(bar.top - last!.getBoundingClientRect().bottom);
  });
  expect(gap, "между концом страницы и панелью должен быть зазор").toBeGreaterThan(0);
});

test("пока идёт ввод, панель уезжает вниз и не ловит нажатия", async ({ page }) => {
  await page.goto("/a/vacancies");
  await page.waitForSelector("nav[data-bottom-tabs]");

  const bar = page.locator("nav[data-bottom-tabs]");
  const viewportHeight = page.viewportSize()!.height;
  const top = () => bar.evaluate((el) => el.getBoundingClientRect().top);
  await expect(bar).toHaveCSS("opacity", "1");
  expect(await top(), "до ввода панель в окне").toBeLessThan(viewportHeight);

  await page.getByPlaceholder(/^Название, подразделение/).first().tap();
  // Прячет её только положение, прозрачность не участвует (в Safari она зависала на середине)
  await expect.poll(top).toBeGreaterThanOrEqual(viewportHeight);
  await expect(bar).toHaveCSS("opacity", "1");
  await expect(bar).toHaveCSS("pointer-events", "none");
});

/*
  Панель вкладок прячется при прокрутке вниз и возвращается (просьба владельца 17.10.2026) —
  tests/e2e/bottom-tabs-hide.spec.ts и client-bottom-tabs-hide.spec.ts. Прежнее тускнение
  (по просьбе 05.10.2026) убрано: панель почти исчезала и не появлялась обратно, люди нажимали
  по памяти. Здесь остаются раскладка и размеры панели в покое.
*/

for (const width of [320, 360, 390]) {
  test(`подписи вкладок целы и не слипаются на ширине ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/a/vacancies");
    await page.waitForSelector("nav[data-bottom-tabs]");

    const r = await page.evaluate(() => {
      const nav = document.querySelector("nav[data-bottom-tabs]")!;
      const items = [...nav.querySelectorAll(":scope > a, :scope > button")];
      const labels = items.map(
        (el) =>
          el.querySelector("span.truncate") ??
          [...el.querySelectorAll("span")].filter((s) => s.children.length === 0 && s.textContent?.trim()).pop()!,
      );
      const cut = labels.filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent);
      const rects = labels.map((l) => l.getBoundingClientRect());
      const gaps = rects.slice(1).map((b, i) => b.left - rects[i].right);
      const tab = items[0].getBoundingClientRect();
      return {
        cut,
        minGap: Math.min(...gaps),
        tabWidth: tab.width,
        tabHeight: tab.height,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(r.cut, "подписи не должны обрезаться").toEqual([]);
    expect(r.minGap, "подписи соседних вкладок не должны слипаться").toBeGreaterThanOrEqual(3);
    expect(r.tabWidth, "цель касания шире 44").toBeGreaterThanOrEqual(44);
    expect(r.tabHeight).toBeGreaterThanOrEqual(44);
    expect(r.overflow, "страница не уезжает вбок").toBe(0);
  });
}

test("шторка «Ещё» не повторяет вкладки и ведёт в остальные разделы", async ({ page }) => {
  await page.goto("/a");
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Ещё" }).tap();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const names = await sheet.getByRole("link").allInnerTexts();
  for (const tab of ["Дашборд", "Вакансии", "Кандидаты", "Сообщения"]) {
    expect(names.map((n) => n.trim()), `«${tab}» уже во вкладках`).not.toContain(tab);
  }
  await expect(sheet.getByRole("link", { name: "Календарь" })).toBeVisible();

  await sheet.getByRole("link", { name: "Календарь" }).tap();
  await expect(page).toHaveURL(/\/a\/calendar$/);
  // шторка закрылась сама после перехода
  await expect(sheet).not.toBeVisible();

  // Человек уже на другом разделе: фокус не возвращается на кнопку «Ещё» в панели (замечание проверки к PR #119) —
  // иначе клавиатура и читалка остались бы в нижней панели, а Next ставит фокус на новой странице сам
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup"))).not.toBe("dialog");
});

test("шторка «Ещё» закрыта клавишей Escape — фокус возвращается на кнопку «Ещё»", async ({ page }) => {
  await page.goto("/a");
  const more = page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Ещё" });
  await more.tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
});

/*
  Шкала текста (app/globals.css). Увеличенная шкала кабинета на телефоне
  давала средний размер 15,2px и заголовки по 30px — «огромно». Ниже 640px
  и на планшете пальцем — стандартная шкала Tailwind, с мышью от 640px
  и на любом экране от 1024px — увеличенная. Поля ввода при этом обязаны
  остаться 16px: меньше — и iOS увеличивает страницу при фокусе.
*/
test("на телефоне заголовок 24px, основной текст 14px, подписи 12px", async ({ page }) => {
  await page.goto("/a/vacancies");
  await page.waitForSelector("nav[data-bottom-tabs]");

  const sizes = await page.evaluate(() => {
    const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    return {
      h1: px(document.querySelector("main h1")),
      body: px(document.querySelector("main p.text-sm, main .text-sm")),
      caption: px(document.querySelector("main .text-xs")),
    };
  });
  expect(sizes.h1).toBe(24);
  expect(sizes.body).toBe(14);
  expect(sizes.caption).toBe(12);
});

for (const path of ["/a/candidates/new", "/a/settings", "/a/vacancies"]) {
  test(`поля ввода на ${path} не мельче 16px — иначе iOS увеличит страницу`, async ({ page }) => {
    await page.goto(path);
    await page.waitForSelector("nav[data-bottom-tabs]");
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea")]
        .filter((el) => el.getBoundingClientRect().width > 4 && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => (el as HTMLInputElement).name || el.tagName),
    );
    expect(tooSmall).toEqual([]);
  });
}

/*
  Карточка вакансии (components/vacancies/vacancy-list.tsx). Была одна
  flex-строка с переносом на всех ширинах ниже xl — на телефоне почти
  ничего не помещалось рядом, и то, что переносилось, сохраняло свой
  text-right: вилка и число кандидатов повисали по центру карточки.
  Теперь ниже xl — четыре строки: номер+название, место+срочность,
  вилка слева/кандидаты справа, статус.
*/
test("карточка вакансии на телефоне — четыре строки, не вразброс", async ({ page }) => {
  await page.goto("/a/vacancies");
  expect(await horizontalOverflow(page), "страница не должна прокручиваться по горизонтали").toBe(0);

  const card = await page.evaluate(() => {
    const link = [...document.querySelectorAll("main a")].find((a) => a.textContent?.includes("Маркетолог"));
    if (!link) return null;
    const rows = [...link.querySelectorAll(".xl\\:hidden > *")];
    return rows.map((r) => r.textContent?.trim());
  });
  expect(card).not.toBeNull();
  expect(card!.length).toBe(4);
  expect(card![0]).toContain("Маркетолог");
  expect(card![1]).toContain("Не горит");
  expect(card![2]).toContain("Кандидатов нет");
  expect(card![3]).toContain("Черновик");
});

test("плитки дашборда — в две колонки, числа на одной линии", async ({ page }) => {
  await page.goto("/a");
  await page.waitForSelector("nav[data-bottom-tabs]");
  await page.waitForTimeout(800); // счётчики досчитываются

  const r = await page.evaluate(() => {
    const row = document.querySelector("main .grid.overflow-hidden.rounded-xl")!;
    const tiles = [...row.querySelectorAll(":scope > div > *")];
    const lefts = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left)));
    const byRow: Record<number, number[]> = {};
    for (const t of tiles) {
      const y = Math.round(t.getBoundingClientRect().top);
      (byRow[y] ||= []).push(Math.round(t.children[1].getBoundingClientRect().top));
    }
    return {
      columns: lefts.size,
      misaligned: Object.values(byRow).filter((a) => new Set(a).size > 1).length,
    };
  });
  expect(r.columns).toBe(2);
  expect(r.misaligned, "числа в одном ряду плиток на одной линии").toBe(0);
});

/*
  Переписка на телефоне — экран во весь рост, и нижняя панель с ним
  уживается двумя способами (components/messages/messages-shell.tsx):
  список кончается над панелью, открытый диалог панель убирает
  (как в мессенджерах), а страница вокруг не прокручивается ни там,
  ни там — иначе вместе со списком уезжала бы и шапка.
*/
test.describe("переписка на телефоне и нижняя панель", () => {
  test.use({ storageState: "tests/e2e/.auth/owner.json" });

  const geometry = (page: Page) =>
    page.evaluate(() => {
      const shell = [...document.querySelectorAll("main div")].find((d) =>
        d.className.toString().includes("md:rounded-3xl"),
      )!;
      const bar = document.querySelector("nav[data-bottom-tabs]")!;
      const s = shell.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return {
        pageScroll: document.documentElement.scrollHeight - innerHeight,
        shellBottom: Math.round(s.bottom),
        barTop: Math.round(b.top),
        barOpacity: getComputedStyle(bar).opacity,
        barPointerEvents: getComputedStyle(bar).pointerEvents,
        innerHeight,
      };
    });

  test("список диалогов кончается над панелью, страница — в один экран", async ({ page }) => {
    await page.goto("/a/messages");
    await page.waitForSelector("nav[data-bottom-tabs]");
    const g = await geometry(page);
    expect(g.pageScroll, "страница вокруг переписки не прокручивается").toBeLessThanOrEqual(0);
    expect(g.barOpacity).toBe("1");
    expect(g.barTop - g.shellBottom, "список не уходит под панель").toBeGreaterThanOrEqual(0);
    expect(g.barTop - g.shellBottom, "и не висит высоко над ней").toBeLessThanOrEqual(16);
  });

  test("открытый диалог убирает панель и доходит до низа экрана", async ({ page }) => {
    await page.goto("/a/messages/usr_cl_admin");
    await page.waitForSelector("nav[data-bottom-tabs]");
    await page.waitForTimeout(300); // панель уезжает с переходом 200 мс
    const g = await geometry(page);
    expect(g.pageScroll, "страница вокруг переписки не прокручивается").toBeLessThanOrEqual(0);
    // Панель убрана за нижний край окна целиком, а не погашена: прозрачность не участвует
    // (в Safari на iPhone она зависала на середине, lib/hooks/use-tabbar-visibility.ts)
    expect(g.barTop, "панель за нижним краем окна").toBeGreaterThanOrEqual(g.innerHeight);
    expect(g.barOpacity).toBe("1");
    expect(g.barPointerEvents).toBe("none");
    expect(g.shellBottom).toBe(g.innerHeight);
    await expect(page.getByRole("link", { name: "К списку диалогов" })).toBeVisible();
  });
});

/*
  Аналитика агентства открыта только владельцу и руководителю подбора:
  рекрутёру она отдаёт 404, а тесты по умолчанию идут под рекрутёром.
*/
test.describe("аналитика на телефоне", () => {
  test.use({ storageState: "tests/e2e/.auth/owner.json" });

  test("аналитика: показатели рекрутёра видны целиком, без прокрутки вбок", async ({ page }) => {
    await page.goto("/a/analytics");
    await page.waitForSelector("nav[data-bottom-tabs]");

    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const labels = [...document.querySelectorAll("main dt")].filter((el) => el.getBoundingClientRect().width > 0);
      const seen = new Set(labels.map((el) => el.textContent?.trim()));
      const outside = labels.filter((el) => el.getBoundingClientRect().right > vw).length;
      const scrollers = [...document.querySelectorAll("main *")].filter(
        (el) =>
          ["auto", "scroll"].includes(getComputedStyle(el).overflowX) &&
          el.scrollWidth > el.clientWidth + 8 &&
          el.getBoundingClientRect().height > 20,
      ).length;
      return { seen: [...seen], outside, scrollers };
    });
    for (const label of ["Вакансий", "В работе", "Представил", "Качество"]) {
      expect(r.seen, `показатель «${label}» виден на телефоне`).toContain(label);
    }
    expect(r.outside).toBe(0);
    expect(r.scrollers, "на странице нет областей с прокруткой вбок").toBe(0);
  });
});

test("оценка встречи: все пять кнопок в карточке, последняя не срезана", async ({ page }) => {
  await page.goto("/a/calendar");
  await page.waitForSelector("nav[data-bottom-tabs]");
  const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("main form button")].filter((b) => /^[1-5]$/.test(b.textContent?.trim() ?? ""));
    const vw = document.documentElement.clientWidth;
    return { n: btns.length, outside: btns.filter((b) => b.getBoundingClientRect().right > vw - 4).length };
  });
  test.skip(r.n === 0, "в тестовых данных нет прошедшей встречи без оценки");
  expect(r.outside).toBe(0);
});

/*
  Какая навигация на какой ширине: телефон — нижняя панель, планшет —
  узкая панель иконок, компьютер — полный сайдбар. Бургера нет нигде.
*/
const NAV_CASES = [
  { width: 375, height: 812, touch: true, expected: "tabs" },
  { width: 768, height: 1024, touch: true, expected: "rail" },
  { width: 1024, height: 768, touch: false, expected: "rail" },
  { width: 1440, height: 900, touch: false, expected: "sidebar" },
] as const;

for (const c of NAV_CASES) {
  test.describe(`навигация на ширине ${c.width}`, () => {
    test.use({ viewport: { width: c.width, height: c.height }, isMobile: c.touch, hasTouch: c.touch });

    test(`видна только ${c.expected === "tabs" ? "нижняя панель" : c.expected === "rail" ? "панель иконок" : "боковое меню"}, страница не уезжает вбок`, async ({ page }) => {
      for (const path of ["/a", "/a/vacancies", `/a/vacancies/${VACANCY_ID}`, "/a/candidates", "/a/calendar"]) {
        await page.goto(path);
        const r = await page.evaluate(() => {
          const visible = (el: Element | null | undefined) =>
            !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== "none";
          const asides = [...document.querySelectorAll(".cabinet-shell > aside")];
          return {
            tabs: visible(document.querySelector("nav[data-bottom-tabs]")),
            rail: visible(asides.find((a) => a.getAttribute("data-slot") === "icon-rail")),
            sidebar: visible(asides.find((a) => a.classList.contains("w-60"))),
            burger: !!document.querySelector('[aria-label="Открыть меню"]'),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        expect(r.tabs, `${path}: нижняя панель`).toBe(c.expected === "tabs");
        expect(r.rail, `${path}: панель иконок`).toBe(c.expected === "rail");
        expect(r.sidebar, `${path}: боковое меню`).toBe(c.expected === "sidebar");
        expect(r.burger, `${path}: бургера больше нет`).toBe(false);
        expect(r.overflow, `${path}: страница не уезжает вбок`).toBe(0);
      }
    });
  });
}

test("кабинет — во весь экран (viewport-fit=cover), страница входа — нет", async ({ page }) => {
  await page.goto("/a");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});

test.describe("страница входа без выреза", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("на /login viewport-fit не ставится", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute("content", /viewport-fit/);
  });
});

/*
  Планшет пальцем. Заказчик отметила «огромный» текст и там — не только
  на телефоне. Граница — по ширине И способу ввода: iPad с трекпадом
  (pointer: fine) держит ту же шкалу, что ноутбук; iPad пальцем (pointer:
  coarse), 640–1023px, — стандартную, как телефон.

  Отдельный риск — поле ввода: у Input/Textarea есть `md:text-sm`
  (заготовка shadcn, «md» подразумевал мышь), и на iPad пальцем это
  ровно тот случай, где предположение неверно.
*/
test.describe("планшет пальцем — та же стандартная шкала, что телефон", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false });

  test("заголовок и текст — как на телефоне, не как на ноутбуке", async ({ page }) => {
    await page.goto("/a/vacancies");
    const sizes = await page.evaluate(() => {
      const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        h1: px(document.querySelector("main h1")),
        caption: px(document.querySelector("main .text-xs")),
      };
    });
    expect(sizes.coarse, "эмуляция должна дать pointer: coarse").toBe(true);
    expect(sizes.h1).toBe(24);
    expect(sizes.caption).toBe(12);
  });

  test("поле поиска остаётся 16px, несмотря на md:text-sm", async ({ page }) => {
    await page.goto("/a/vacancies");
    const fontSize = await page.evaluate(() => {
      const el = document.querySelector('main input[placeholder*="Название"]');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
    expect(fontSize).toBe(16);
  });

  // На /a/vacancies — кнопки и поля, на /a/clients — ещё и чипы-фильтры «Все · Лиды · Активные»
  for (const path of ["/a/vacancies", "/a/clients"]) {
    test(`кнопки, чипы и поля на ${path} пропорциональны тексту, как на телефоне`, async ({ page }) => {
      await page.goto(path);
      const { ratios, chips } = await page.evaluate(() => {
        const measured = [
          ...document.querySelectorAll(
            "main [data-slot=button], main [data-slot=filter-chip]:not([data-tall]), main [data-slot=input], main [data-slot=select-trigger]",
          ),
        ]
          .filter((el) => !/\btouch:size-\d+\b/.test(el.className.toString()))
          .map((el) => {
            const r = el.getBoundingClientRect();
            const fontSize = parseFloat(getComputedStyle(el).fontSize);
            return { el, r, ratio: r.height / fontSize };
          })
          .filter((x) => x.r.width > 1 && x.r.height > 1);
        return {
          ratios: measured.map((x) => Math.round(x.ratio * 100) / 100),
          chips: measured.filter((x) => x.el.getAttribute("data-slot") === "filter-chip").length,
        };
      });
      expect(ratios.length, "на странице должны быть кнопки и поля — иначе тест ничего не проверяет").toBeGreaterThan(0);
      if (path === "/a/clients") expect(chips, "в замер должны попасть чипы-фильтры").toBeGreaterThan(0);
      for (const ratio of ratios) {
        expect(ratio, "высота относительно кегля вышла за 2.2–2.7").toBeGreaterThanOrEqual(2.2);
        expect(ratio, "высота относительно кегля вышла за 2.2–2.7").toBeLessThanOrEqual(2.7);
      }
    });
  }
});

/*
  Корень 125% с 640px (app/globals.css) — кроме кабинета на планшете
  пальцем: там корень остаётся 16px, и шкала, отступы и размеры
  компонентов те же, что на телефоне, без пересчёта --text-* и --spacing
  от 20px, как приходилось в CRM агентства. Проба с классом h-8
  (calc(var(--spacing) * 8)) на пустом элементе: 32px на планшете
  пальцем, 40px на ноутбуке.
*/
for (const c of [
  { name: "планшет пальцем", viewport: { width: 820, height: 1180 }, hasTouch: true, root: 16, h8: 32 },
  { name: "ноутбук", viewport: { width: 1280, height: 800 }, hasTouch: false, root: 20, h8: 40 },
]) {
  test.describe(`корень кабинета: ${c.name}`, () => {
    test.use({ viewport: c.viewport, hasTouch: c.hasTouch, isMobile: false });

    test(`корень ${c.root}px, h-8 даёт ${c.h8}px`, async ({ page }) => {
      await page.goto("/a/vacancies");
      const r = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.className = "h-8";
        document.querySelector(".cabinet-shell")!.appendChild(probe);
        const h = probe.getBoundingClientRect().height;
        probe.remove();
        return { h8: h, root: parseFloat(getComputedStyle(document.documentElement).fontSize) };
      });
      expect(r.root).toBe(c.root);
      expect(r.h8).toBe(c.h8);
    });
  });
}

test.describe("планшет с трекпадом и широкий экран — увеличенная шкала", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: false, isMobile: false });

  test("iPad с трекпадом ведёт себя как ноутбук, не как телефон", async ({ page }) => {
    await page.goto("/a/vacancies");
    const sizes = await page.evaluate(() => ({
      coarse: matchMedia("(pointer: coarse)").matches,
      h1: parseFloat(getComputedStyle(document.querySelector("main h1")!).fontSize),
      body: parseFloat(getComputedStyle(document.querySelector("main .text-sm")!).fontSize),
    }));
    expect(sizes.coarse).toBe(false);
    // Увеличенная шкала (30/16 от 16px) на корне 125%
    expect(sizes.h1).toBe(37.5);
    expect(sizes.body).toBe(20);
  });

  test("на широком экране шкала остаётся увеличенной", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/a/vacancies");
    const h1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("main h1")!).fontSize));
    expect(h1).toBe(37.5);
  });
});

/*
  Печать: у неё нет указателя (pointer: none), и без отдельного условия
  в globals.css отчёт, напечатанный из кабинета, вышел бы по стандартной
  шкале — мельче, чем печатался до разделения шкал. Планшет пальцем здесь
  нарочно: экранная шкала на нём стандартная, а печать — нет. Корень 125%
  на печать не действует (только screen) — отчёт печатается прежним
  размером, а не на четверть крупнее.
*/
test.describe("печать из кабинета", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false });

  test("на печать — увеличенная шкала, как была", async ({ page }) => {
    await page.goto("/a/vacancies");
    await page.emulateMedia({ media: "print" });
    const h1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("main h1")!).fontSize));
    expect(h1).toBe(30);
  });
});

/*
  Отступ внутри карточки (components/ui/card.tsx) — третья жалоба на тот
  же зазор подряд, после кнопок и чекбокса: --card-spacing 16px → 12px
  только на сенсорном экране, мышь не тронута.
*/
test("отступ внутри карточки — 12px на сенсорном экране", async ({ page }) => {
  await page.goto("/a/candidates");
  const spacing = await page.evaluate(() => {
    const card = document.querySelector('[data-slot="card"]') as HTMLElement;
    return { coarse: matchMedia("(pointer: coarse)").matches, paddingTop: getComputedStyle(card).paddingTop };
  });
  expect(spacing.coarse).toBe(true);
  expect(spacing.paddingTop).toBe("12px");
});

test.describe("отступ внутри карточки на мыши — не тронут", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  // 1rem, то есть 20px на корне 125%: правило для сенсорного экрана мышь не трогает
  test("на ноутбуке карточка — 20px, правилом не тронута", async ({ page }) => {
    await page.goto("/a/candidates");
    const spacing = await page.evaluate(() => {
      const card = document.querySelector('[data-slot="card"]') as HTMLElement;
      return { coarse: matchMedia("(pointer: coarse)").matches, paddingTop: getComputedStyle(card).paddingTop };
    });
    expect(spacing.coarse).toBe(false);
    expect(spacing.paddingTop).toBe("20px");
  });
});

/*
  Сырой <input type="checkbox">. Дефект чисто в WebKit на iOS, показать
  его этим тестом нельзя. Тест проверяет, что правило подключено — страховка
  от того, что кто-то уберёт appearance: none и баг незаметно вернётся.
  С 11.10.2026 правило действует и на мыши (см. блок ниже): вид один.
*/
test.describe("сырой чекбокс на сенсорном экране", () => {
  // /register уводит вошедшего в кабинет — здесь нужен анонимный контекст
  test.use({ storageState: { cookies: [], origins: [] } });

  test("appearance: none, 16×16, без нативной рамки", async ({ page }) => {
    await page.goto("/register");
    const cb = await page.evaluate(() => {
      const el = document.querySelector('input[name="consent"]') as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        appearance: cs.appearance,
        width: cs.width,
        height: cs.height,
      };
    });
    expect(cb.coarse).toBe(true);
    expect(cb.appearance).toBe("none");
    expect(cb.width).toBe("16px");
    expect(cb.height).toBe("16px");
  });
});

test("галочки в кабинете на сенсорном экране — тоже своя раскраска", async ({ page }) => {
  await page.goto("/a/settings");
  const appearances = await page.evaluate(() =>
    [...document.querySelectorAll('main input[type="checkbox"]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => getComputedStyle(el).appearance),
  );
  expect(appearances.length, "в настройках уведомлений есть галочки").toBeGreaterThan(0);
  expect(new Set(appearances)).toEqual(new Set(["none"]));
});

test.describe("сырой чекбокс на мыши — тот же вид, что и пальцем", () => {
  // 11.10.2026: правило больше не ограничено `pointer: coarse`. Раньше на мыши оставался системный
  // квадрат браузера рядом со своими галочками обёртки shadcn; теперь вид один (аудит, states-15)
  test.use({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    storageState: { cookies: [], origins: [] },
  });

  test("на ноутбуке чекбокс тоже без системной отрисовки: appearance none, рамка 1px, скругление 4px", async ({ page }) => {
    await page.goto("/register");
    const cb = await page.evaluate(() => {
      const el = document.querySelector('input[name="consent"]') as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        appearance: cs.appearance,
        border: cs.borderTopWidth,
        radius: cs.borderTopLeftRadius,
      };
    });
    expect(cb.coarse).toBe(false);
    expect(cb.appearance).toBe("none");
    expect(cb.border).toBe("1px");
    expect(cb.radius).toBe("4px");
  });

  test("отмеченный чекбокс заливается основным цветом, а галочка — залитый многоугольник, не картинка", async ({ page }) => {
    await page.goto("/register");
    const box = page.locator('input[name="consent"]');
    await box.check();
    const after = await box.evaluate((el) => {
      const cs = getComputedStyle(el);
      const tick = getComputedStyle(el, "::after");
      return { bg: cs.backgroundColor, tick: tick.content, tickBg: tick.backgroundColor, clip: tick.clipPath };
    });
    expect(after.bg).toBe("rgb(84, 110, 136)");
    expect(after.tick).not.toBe("none");
    expect(after.tickBg).toBe("rgb(248, 248, 248)");
    expect(after.clip).toContain("polygon");
  });
});
