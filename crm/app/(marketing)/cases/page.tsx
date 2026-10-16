import type { Metadata } from "next";
import Link from "next/link";

import { RoleMosaic } from "@/components/marketing/role-mosaic";
import { Cases, Section, SectionHead } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/marketing/seo";
import { appUrl } from "@/lib/urls";
import { PageHero, PageIntro } from "@/components/marketing/page-intro";
import { StructuredData } from "@/components/marketing/structured-data";

export const metadata: Metadata = pageMetadata("cases");

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
      <StructuredData page="cases" />
      <PageHero>
        <PageIntro eyebrow="Кейсы" title="Не обещания. Реальные рабочие ситуации.">
          Здесь только то, что уже было в практике агентства: сложные роли,
          повторное доверие клиентов и подбор под разные бизнес-задачи.
        </PageIntro>
      </PageHero>

      <Section id="cases">
        <Cases headingAs="h2" />
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
      <Section width="narrow">
        <SectionHead title="Почему здесь нет цифр" align="center" />
        <p className="mx-auto max-w-2xl text-center leading-relaxed text-muted-foreground">
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
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary">
            {/* Как в шапке: «Обсудить найм» — регистрация в кабинете */}
            <a href={appUrl("/register")}>Обсудить найм</a>
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
