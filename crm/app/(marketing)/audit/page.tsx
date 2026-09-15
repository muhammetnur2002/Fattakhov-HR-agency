import type { Metadata } from "next";

import { AuditTool } from "@/components/audit/audit-tool";
import { Section, SectionHead } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { FUNNEL_SIGNALS, FUNNEL_STEPS, MAX_SCORE, STAGES } from "@/lib/audit/stages";

export const metadata: Metadata = {
  title: "Экспресс-аудит системы найма",
  description:
    "Проверьте за 15 минут, где компания теряет кандидатов, время и деньги: 12 этапов найма от диагностики потребности до испытательного срока, 24 балла и план действий.",
};

/**
 * Экспресс-аудит системы найма.
 *
 * Отдельная страница, а не блок на лендинге: у неё другая задача.
 * Лендинг продаёт подписку, аудит даёт пользу до всякой продажи
 * и приводит человека, который уже понял, что у него не так.
 * Такой человек приходит на разговор с вопросом, а не с возражением.
 *
 * Порядок: сначала карта процесса, чтобы человек увидел цепочку
 * целиком и понял, что найм это не «дать объявление», потом сам
 * опросник, потом воронка для тех, кто хочет копнуть глубже.
 */
export default function AuditPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-brand-slate text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"
        />
        <div className="relative mx-auto max-w-4xl px-5 py-16 md:py-24">
          <div className="text-xs font-medium tracking-[0.14em] text-white/65 uppercase">
            Диагностика системы найма
          </div>
          <h1 className="mt-5 text-[2rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
            Почему ваш найм не работает
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
            Проверьте, где компания теряет кандидатов, время и деньги: от
            определения потребности до испытательного срока. Отвечать честно
            выгоднее, чем красиво: результат видите только вы.
          </p>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-xl bg-white/12">
            {[
              { v: STAGES.length, l: "этапов" },
              { v: MAX_SCORE, l: "балла" },
              { v: 1, l: "план действий" },
            ].map((f) => (
              <div key={f.l} className="bg-brand-slate px-4 py-5">
                <dt className="text-3xl font-semibold tabular-nums">{f.v}</dt>
                <dd className="mt-1 text-sm text-white/65">{f.l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Карта процесса до опросника: человек должен увидеть цепочку
          целиком, иначе двенадцать блоков читаются как случайный список */}
      <Section tone="muted" pad="tight">
        <SectionHead
          eyebrow="Карта процесса"
          title="Найм начинается не с вакансии."
          lead="Вакансия только один из элементов системы. Ошибка на любом этапе приводит к долгому поиску, отказу сильного кандидата или неудачному испытательному сроку."
        />

        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-xl border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="w-14 py-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  №
                </th>
                <th className="py-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Этап
                </th>
                <th className="py-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Главный вопрос
                </th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((s) => (
                <tr key={s.number} className="border-b last:border-0">
                  <td className="py-3.5 text-sm text-muted-foreground tabular-nums">
                    {String(s.number).padStart(2, "0")}
                  </td>
                  <td className="py-3.5 pr-6 font-medium">{s.name}</td>
                  <td className="py-3.5 text-muted-foreground">
                    {s.keyQuestion}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 max-w-2xl leading-relaxed">
          Найм завершён не тогда, когда сотрудник вышел, а тогда, когда функция
          действительно закрыта.
        </p>
      </Section>

      <Section id="tool" width="narrow" pad="tall">
        <SectionHead
          title="Пройдите аудит"
          lead="Оценивайте не намерения, а то, как процесс работает сейчас. Два балла ставьте только там, где есть понятные правила, ответственные и точки контроля."
        />
        <div className="mt-10">
          <AuditTool />
        </div>
      </Section>

      {/* Воронка отвечает на другой вопрос, чем опросник: тот
          спрашивает «есть ли процесс», эта показывает, где он рвётся
          на живой вакансии. Поэтому отдельным блоком, а не внутри */}
      <Section tone="muted">
        <SectionHead
          eyebrow="Управление цифрами"
          title="Где вы теряете кандидатов."
          lead="Аудит показывает зрелость процесса, а воронка — место разрыва. Посчитайте её по одной актуальной или недавно закрытой вакансии."
        />

        <div className="mt-10 overflow-x-auto">
          <div className="flex min-w-3xl gap-px rounded-xl bg-border p-px">
            {FUNNEL_STEPS.map((step) => (
              <div key={step} className="flex-1 bg-card px-4 py-5">
                <div className="text-xs leading-snug font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  {step}
                </div>
                <div className="mt-4 h-8 rounded-md border border-dashed" />
                <div className="mt-2 h-6 rounded-md border border-dashed" />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Верхнее поле — количество, нижнее — конверсия к предыдущему этапу, %
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2">
          {FUNNEL_SIGNALS.map((s) => (
            <div key={s.signal} className="bg-card p-6">
              <div className="font-medium">{s.signal}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {s.check}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="dark" width="narrow">
        <SectionHead
          tone="dark"
          eyebrow="Следующий шаг"
          title="Низкая оценка не значит, что вы плохо ищете."
          lead="Причина может быть в самой роли, требованиях, условиях, скорости решений, онбординге или управлении. Сильный специалист не исправит слабую систему: если сотрудник не справляется, часто дело в том, что компания неверно описала функцию, завысила требования или не определила метрики."
        />

        <ul className="mt-10 space-y-4">
          {[
            "Найти этап, на котором разрывается воронка",
            "Проверить соответствие требований и условий рынку",
            "Пересобрать роль, вакансию и критерии отбора",
            "Выстроить процесс от заявки до испытательного срока",
          ].map((item, i) => (
            <li key={item} className="flex gap-4 border-b border-white/12 pb-4">
              <span className="text-sm text-white/50 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-lg leading-relaxed text-balance">
          Системный найм — это не поиск человека, а управление цепочкой от
          бизнес-потребности до подтверждённого результата.
        </p>

        <Button asChild size="lg" variant="secondary" className="mt-8">
          <a href="#tool">Пройти аудит</a>
        </Button>
      </Section>
    </>
  );
}
