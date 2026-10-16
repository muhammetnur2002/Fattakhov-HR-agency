import type { Metadata } from "next";

import { AuditTool } from "@/components/audit/audit-tool";
import { Section, SectionHead } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { FUNNEL_SIGNALS, FUNNEL_STEPS, MAX_SCORE, STAGES } from "@/lib/audit/stages";
import { PageHero, PageIntro } from "@/components/marketing/page-intro";
import { StructuredData } from "@/components/marketing/structured-data";
import { pageMetadata } from "@/lib/marketing/seo";

export const metadata: Metadata = pageMetadata("audit");

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
      <StructuredData page="audit" />
      <PageHero>
        <PageIntro eyebrow="Диагностика системы найма" title="Почему ваш найм не работает">
          Проверьте, где компания теряет кандидатов, время и деньги: от
          определения потребности до испытательного срока. Отвечать честно
          выгоднее, чем красиво: результат видите только вы.
        </PageIntro>

        <dl className="mt-6 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-xl bg-white/12">
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
      </PageHero>

      {/* Карта процесса до опросника: человек должен увидеть цепочку
          целиком, иначе двенадцать блоков читаются как случайный список */}
      <Section tone="muted">
        <SectionHead
          eyebrow="Карта процесса"
          title="Найм начинается не с вакансии."
          lead="Вакансия только один из элементов системы. Ошибка на любом этапе приводит к долгому поиску, отказу сильного кандидата или неудачному испытательному сроку."
        />

        {/*
          На телефоне строки раскладываются блоками: № и этап в одной строке, вопрос под
          ними. Три колонки в 36rem давали прокрутку вбок, где видна была половина таблицы
          и терялась связь строки с её названием. С md — обычная таблица.
        */}
        <ScrollRegion label="Карта процесса найма: этапы и главные вопросы" className="md:overflow-x-auto">
          <table className="block w-full border-collapse text-left md:table md:min-w-xl">
            <caption className="sr-only">Карта процесса найма: номер этапа, название и главный вопрос</caption>
            <thead className="hidden md:table-header-group">
              <tr className="border-b">
                <th scope="col" className="w-14 py-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  №
                </th>
                <th scope="col" className="py-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Этап
                </th>
                <th scope="col" className="py-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Главный вопрос
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {STAGES.map((s) => (
                <tr
                  key={s.number}
                  className="grid grid-cols-[2.5rem_1fr] gap-y-1 border-b py-3 last:border-0 md:table-row md:py-0"
                >
                  <td className="text-sm text-muted-foreground tabular-nums md:py-3">
                    {String(s.number).padStart(2, "0")}
                  </td>
                  <td className="font-medium md:py-3 md:pr-6">{s.name}</td>
                  <td className="col-start-2 text-muted-foreground md:py-3">
                    {s.keyQuestion}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>

        <p className="mt-6 max-w-2xl leading-relaxed">
          Найм завершён не тогда, когда сотрудник вышел, а тогда, когда функция
          действительно закрыта.
        </p>
      </Section>

      <Section id="tool" width="narrow">
        <SectionHead
          title="Пройдите аудит"
          lead="Оценивайте не намерения, а то, как процесс работает сейчас. Два балла ставьте только там, где есть понятные правила, ответственные и точки контроля."
        />
        <AuditTool />
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

        <ScrollRegion label="Воронка найма: шаги и поля для цифр" className="overflow-x-auto">
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
        </ScrollRegion>
        <p className="mt-3 text-xs text-muted-foreground">
          Верхнее поле — количество, нижнее — конверсия к предыдущему этапу, %
        </p>

        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2">
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

        <ul className="space-y-4">
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

        <p className="mt-6 text-lg leading-relaxed text-balance">
          Системный найм — это не поиск человека, а управление цепочкой от
          бизнес-потребности до подтверждённого результата.
        </p>

        <Button asChild size="lg" variant="secondary" className="mt-6">
          <a href="#tool">Пройти аудит</a>
        </Button>
      </Section>
    </>
  );
}
