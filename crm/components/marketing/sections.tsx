import { Logo } from "@/components/brand/logo";
import {
  CountUp,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/motion/primitives";

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
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "light",
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  tone?: "light" | "dark";
  align?: "left" | "center";
}) {
  const dark = tone === "dark";
  const center = align === "center";

  return (
    <Reveal
      className={center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}
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
      <h2
        className={`text-4xl leading-tight font-semibold tracking-tight text-balance md:text-5xl ${
          eyebrow ? "mt-4" : ""
        } ${dark ? "text-white" : "text-foreground"}`}
      >
        {title}
      </h2>
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
 * Ширина и вертикальные отступы вынесены в параметры не ради гибкости,
 * а против однообразия: двенадцать разделов одинаковой ширины с
 * одинаковым воздухом сливаются в простыню, сколько бы разного текста
 * в них ни лежало. Узкий раздел читается как пауза, широкий как
 * витрина, и глаз получает опору.
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
  width?: "narrow" | "normal" | "wide";
  pad?: "tight" | "normal" | "tall";
}) {
  const bg =
    tone === "dark"
      ? "bg-brand-graphite text-white"
      : tone === "muted"
        ? "bg-muted/45"
        : "bg-background";

  const maxW =
    width === "narrow"
      ? "max-w-3xl"
      : width === "wide"
        ? "max-w-7xl"
        : "max-w-6xl";

  const padding =
    pad === "tight"
      ? "py-14 md:py-16"
      : pad === "tall"
        ? "py-24 md:py-32"
        : "py-20 md:py-24";

  return (
    <section id={id} className={`relative overflow-hidden ${bg}`}>
      {tone === "dark" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"
        />
      )}
      <div className={`relative mx-auto ${maxW} px-5 ${padding}`}>
        {children}
      </div>
    </section>
  );
}

/** Полоса ключевых цифр. Отдельным блоком, а не внутри первого экрана. */
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
      <Stagger className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-border px-0 lg:grid-cols-4">
        {facts.map((f) => (
          <StaggerItem key={f.label} className="bg-card px-5 py-7">
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
    <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="bg-card p-6">
          <div className="text-lg font-medium">{it.title}</div>
          <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
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
    <ol className="mt-12 space-y-0 border-l border-white/15 pl-6 md:pl-8">
      {steps.map((s) => (
        <li key={s.name} className="relative pb-10 last:pb-0">
          {/*
            Смещение подобрано так, чтобы линия (border-l слева у ol,
            1px) проходила ровно по центру точки, а не по её краю:
            центр точки = край li (pl-6/pl-8 от линии) минус половина
            её ширины (5px) минус половина толщины самой линии.
            Только left/-left — top-1.5 не трогаем, вертикаль уже верна.
          */}
          <span
            aria-hidden
            className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-sm bg-white/70 md:-left-[37px]"
          />
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
    <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_auto]">
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it} className="py-3.5 text-lg">
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
 */
export function Cases() {
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
      roles: ["Менеджеры", "Администраторы", "Руководители", "Оценка кандидатов"],
      takeaway: "Подбор идёт под бизнес-задачу, а не под шаблон вакансии",
    },
  ];

  return (
    <div className="mt-14 space-y-5">
      {cases.map((c, i) => {
        // Первый кейс на графите: два одинаковых светлых прямоугольника
        // подряд читаются как таблица, а это витрина
        const тёмный = i === 0;

        return (
          <Reveal key={c.name} delay={i * 0.06}>
            <article
              className={`grid gap-8 overflow-hidden rounded-2xl p-7 md:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 ${
                тёмный
                  ? "bg-brand-graphite text-white"
                  : "border bg-card"
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
                    и мелким кеглем его никто не заметит */}
                <h3 className="mt-3 text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
                  {c.name}
                </h3>
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
                      className={`rounded-md px-2.5 py-1 text-sm ${
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
                  className={`mt-8 border-t pt-5 text-lg font-medium ${
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
    { label: "Когда подходит", values: ["Постоянный большой объём", "Одна точечная вакансия", "2-5 параллельных вакансий"] },
    { label: "Из чего стоимость", values: ["Зарплата, налоги, инструменты", "Процент или гонорар за закрытие", "Фиксированная сумма в месяц"] },
    { label: "Кто управляет", values: ["Сторона компании", "По каждой роли отдельно", "Fattakhov HR Agency"] },
  ];
  const cols = ["Штатный рекрутер", "Разовый подбор", "Команда по подписке"];

  return (
    <div className="mt-12 overflow-x-auto">
      <div className="min-w-[680px] overflow-hidden rounded-xl border">
        <div className="grid grid-cols-[160px_repeat(3,1fr)] gap-px bg-border">
          <div className="bg-card px-5 py-4" />
          {cols.map((c, i) => (
            <div
              key={c}
              className={`px-5 py-4 text-base font-medium ${
                i === 2 ? "bg-primary text-primary-foreground" : "bg-card"
              }`}
            >
              {c}
            </div>
          ))}

          {rows.map((r) => (
            <div key={r.label} className="contents">
              {/* Это заголовок строки, а не подпись мелким шрифтом — он
                  стоял мельче и бледнее самих данных рядом (14px, серый
                  47% светлоты), и терялся на белой карточке. Теперь
                  того же размера, что данные, и заметно темнее */}
              <div className="bg-card px-5 py-4 text-base font-medium tracking-wide text-foreground/85 uppercase">
                {r.label}
              </div>
              {r.values.map((v, i) => (
                <div
                  key={`${r.label}-${i}`}
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
    </div>
  );
}

/** Вопросы и ответы. Раскрытие штатным disclosure, без своей механики. */
export function Faq() {
  const items = [
    {
      q: "Чем подписка отличается от обычного агентства?",
      a: "Мы резервируем для вас мощность команды и ведём несколько вакансий параллельно. Платите фиксированную сумму в месяц, а не гонорар за каждое закрытие.",
    },
    {
      q: "Что считается активным слотом?",
      a: "Один слот это одна вакансия, по которой сейчас идёт активный поиск. После закрытия или паузы слот передаётся следующей позиции.",
    },
    {
      q: "Можно ли начать с одной вакансии?",
      a: "Да, но для одной точечной позиции разовый подбор иногда экономичнее. Сравним оба варианта на диагностике и скажем прямо, что выгоднее.",
    },
    {
      q: "Кто общается с кандидатами?",
      a: "Команда агентства ведёт первичную коммуникацию и координацию. Руководитель подключается на согласованных этапах.",
    },
  ];

  return (
    <div className="mt-12 divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((it) => (
        <details key={it.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
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
