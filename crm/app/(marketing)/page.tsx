import Link from "next/link";

import { BeyondSalary } from "@/components/marketing/beyond-salary";
import { Button } from "@/components/ui/button";
import { CostCalculator } from "@/components/marketing/cost-calculator";
import { CostComparison } from "@/components/marketing/cost-comparison";
import { Hero } from "@/components/marketing/hero";
import { LeadForm } from "@/components/marketing/lead-form";
import { PlatformPreview } from "@/components/marketing/platform-preview";
import { Pricing } from "@/components/marketing/pricing";
import { StructuredData } from "@/components/marketing/structured-data";
import { studentsUrl } from "@/lib/urls";
import {
  Cases,
  Comparison,
  Facts,
  Faq,
  HowItWorks,
  Responsibility,
  Section,
  SectionHead,
  WhenSubscription,
} from "@/components/marketing/sections";

/**
 * Главная страница сайта.
 *
 * Порядок блоков идёт по вопросам, которые человек задаёт в этом же
 * порядке: что вы делаете, мой ли это случай, как это устроено, кто
 * будет работать, было ли такое раньше, сколько стоит, чем это лучше
 * альтернатив, что дальше.
 *
 * Тёмные блоки чередуются со светлыми не для красоты: тёмное отделяет
 * рассказ о процессе от фактов и цифр, и глаз не устаёт от однородной
 * простыни.
 *
 * Ширина, отступы и наличие надзаголовка тоже меняются от раздела
 * к разделу намеренно. Двенадцать блоков одной формы читаются сплошной
 * лентой независимо от того, насколько разный в них текст: глазу не
 * за что зацепиться, и он перестаёт различать границы. Здесь разделы
 * отличаются формой, а не только содержанием: кейсы шире остальных,
 * ответы на вопросы узкие, короткие разделы идут по центру и без
 * надзаголовка.
 */
