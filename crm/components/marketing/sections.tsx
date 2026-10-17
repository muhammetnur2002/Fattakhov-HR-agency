import { Logo } from "@/components/brand/logo";
import {
  CountUp,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/motion/primitives";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { FAQ_ITEMS } from "@/lib/marketing/faq";
import { SECTION_HEAD_GAP, SITE_CONTAINER, SPLIT_EVEN, SPLIT_MAIN } from "./layout";
import { LogoAssembly } from "./logo-assembly";
import { RibbedTexture } from "./texture";

/**
 * Заголовок раздела.
 *
 * Надзаголовок называет тему словами, а не нумерует её: «01 / МОДЕЛЬ»
 * ничего не сообщает, кроме того, что кто-то умеет считать. Подзаголовок
 * идёт под заголовком, а не отдельным абзацем в углу.
 *
 * Надзаголовок необязателен, и это не мелочь: когда он стоит над каждым
 * без исключения разделом, страница читается сплошной лентой одинаковых
 * шапок. Выравнивание по центру тоже не украшение, а способ сбить ритм
 * там, где раздел короткий и живёт сам по себе.
 *
 * Интервал до содержимого ставит сам заголовок (`SECTION_HEAD_GAP`, 50px на ноутбуке),
 * поэтому у содержимого сразу под ним нет своего `mt-*`: раньше каждый компонент писал
 * его по-своему — 50px на главной, 30 на тарифах, аудите и кейсах (11.10.2026).
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "light",
  align = "left",
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  tone?: "light" | "dark";
  align?: "left" | "center";
  /** h1 — у страницы, где другого заголовка верхнего уровня нет (политика). */
  as?: "h1" | "h2";
}) {
  const dark = tone === "dark";
  const center = align === "center";

  return (
    <Reveal
      className={`${SECTION_HEAD_GAP} ${center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}`}
    >
      {eyebrow && (
        <div
          className={
            dark
              ? "text-sm font-medium tracking-[0.14em] text-white/65 uppercase"
              : "text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase"
          }
        >
          {eyebrow}
        </div>
      )}
      <Heading
        className={`text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl ${
          eyebrow ? "mt-4" : ""
        } ${dark ? "text-white" : "text-foreground"}`}
      >
        {title}
      </Heading>
      {lead && (
        <p
          className={`mt-4 text-lg leading-relaxed ${
            center ? "mx-auto max-w-2xl" : ""
          } ${dark ? "text-white/70" : "text-muted-foreground"}`}
        >
          {lead}
        </p>
      )}
    </Reveal>
  );
}

/**
 * Раздел страницы.
 *
 * Тон фона и ширина колонки меняются от раздела к разделу намеренно: двенадцать блоков
 * одной формы читаются сплошной лентой, и глазу не за что зацепиться. Вертикальный шаг —
 * нет: он один (`py-8 md:py-10`), и пустые «паузы» между разделами выбирают не разработчики
 * вручную, а тон и ширина. Сверка 11.10.2026: три отступа (`tight`, `normal`, `tall`) отличались
 * на 10px, каждая страница выбирала их по вкусу, и ритм читался как случайный.
 *
 * `pad="tight"` — единственное исключение: раздел, внутри которого лежит одна карточка с
 * собственным отступом (призыв к аудиту, блок студентов): там воздух уже даёт сама карточка.
 * Новое исключение вписывается в `tests/site-rhythm.test.ts` с причиной.
 *
 * Левый край содержимого лежит на оси шапки (`SITE_CONTAINER`); `width="narrow"` — колонка
 * для чтения: по центру, на ту же ось не встаёт.
 */
export function Section({
  id,
  children,
  tone = "light",
  width = "normal",
  pad = "normal",
}: {
  id?: string;
  children: React.ReactNode;
  tone?: "light" | "muted" | "dark";
  width?: "narrow" | "normal";
  pad?: "normal" | "tight";
}) {
  const bg =
    tone === "dark"
      ? "bg-brand-graphite text-white"
      : tone === "muted"
        ? "bg-muted/45"
        : "bg-background";

  const column =
    width === "narrow" ? "mx-auto max-w-3xl px-5" : SITE_CONTAINER;

  const padding = pad === "tight" ? "py-8" : "py-8 md:py-10";

  /* overflow-clip, а не hidden: hidden делает раздел своим контейнером прокрутки,
     и прилипшая внутри полоса (полоса прогресса аудита) ломается — она «прилипает»
     к разделу, а не к экрану. clip режет так же, но прокрутки не создаёт */
  return (
    <section id={id} className={`relative overflow-clip ${bg}`}>
      {tone === "dark" && (
        <RibbedTexture className="opacity-20" />
      )}
      <div className={`relative ${column} ${padding}`}>{children}</div>
    </section>
  );
}

