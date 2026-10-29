'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, CalendarCheck, Hand, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { CubeMark } from '@/components/brand/CubeMark';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal, Stagger } from '@/components/motion/Reveal';
import { SplitText, SplitTextInView } from '@/components/motion/SplitText';
import { useCurtainNav } from '@/components/motion/RouteCurtain';
import { DemoDeck } from './DemoDeck';
import { CookieSettingsLink } from '@/components/analytics/CookieBanner';
import { GOALS, reachGoal } from '@/components/analytics/YandexMetrika';
import { durations, easeOutExpo, fadeUp, rise } from '@/lib/motion';
import type { VacancyDTO } from '@/lib/types';

const STEPS = [
  {
    icon: <CalendarCheck className="size-5" />,
    title: 'Профиль за три минуты',
    body: 'Вуз, специальность, свободные дни и навыки. Шесть коротких шагов — дальше подбор идёт сам.',
  },
  {
    icon: <Hand className="size-5" />,
    title: 'Смахивайте вакансии',
    body: 'Вправо — отклик уходит работодателю сразу. Влево — вакансия уходит в «Пропущенные», откуда её всегда можно вернуть.',
  },
  {
    icon: <Building2 className="size-5" />,
    title: 'Работодатель отвечает',
    body: 'Компания видит ваш профиль и резюме в своём кабинете. Статус отклика меняется у вас на глазах — без переписок и звонков.',
  },
];

