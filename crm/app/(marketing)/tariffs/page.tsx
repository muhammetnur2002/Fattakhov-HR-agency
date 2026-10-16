import type { Metadata } from "next";
import Link from "next/link";

import { BeyondSalary } from "@/components/marketing/beyond-salary";
import { CostCalculator } from "@/components/marketing/cost-calculator";
import { Pricing } from "@/components/marketing/pricing";
import { Section, SectionHead } from "@/components/marketing/sections";
import { Button } from "@/components/ui/button";
import { ENTRY_PRICE, TARIFFS, pricePerSlot } from "@/lib/marketing/inhouse-cost";
import { formatMoney } from "@/lib/format-money";
import { PageHero, PageIntro } from "@/components/marketing/page-intro";
import { StructuredData } from "@/components/marketing/structured-data";
import { pageMetadata } from "@/lib/marketing/seo";

export const metadata: Metadata = pageMetadata("tariffs");

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
      <StructuredData page="tariffs" />
      <PageHero>
        <PageIntro eyebrow="Тарифы" title="Сколько стоит внешняя команда найма">
          От {formatMoney(ENTRY_PRICE)} в месяц за одну вакансию
          в активной работе. Цена растёт медленнее объёма: на пяти
          вакансиях слот обходится на {дешевле}% дешевле, чем на одной.
          Ниже открытый прайс и расчёт, с чем его сравнивать.
        </PageIntro>
      </PageHero>

      <Section id="pricing">
        <SectionHead
          title="Пять конфигураций"
          lead="Слот — это одна вакансия в активной работе. Закрыли позицию, переводим слот на следующую."
        />
        <Pricing />
      </Section>

      {/* Разбор идёт после цен, а не до: человек из поиска сначала
          хочет увидеть цифру, и только потом готов слушать, почему
          она такая */}
      <Section tone="muted">
        <SectionHead
          eyebrow="С чем сравнивать"
          title="Отдел найма в штате и команда по подписке."
          lead="Считаем открыто: оклады, взносы сверх окладов и доступы к базам резюме. Оклады у всех разные, поэтому цифры здесь ваши: подставьте свои и сравните с подпиской."
        />
        <CostCalculator />
        <BeyondSalary />
      </Section>

      <Section width="narrow">
        <SectionHead
          title="Что входит в цену и чего в ней нет"
          align="center"
        />

        <div className="space-y-6">
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

        <p className="mt-6 text-sm text-muted-foreground">
          Минимальный срок сотрудничества 3 месяца.
        </p>
      </Section>

      <Section tone="dark" width="narrow">
        <SectionHead
          tone="dark"
          title="Посчитаем под ваш план найма"
          lead="За 20 минут разберём вакансии, сравним модели и покажем, какая конфигурация нужна именно вам. Если подписка невыгодна, скажем об этом прямо."
        />
        <div className="flex flex-wrap gap-3">
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