export default function LandingPage() {
  // Студенческая платформа — отдельное приложение агентства. На проде
  // без её адреса блока нет, а не кнопка в никуда (см. lib/urls.ts)
  const studentsHome = studentsUrl("/");
  const studentsRating = studentsUrl("/institutions/rating");

  return (
    <>
      <StructuredData />
      <Hero />
      <Facts />

      {/* Сразу под первым экраном: обещание из заголовка должно быть
          разобрано раньше, чем человек начнёт сомневаться */}
      <Section tone="muted">
        <SectionHead
          eyebrow="Сколько это стоит на самом деле"
          title="Отдел найма в штате и команда по подписке."
          lead="Считаем открыто: оклады, взносы сверх окладов и доступы к базам резюме. Цифры для рынка Казани и Москвы, а свои можно подставить прямо здесь."
        />
        <div className="mt-12">
          <CostComparison />
          {/* Разбор выше — общий довод, калькулятор — тот же расчёт
              на числах читателя. Без него у человека из другого города
              оставалось «это ваши оклады, а не мои» */}
          <CostCalculator />
          <BeyondSalary />
        </div>
      </Section>

      {/* Короткий раздел из трёх тезисов: по центру и без надзаголовка.
          После полутора экранов расчёта нужна пауза, а не ещё одна шапка */}
      <Section id="model" pad="tight">
        <SectionHead
          align="center"
          title="Не ещё одно агентство. Ваша функция найма."
          lead="Подключаемся как внутренняя команда, но без долгого найма, адаптации и постоянных расходов на HR-штат."
        />
        <WhenSubscription />
      </Section>

      <Section id="how" tone="dark">
        <SectionHead
          tone="dark"
          eyebrow="Как это работает"
          title="От хаотичного поиска к системе."
          lead="Мы не исчезаем после отправки резюме. Ведём процесс целиком и показываем, где находится найм и что делать дальше."
        />
        <HowItWorks />
      </Section>

      {/* Узкая колонка: здесь читают текст, а не разглядывают карточки */}
      <Section tone="muted" width="narrow">
        <SectionHead
          eyebrow="Выделенная команда"
          title="Погружаемся внутрь бизнеса. Работаем снаружи."
          lead="Recruitment lead управляет стратегией и качеством. Рекрутер ведёт кандидатов. Research-функция расширяет воронку через 30+ источников."
        />
        <Responsibility />
      </Section>

      {/* Кабинет идёт сразу после рассказа о команде: «кто работает»
          и «что вы при этом видите» — один вопрос, разорванный надвое.
          Тёмный фон тут не ради ритма: на нём светлое окно кабинета
          читается как настоящий экран, а не как ещё один блок текста */}
      <Section id="platform" tone="dark">
        <SectionHead
          tone="dark"
          eyebrow="Личный кабинет"
          title="Вы видите найм, а не отчёт о найме."
          lead="Обычное агентство присылает резюме письмом, и что происходит между письмами — непонятно. Здесь воронка открыта: видно каждого кандидата, его этап и сколько он на этом этапе стоит."
        />
        <PlatformPreview />
      </Section>

      {/* Самый широкий раздел на странице: кейсы это витрина, и она
          должна выходить за привычные поля, иначе не читается как витрина */}
      <Section id="cases" width="wide" pad="tall">
        <SectionHead
          title="Не обещания. Реальные рабочие ситуации."
          lead="Показываем только то, что уже было в практике агентства: сложные роли, повторное доверие клиентов и подбор под разные бизнес-задачи."
        />
        <Cases />
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Без искусственных цифр. Сроки и количество закрытий появятся здесь
          тогда, когда за ними будут подтверждённые данные.
        </p>
      </Section>

      {/* wide — пяти карточкам арки нужен запас по ширине, иначе цена
          с ₽ на краевых и центральной плитке переносится на вторую
          строку. У заголовка своя ширина (max-w в SectionHead), так
          что на нём это расширение не сказывается */}
      <Section id="pricing" width="wide">
        <SectionHead
          eyebrow="Активные слоты"
          title="Платите за мощность команды, а не за отдельные резюме."
        />
        <Pricing />
      </Section>

      {/* Приглушённый фон обязателен: до правки здесь шли две белые
          секции подряд, и граница между прайсом и сравнением пропадала */}
      <Section tone="muted" pad="tight">
        <SectionHead
          align="center"
          title="Три способа организовать найм."
        />
        <Comparison />
      </Section>

      {/* Второе действие для тех, кто не готов разговаривать. Без него
          такой человек просто уходит: на странице есть только одна
          кнопка, и она требует оставить контакт */}
      <Section pad="tight">
        <div className="grid items-center gap-8 rounded-2xl border bg-card p-8 md:p-10 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Бесплатно и без контактов
            </div>
            <h2 className="mt-3 text-2xl font-medium tracking-tight text-balance md:text-3xl">
              Не готовы обсуждать? Проверьте свой найм сами.
            </h2>
            <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
              Экспресс-аудит из 12 этапов: от вопроса «а нужен ли вообще
              новый сотрудник» до испытательного срока. Пятнадцать минут,
              24 балла и три этапа, с которых стоит начать. Результат видите
              только вы.
            </p>
          </div>
          <div className="lg:justify-self-end">
            <Button asChild size="lg">
              <Link href="/audit">Пройти экспресс-аудит</Link>
            </Button>
          </div>
        </div>
      </Section>

      <Section id="diagnostic" tone="dark">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <SectionHead
              tone="dark"
              eyebrow="Бесплатная диагностика"
              title="Получите план найма на ближайшие 3 месяца."
              lead="За 20 минут разберём вакансии, сравним модели и покажем, какая команда нужна, со сроками и расчётом стоимости."
            />

            <dl className="mt-10 space-y-6">
              {[
                {
                  t: "Карта вакансий",
                  d: "Приоритеты, сложность и последовательность запуска.",
                },
                {
                  t: "Подходящая модель",
                  d: "Штат, разовый подбор или подписка, без давления.",
                },
                {
                  t: "Расчёт на 3 месяца",
                  d: "Команда, сроки и понятный диапазон бюджета.",
                },
              ].map((i) => (
                <div key={i.t}>
                  <dt className="font-medium text-white">{i.t}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-white/65">
                    {i.d}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-10 border-t border-white/12 pt-5 text-sm text-white/60">
              Если подписка вам не подходит, скажем прямо.
            </p>
          </div>

          {/* Форма светлая на тёмном: её заполняют, и читаемость поля
              важнее единства фона */}
          <div className="text-foreground">
            <LeadForm />
          </div>
        </div>
      </Section>

      {/* Последний раздел узкий: это уже не продажа, а дочитывание */}
      <Section width="narrow" pad="tight">
        <SectionHead eyebrow="Коротко о важном" title="Частые вопросы." />
        <Faq />
      </Section>

      {/* Другая аудитория — после вопросов клиентов, над подвалом: тот,
          кто пришёл нанимать, дочитывает страницу без помех, а студент
          или вуз находят свой вход там, где ищут всё остальное. Та же
          карточка, что у аудита: второе действие, а не новая витрина */}
      {studentsHome && studentsRating && (
        <Section id="students" tone="muted" pad="tight">
          <div className="grid items-center gap-8 rounded-2xl border bg-card p-8 md:p-10 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Студентам и учебным заведениям
              </div>
              <h2 className="mt-3 text-2xl font-medium tracking-tight text-balance md:text-3xl">
                Подработка под расписание учёбы.
              </h2>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Отдельная платформа агентства для студентов: профиль за три
                минуты, вакансии проверенных компаний и отклик одним
                движением. Для вузов — открытый рейтинг по трудоустройству
                студентов. Пилот идёт в Казани.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-self-end">
              <Button asChild size="lg">
                <a href={studentsHome}>Найти подработку</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={studentsRating}>Учебные заведения</a>
              </Button>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