export function Landing({
  vacancies,
  companies,
  agencyUrl,
}: {
  vacancies: VacancyDTO[];
  companies: string[];
  /** Сайт агентства; null — адрес на проде не задан, ссылки нет */
  agencyUrl: string | null;
}) {
  const navigate = useCurtainNav();

  // Employer registration stays on the student platform.
  const employerRegisterUrl = '/register/company';

  return (
    // overflow-x-clip: карточки демо-колоды улетают за правый край (x = ширина окна × flyOut) и на
    // доли секунды растягивают страницу вширь (scrollWidth 963–977 при окне 393). На iOS это сдвигает
    // layout viewport, и «прибитые» к окну элементы (кнопка темы) уезжают от угла. clip, а не hidden:
    // контейнер прокрутки не создаётся, sticky и якоря не страдают.
    <div className="relative overflow-x-clip">
      <header className="page-x absolute inset-x-0 top-0 z-40 mx-auto flex h-[var(--header-h)] max-w-[2200px] items-center justify-between">
        <div className="rise-in" style={rise(0, -12)}>
          <Logo href={null} />
        </div>

        <div className="rise-in flex items-center gap-2" style={rise(0.08, -12)}>
          <ButtonLink href="/login" variant="ghost" size="sm">
            Войти
          </ButtonLink>
          <Button size="sm" onClick={() => navigate('/register')} iconRight={<ArrowRight />}>
            Начать
          </Button>
        </div>
      </header>

      {/* ---------- ПЕРВЫЙ ЭКРАН ---------- */}
      <section className="page-x mx-auto grid min-h-dvh max-w-[2200px] grid-cols-1 items-center gap-14 pb-20 pt-[calc(var(--header-h)+4.5rem)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pt-[var(--header-h)]">
        <div className="relative z-10">
          <p className="rise-in text-eyebrow uppercase text-accent-300" style={rise(0.1, 10)}>
            Fattakhov HR Agency · для студентов
          </p>

          <SplitText
            text="Работа, которая помещается между парами"
            className="mt-7 max-w-[15ch] text-display"
            wordClassName="text-gradient"
            delay={0.22}
          />

          <p
            className="rise-in mt-7 max-w-[46ch] text-body leading-relaxed text-paper-dim"
            style={rise(0.55, 14, durations.slow)}
          >
            Смахните вправо — отклик уходит работодателю в ту же секунду. Никаких сопроводительных
            писем и ожидания на неделю: только проверенные компании и график под вашу учёбу.
          </p>

          <div className="rise-in mt-9 flex flex-wrap items-center gap-3" style={rise(0.68, 16, durations.slow)}>
            {/* Раньше тут была одна кнопка «Создать профиль» — работодатель
                на витрине попадал только в подвал и на закрытый /employer.
                Два равных входа сразу под заголовком снимают вопрос «а где
                тут для компании», не заставляя искать его внизу страницы. */}
            <Button
              size="lg"
              onClick={() => {
                reachGoal(GOALS.ctaStudent);
                navigate('/register');
              }}
              iconRight={<ArrowRight />}
            >
              Я студент
            </Button>
            {employerRegisterUrl && (
              <ButtonLink href={employerRegisterUrl} onClick={() => reachGoal(GOALS.ctaEmployer)} size="lg" variant="outline">
                Я работодатель
              </ButtonLink>
            )}
          </div>

          <div className="rise-in mt-4" style={rise(0.78, 10, durations.slow)}>
            <Link
              href="/login"
              className="text-small text-paper-faint underline-offset-4 transition-colors hover:text-paper hover:underline"
            >
              Уже есть аккаунт? Войти
            </Link>
          </div>

          <div
            className="rise-in mt-8 flex items-center gap-2 text-caption text-paper-faint"
            style={rise(0.9, 0, durations.slow)}
          >
            <ShieldCheck className="size-3.5 shrink-0 text-accent-400" aria-hidden />
            Персональные данные шифруются и передаются только тем компаниям, которым вы сами
            откликнулись
          </div>
        </div>

        <div className="rise-in relative" style={rise(0.35, 40, 1, 0.92)}>
          <DemoDeck vacancies={vacancies} />
        </div>
      </section>

      {/* ---------- ЦИФРЫ ---------- */}
      <section className="page-x mx-auto max-w-[2200px] py-16">
        <Stagger className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-4">
          <Metric value={860} suffix="+" label="студентов в базе" />
          <Metric value={48} label="компаний-партнёров" />
          <Metric value={3} label="дня до первого ответа" />
          <Metric value={71} suffix="%" label="доходят до собеседования" />
        </Stagger>
      </section>

      {/* ---------- КАК ЭТО РАБОТАЕТ ---------- */}
      <section className="page-x mx-auto max-w-[2200px] py-16 sm:py-24">
        <SplitTextInView
          text="Три шага вместо трёх недель"
          className="max-w-[14ch] text-headline"
          wordClassName="text-gradient"
        />

        <Stagger className="mt-14 grid gap-4 md:grid-cols-3" each={0.09}>
          {STEPS.map((step, index) => (
            <Reveal key={step.title} variants={fadeUp}>
              <article className="glass group h-full rounded-3xl p-7 transition-colors duration-500 hover:border-paper/20">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl border border-accent-500/30 bg-accent-500/12 text-accent-200">
                    {step.icon}
                  </span>
                  {/* Узор: порядок шагов виден из порядка карточек, а цифра на 1,2:1 — не текст для чтения */}
                  <span
                    aria-hidden
                    className="text-headline font-semibold leading-none tracking-tight text-paper/[0.07] transition-colors duration-500 group-hover:text-paper/[0.13]"
                  >
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-sub font-semibold tracking-[-0.02em] text-paper">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-body leading-relaxed text-paper-dim">{step.body}</p>
              </article>
            </Reveal>
          ))}
        </Stagger>
      </section>

      {/* ---------- КОМПАНИИ ---------- */}
      <section className="overflow-hidden py-10">
        <p className="page-x mx-auto max-w-[2200px] text-eyebrow uppercase text-paper-faint">
          Кто уже ищет студентов
        </p>
        <div className="relative mt-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink to-transparent" />
          <motion.div
            className="flex w-max gap-3"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 34, ease: 'linear', repeat: Infinity }}
          >
            {[...companies, ...companies].map((company, index) => (
              <span
                key={`${company}-${index}`}
                className="whitespace-nowrap rounded-full border border-[var(--hairline)] bg-graphite-900/40 px-5 py-2.5 text-small text-paper/70"
              >
                {company}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- ЗАКЛЮЧИТЕЛЬНЫЙ ПРИЗЫВ ---------- */}
      <section className="page-x mx-auto max-w-[2200px] py-20 sm:py-28">
        <div className="glass relative overflow-hidden rounded-4xl px-7 py-16 text-center sm:px-16 sm:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/25 blur-[100px]"
          />
          <CubeMark className="mx-auto h-14 w-14 text-paper/70" />
          <SplitTextInView
            text="Первая подборка ждёт вас"
            className="mx-auto mt-8 max-w-[16ch] text-headline text-paper"
            as="h2"
          />
          <p className="mx-auto mt-5 max-w-[48ch] text-body leading-relaxed text-paper-dim">
            Заполните профиль — и лента соберётся под ваш график, город и навыки. Отказаться от
            вакансии можно одним движением, вернуть — тоже.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => navigate('/register')} iconRight={<ArrowRight />}>
              Создать профиль
            </Button>
            {employerRegisterUrl && (
              <ButtonLink href={employerRegisterUrl} variant="ghost" size="lg">
                Я работодатель
              </ButtonLink>
            )}
          </div>
        </div>
      </section>

      <footer className="page-x mx-auto max-w-[2200px] border-t border-[var(--hairline)] py-10">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Logo href={null} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-paper-faint">
            {/* Сайт агентства — отдельное приложение, поэтому <a>, а не Link */}
            {agencyUrl && (
              <a href={agencyUrl} className="transition-colors hover:text-paper">
                Сайт агентства
              </a>
            )}
            <Link href="/login" className="transition-colors hover:text-paper">
              Вход для студентов
            </Link>
            <Link href="/employer" className="transition-colors hover:text-paper">
              Кабинет работодателя
            </Link>
            <Link href="/institutions/rating" className="transition-colors hover:text-paper">
              Рейтинг вузов
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-paper">
              Соглашение
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-paper">
              Политика ПДн
            </Link>
            <Link href="/help" className="transition-colors hover:text-paper">
              Помощь
            </Link>
            <CookieSettingsLink className="transition-colors hover:text-paper" />
          </div>
          <div className="flex items-center gap-2">
            <Tag>ПДн шифруются</Tag>
            <span className="text-caption text-paper-faint">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Metric({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  return (
    <Reveal variants={fadeUp}>
      <div className="h-full bg-ink px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-headline font-semibold leading-none tracking-[-0.04em] text-paper">
          <CountUp to={value} suffix={suffix} />
        </p>
        <p className="mt-3 text-small leading-snug text-paper-faint">{label}</p>
      </div>
    </Reveal>
  );
}
