import type { Metadata } from "next";
import Link from "next/link";

import { BeyondSalary } from "@/components/marketing/beyond-salary";
import { CostComparison } from "@/components/marketing/cost-comparison";
import { Pricing } from "@/components/marketing/pricing";
import { Section, SectionHead } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { ENTRY_PRICE, TARIFFS, pricePerSlot } from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";

export const metadata: Metadata = {
  title: {
    absolute: "Стоимость подбора персонала: тарифы Fattakhov HR Agency",
  },
  description:
    "Сколько стоит внешняя команда найма: от 100 000 ₽ в месяц за одну вакансию до 250 000 ₽ за пять. Открытый прайс, сравнение со своим отделом найма и расчёт цены за вакансию.",
  alternates: { canonical: "/tariffs" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    title: "Тарифы: от 100 000 ₽ в месяц за вакансию в работе",
    description:
      "Пять конфигураций, открытые цены и честное сравнение со своим отделом найма за 590 000 ₽ в месяц.",
  },
};

/**
 * Отдельная страница тарифов.
 *
 * Не дубль прайса с главной, хотя таблица та же. Разница в вопросе,
 * с которым сюда приходят: на главную попадают с рекламы и читают
 * подряд, а сюда — из поиска по запросу «сколько стоит подбор
 * персонала». Такому человеку не нужно объяснять, что такое
 * подписка, ему нужна цена и способ её проверить.
 *
 * Поэтому здесь сначала цифры, потом разбор, и никакого рассказа
 * о том, какие мы хорошие.
 */
export default function TariffsPage() {
  const дешевле = Math.round(
    (1 - pricePerSlot(TARIFFS[TARIFFS.length - 1]) / pricePerSlot(TARIFFS[0])) *
      100,
  );

  return (
    <>
      <section className="relative overflow-hidden bg-brand-slate text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-20 mix-blend-overlay"
        />
        <div className="relative mx-auto max-w-4xl px-5 py-16 md:py-24">
          <div className="text-xs font-medium tracking-[0.14em] text-white/65 uppercase">
            Тарифы
          </div>
          <h1 className="mt-5 text-[2rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
            Сколько стоит внешняя команда найма
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
            От {formatNumber(ENTRY_PRICE)} ₽ в месяц за одну вакансию
            в активной работе. Цена растёт медленнее объёма: на пяти
            вакансиях слот обходится на {дешевле}% дешевле, чем на одной.
            Ниже открытый прайс и расчёт, с чем его сравнивать.
          </p>
        </div>
      </section>

      <Section id="pricing" pad="tall">
        <SectionHead
          title="Пять конфигураций"
          lead="Слот — это одна вакансия в активной работе. Закрыли позицию, переводим слот на следующую."
        />
        <Pricing />
      </Section>

      {/* Разбор идёт после цен, а не до: человек из поиска сначала
          хочет увидеть цифру, и только потом готов слушать, почему
          она такая */}
      <Section tone="muted" pad="tall">
        <SectionHead
          eyebrow="С чем сравнивать"
          title="Отдел найма в штате и команда по подписке."
          lead="Считаем открыто: оклады, взносы сверх окладов и доступы к базам резюме. Цифры для рынка Казани и Москвы, под ваш город пересчитаем на диагностике."
        />
        <div className="mt-12">
          <CostComparison />
          <BeyondSalary />
        </div>
      </Section>

      <Section width="narrow" pad="tight">
        <SectionHead
          title="Что входит в цену и чего в ней нет"
          align="center"
        />

        <div className="mt-10 space-y-6">
          <Item title="Входит: работа команды, а не количество резюме">
            Recruitment lead отвечает за стратегию и качество, рекрутер ведёт
            кандидатов, research-функция расширяет воронку. Вы платите
            за мощность команды на ваших вакансиях, а не за штуки присланных
            профилей.
          </Item>
          <Item title="Входит: полный цикл по активной вакансии">
            Профиль позиции, поиск, первичные интервью, координация встреч,
            сопровождение до выхода и еженедельный отчёт с цифрами воронки.
          </Item>
          <Item title="Не входит: платные размещения на job-площадках">
            Если под вашу позицию нужны платные публикации или доступы сверх
            наших, это обсуждается отдельно и заранее, а не появляется
            в счёте постфактум.
          </Item>
          <Item title="Не входит: проценты за закрытие">
            Оплата фиксированная. Закрыли за две недели или за два месяца —
            сумма одна и та же, и агентство заинтересовано в скорости,
            а не в дорогом кандидате.
          </Item>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Минимальный срок сотрудничества 3 месяца.
        </p>
      </Section>

      <Section tone="dark" width="narrow">
        <SectionHead
          tone="dark"
          title="Посчитаем под ваш план найма"
          lead="За 20 минут разберём вакансии, сравним модели и покажем, какая конфигурация нужна именно вам. Если подписка невыгодна, скажем об этом прямо."
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link href="/#diagnostic">Получить расчёт</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/audit">Сначала проверить свой найм</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}

function Item({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b pb-6 last:border-0">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
