import type { Metadata } from "next";
import Link from "next/link";

import { RoleMosaic } from "@/components/marketing/role-mosaic";
import { Cases, Section, SectionHead } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "Кейсы подбора персонала · Fattakhov HR Agency" },
  description:
    "Реальные задачи найма из практики агентства: сложные роли на стыке аналитики и инженерии, подбор под разные бизнес-направления, оценка кандидатов. Без выдуманных цифр.",
  alternates: { canonical: "/cases" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    title: "Кейсы: не обещания, а реальные рабочие ситуации",
    description:
      "Что агентство закрывало на практике и по каким задачам клиенты возвращались.",
  },
};

/**
 * Отдельная страница кейсов.
 *
 * Сюда приходят проверять, а не знакомиться: человек уже слышал
 * про агентство и хочет понять, работали ли с похожими задачами.
 * Поэтому вперёд вынесены сами кейсы, а не рассказ о подходе.
 *
 * Раздел про то, чего здесь нет, стоит намеренно и работает лучше
 * любых цифр: агентство, которое честно говорит «этих данных у нас
 * пока нет», вызывает больше доверия, чем агентство с круглыми
 * процентами неизвестного происхождения.
 */
export default function CasesPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-brand-slate text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"
        />
        <div className="relative mx-auto max-w-4xl px-5 py-16 md:py-24">
          <div className="text-xs font-medium tracking-[0.14em] text-white/65 uppercase">
            Кейсы
          </div>
          <h1 className="mt-5 text-[2rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
            Не обещания. Реальные рабочие ситуации.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
            Здесь только то, что уже было в практике агентства: сложные роли,
            повторное доверие клиентов и подбор под разные бизнес-задачи.
          </p>
        </div>
      </section>

      <Section id="cases" width="wide" pad="tall">
        <Cases />
      </Section>

      <Section tone="muted">
        <SectionHead
          eyebrow="Кого закрываем"
          title="От операционных ролей до тех, кого на рынке единицы."
          lead="Одни позиции закрываются потоком, другие требуют прямого поиска и разговора с каждым. Мы ведём и те, и другие, и заранее говорим, к какому типу относится ваша."
        />
        <RoleMosaic />
      </Section>

      {/* Этот блок сильнее любых процентов: агентство, которое честно
          говорит «этих данных у нас пока нет», вызывает больше
          доверия, чем агентство с круглыми цифрами ниоткуда */}
      <Section width="narrow" pad="tight">
        <SectionHead title="Почему здесь нет цифр" align="center" />
        <p className="mx-auto mt-6 max-w-2xl text-center leading-relaxed text-muted-foreground">
          Сроки закрытия, количество закрытых вакансий и проценты конверсии
          появятся на этой странице тогда, когда за ними будут подтверждённые
          данные из платформы, а не пересказ по памяти. Пока таких данных нет,
          писать их было бы враньём, а проверить их вы всё равно не сможете.
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-muted-foreground">
          Зато на диагностике мы разберём вашу воронку по вашим числам —
          это полезнее наших.
        </p>
      </Section>

      <Section tone="dark" width="narrow">
        <SectionHead
          tone="dark"
          title="Обсудим вашу задачу"
          lead="Расскажите, кого ищете. За 20 минут разберём позицию, оценим сложность и скажем, за какой срок реально закрыть."
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link href="/#diagnostic">Обсудить найм</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/tariffs">Посмотреть тарифы</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