/**
 * Полоса ключевых цифр. Отдельным блоком, а не внутри первого экрана.
 *
 * Без разделителей между колонками: четыре коротких пары «число —
 * подпись» и так читаются отдельными группами, а вертикальные линии
 * превращали полосу в таблицу, которой здесь нечего показывать.
 */
export function Facts() {
  // Досчитывается только то, что действительно число. «fixed» и «2-5»
  // счётчиком не изобразить, и подделывать это анимацией было бы враньём
  const facts = [
    { value: "2-5", label: "активных вакансий", count: null },
    { value: "30+", label: "источников поиска", count: 30, suffix: "+" },
    { value: "1 раз", label: "отчёт каждую неделю", count: null },
    { value: "fixed", label: "стоимость в месяц", count: null },
  ];

  return (
    <div className="border-y bg-card">
      {/* Ось сайта — тот же `SITE_CONTAINER`, что у шапки и разделов. Ячейкам нужен свой отступ
          `px-5`, и сетка шире контейнера ровно на него (`-mx-5`): два отступа гасят друг друга, поэтому
          левый край цифр равен полю сайта при любом его значении. Раньше здесь лежала копия поля
          (`md:px-3 xl:px-9` плюс `px-5`), которая совпадала с ним только по сумме и съехала бы при правке */}
      <div className={SITE_CONTAINER}>
        <Stagger className="-mx-5 grid grid-cols-2 gap-y-2 lg:grid-cols-4">
          {facts.map((f) => (
            <StaggerItem key={f.label} className="px-5 py-5">
              <div className="text-4xl font-semibold tracking-tight tabular-nums">
                {f.count === null ? (
                  f.value
                ) : (
                  <>
                    <CountUp value={f.count} />
                    {f.suffix}
                  </>
                )}
              </div>
              <div className="mt-1.5 text-base text-muted-foreground">
                {f.label}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  );
}

/**
 * Сетка из трёх поводов.
 *
 * Не три одинаковые карточки в ряд: одинаковые карточки читаются как
 * список, в котором нечего выбирать. Здесь это пронумерованные тезисы
 * на волосяных линиях, вес держит заголовок.
 */
export function WhenSubscription() {
  const items = [
    {
      title: "Одновременно открыты 2-5 вакансий",
      body: "План найма регулярный, но отдельный рекрутер пока не нужен или уже перегружен.",
    },
    {
      title: "Найм тормозит рост бизнеса",
      body: "Руководители сами смотрят резюме, встречи срываются, позиции остаются без движения.",
    },
    {
      title: "Нужен управляемый процесс",
      body: "Важно видеть воронку, сроки и причины отказов, а не просто получать пачку резюме.",
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="bg-card p-6">
          <div className="text-lg font-medium">{it.title}</div>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {it.body}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Четыре шага.
 *
 * Подпись у шага это его собственное имя, а не «Этап 1». Слева
 * вертикальная линия, повторяющая рёбра знака: она и связывает шаги
 * в последовательность, и не требует ни стрелок, ни номеров-украшений.
 *
 * Точек на линии нет намеренно. Линия уже показывает последовательность,
 * а точки добавляли ей собственный ритм — четыре отметки на пустой
 * вертикали читались как украшение, а не как часть шагов.
 *
 * Справа от шагов на широком экране (от 1024px) знак собирается из кусков
 * по мере прокрутки раздела (`LogoAssembly`): пустая половина тёмного раздела
 * работает на бренд, а не пропадает. На телефоне блока нет, шаги идут как были.
 */
export function HowItWorks() {
  const steps = [
    {
      name: "Диагностика",
      title: "Собираем план найма",
      body: "Разбираем роли, приоритеты, экономику и ограничения. Если подписка невыгодна, говорим об этом сразу.",
    },
    {
      name: "Запуск",
      title: "Встраиваем команду",
      body: "Фиксируем профиль, каналы поиска, этапы отбора и скорость обратной связи. Запускаем активные слоты.",
    },
    {
      name: "Работа",
      title: "Ведём всю воронку",
      body: "Ищем, проводим первичные интервью, координируем встречи и сопровождаем кандидатов до выхода.",
    },
    {
      name: "Контроль",
      title: "Даём ясную картину",
      body: "Каждую неделю показываем цифры, статусы, барьеры рынка и конкретные следующие действия.",
    },
  ];

  return (
    <div className={SPLIT_EVEN}>
      <ol className="space-y-0 border-l border-white/15 pl-6 md:pl-8">
        {steps.map((s) => (
          <li key={s.name} className="pb-10 last:pb-0">
            <div className="text-sm font-medium tracking-[0.12em] text-white/65 uppercase">
              {s.name}
            </div>
            <div className="mt-2 text-2xl font-medium text-white">{s.title}</div>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/65">
              {s.body}
            </p>
          </li>
        ))}
      </ol>
      <LogoAssembly />
    </div>
  );
}

/** Зона ответственности команды. Простой перечень, без иконок-заглушек. */
export function Responsibility() {
  const items = [
    "Профиль вакансии и стратегия поиска",
    "Сорсинг и первичные интервью",
    "Координация встреч и обратной связи",
    "Сопровождение кандидата до выхода",
    "Аналитика рынка и еженедельный отчёт",
  ];

  return (
    <div className={SPLIT_MAIN}>
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it} className="py-3 text-lg">
            {it}
          </li>
        ))}
      </ul>
      <div className="hidden items-start lg:flex">
        <Logo variant="mark" decorative className="h-36 opacity-[0.07]" />
      </div>
    </div>
  );
}

/**
 * Кейсы.
 *
 * Без придуманных цифр: на сайте сознательно нет ни сроков, ни числа
 * закрытий, потому что подтверждённых данных пока нет. Вместо них
 * задача и результат словами, и это честнее, чем «закрываем за 14 дней».
 *
 * Имя клиента — h3 под h2 раздела (на главной). На странице /cases раздела с
 * заголовком нет: сразу под h1 идут сами кейсы, и h3 там пропускал уровень
 * (h1 → h3, проверка сайта 11.10.2026). Поэтому страница передаёт `headingAs="h2"`:
 * кейс — раздел страницы. Размер шрифта от уровня не зависит, он в классах.
 */
export function Cases({ headingAs: Heading = "h3" }: { headingAs?: "h2" | "h3" } = {}) {
  const cases = [
    {
      kind: "IT-компания",
      name: "Starfish",
      subtitle: "Регулярный подбор специалистов для технологичной команды",
      task: "Клиенту важно было закрывать не только классические позиции, но и роли на стыке аналитики, инженерии и работы с ИИ.",
      result:
        "Агентство подключалось к разным задачам найма, закрывало сложные роли и сохранило доверие клиента для повторного сотрудничества.",
      roles: ["Системный аналитик", "Инженер", "ИИ-специалисты"],
      takeaway: "Клиент возвращается при новых задачах найма",
    },
    {
      kind: "Мультибизнес",
      name: "Проекты Вячеслава",
      subtitle: "Подбор людей под разные бизнес-направления",
      task: "В одном контуре требовались разные типы сотрудников: от операционных ролей до управленцев и кандидатов для инвестиционного направления.",
      result:
        "Команда помогала закрывать позиции в нескольких проектах и дополняла подбор оценкой кандидатов, когда важно было понять подход человека к роли.",
      roles: [
        "Менеджеры",
        "Администраторы",
        "Руководители",
        "Оценка кандидатов",
      ],
      takeaway: "Подбор идёт под бизнес-задачу, а не под шаблон вакансии",
    },
  ];

  return (
    <div className="space-y-5">
      {cases.map((c, i) => {
        // Первый кейс на графите: два одинаковых светлых прямоугольника
        // подряд читаются как таблица, а это витрина
        const тёмный = i === 0;

        return (
          <Reveal key={c.name} delay={i * 0.06}>
            <article
              className={`${SPLIT_EVEN} overflow-hidden rounded-2xl p-6 md:p-8 ${
                тёмный ? "border border-white/25 bg-brand-graphite text-white" : "border bg-card"
              }`}
            >
              <div>
                <div
                  className={`text-sm font-medium tracking-[0.12em] uppercase ${
                    тёмный ? "text-white/60" : "text-muted-foreground"
                  }`}
                >
                  {c.kind}
                </div>

                {/* Крупно: имя клиента здесь работает как доказательство,
                    и мелким кеглем его никто не заметит. Но не крупнее h2 раздела
                    (28 на телефоне, 45 на ноутбуке): было text-4xl — 36 при h2 28 */}
                <Heading className="mt-3 text-3xl leading-[1.05] font-semibold tracking-tight text-balance md:text-4xl">
                  {c.name}
                </Heading>
                <p
                  className={`mt-4 text-lg leading-relaxed ${
                    тёмный ? "text-white/70" : "text-muted-foreground"
                  }`}
                >
                  {c.subtitle}
                </p>

                <div className="mt-7 flex flex-wrap gap-1.5">
                  {c.roles.map((r) => (
                    <span
                      key={r}
                      className={`rounded-md px-3 py-1 text-sm ${
                        тёмный
                          ? "bg-white/12 text-white"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <dl className="space-y-6">
                  <div>
                    <dt
                      className={`text-sm font-medium tracking-[0.12em] uppercase ${
                        тёмный ? "text-white/60" : "text-muted-foreground"
                      }`}
                    >
                      Задача
                    </dt>
                    <dd className="mt-2 text-lg leading-relaxed">{c.task}</dd>
                  </div>
                  <div>
                    <dt
                      className={`text-sm font-medium tracking-[0.12em] uppercase ${
                        тёмный ? "text-white/60" : "text-muted-foreground"
                      }`}
                    >
                      Результат
                    </dt>
                    <dd className="mt-2 text-lg leading-relaxed">{c.result}</dd>
                  </div>
                </dl>

                <p
                  className={`mt-6 border-t pt-5 text-lg font-medium ${
                    тёмный ? "border-white/15" : "border-border"
                  }`}
                >
                  {c.takeaway}
                </p>
              </div>
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}

/**
 * Сравнение трёх моделей.
 *
 * Не таблица с линией под каждой строкой: на пяти строках это самая
 * ленивая вёрстка из возможных. Здесь три колонки в одной обойме,
 * подписи слева, и подписка выделена как своя.
 */
export function Comparison() {
  const rows = [
    {
      label: "Когда подходит",
      values: [
        "Постоянный большой объём",
        "Одна точечная вакансия",
        "2-5 параллельных вакансий",
      ],
    },
    {
      label: "Из чего стоимость",
      values: [
        "Зарплата, налоги, инструменты",
        "Процент или гонорар за закрытие",
        "Фиксированная сумма в месяц",
      ],
    },
    {
      label: "Кто управляет",
      values: [
        "Сторона компании",
        "По каждой роли отдельно",
        "Fattakhov HR Agency",
      ],
    },
  ];
  const cols = ["Штатный рекрутер", "Разовый подбор", "Команда по подписке"];

  return (
    <ScrollRegion label="Сравнение: штатный рекрутер, разовый подбор и команда по подписке" className="overflow-x-auto">
      {/* Ширины в rem, а не в px: текст ячеек растёт вместе с базовым
          размером (125% с 640px, app/globals.css), а пиксельный минимум
          таблицы — нет. На 640–768 последняя колонка не влезала в 680px
          и молча срезалась на 14px overflow'ом рамки; теперь таблица
          шире экрана просто прокручивается вбок, как и задумано */}
      {/* overflow-clip, а не hidden: hidden делает рамку своим контейнером прокрутки,
          и колонка названий внутри неё не «прилипает» при сдвиге вбок */}
      <div className="min-w-[42.5rem] overflow-clip rounded-xl border">
        {/* Сетка из div-ов размечена как таблица ролями: без них читалка
            видела россыпь текста и не связывала значение с его столбцом
            и строкой. «Строка» display: contents ниже роль не теряет */}
        <div
          role="table"
          aria-label="Сравнение моделей найма"
          className="grid grid-cols-[10rem_repeat(3,1fr)] gap-px bg-border"
        >
          <div role="row" className="contents">
            <div role="columnheader" className="sticky left-0 z-10 bg-card px-5 py-4">
              <span className="sr-only">Показатель</span>
            </div>
            {cols.map((c, i) => (
              <div
                key={c}
                role="columnheader"
                className={`px-5 py-4 text-base font-medium ${
                  i === 2 ? "bg-primary text-primary-foreground" : "bg-card"
                }`}
              >
                {c}
              </div>
            ))}
          </div>

          {rows.map((r) => (
            <div key={r.label} role="row" className="contents">
              {/* Это заголовок строки, а не подпись мелким шрифтом — он
                  стоял мельче и бледнее самих данных рядом (14px, серый
                  47% светлоты), и терялся на белой карточке. Теперь
                  того же размера, что данные, и заметно темнее */}
              <div
                role="rowheader"
                className="sticky left-0 z-10 bg-card px-5 py-4 text-base font-medium tracking-wide text-foreground/85 uppercase"
              >
                {r.label}
              </div>
              {r.values.map((v, i) => (
                <div
                  key={`${r.label}-${i}`}
                  role="cell"
                  className={`px-5 py-4 text-base ${
                    i === 2 ? "bg-accent font-medium" : "bg-card"
                  }`}
                >
                  {v}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ScrollRegion>
  );
}

/**
 * Вопросы и ответы. Раскрытие штатным disclosure, без своей механики.
 *
 * Список лежит в `lib/marketing/faq.ts` и тот же уходит в разметку FAQPage:
 * копия здесь разошлась бы с ней по словам.
 */
export function Faq() {
  const items = FAQ_ITEMS;

  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((it) => (
        <details
          key={it.q}
          className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
            {it.q}
            <span
              aria-hidden
              className="relative size-4 shrink-0 text-muted-foreground before:absolute before:top-1/2 before:left-0 before:h-[1.5px] before:w-4 before:-translate-y-1/2 before:bg-current after:absolute after:top-1/2 after:left-0 after:h-[1.5px] after:w-4 after:-translate-y-1/2 after:rotate-90 after:bg-current after:transition-transform group-open:after:rotate-0"
            />
          </summary>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {it.a}
          </p>
        </details>
      ))}
    </div>
  );
}
