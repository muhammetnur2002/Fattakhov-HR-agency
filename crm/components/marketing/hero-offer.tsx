import { CountUp } from "@/components/motion/primitives";
import {
  COMPARABLE_TARIFF,
  ENTRY_PRICE,
  TOP_TARIFF,
  pricePerSlot,
} from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";

/**
 * Ценник в первом экране.
 *
 * Занимает правую половину экрана вместо фирменного знака. Знак красив,
 * но не работает: человек пришёл с рекламы и решает за три секунды,
 * читать ли дальше. Знак на это решение не влияет, цена влияет.
 *
 * Здесь только то, что подтверждено: цена входа и цена одной вакансии
 * на самом большом тарифе, и вторая считается из первой арифметикой.
 * Сравнения со своим отделом найма на первом экране нет: оно держалось
 * на окладах, которые агентство назвать не может, а на самом видном
 * месте страницы число обязано выдерживать проверку. Сравнение стоит
 * ниже, в калькуляторе, и считает по цифрам самого читателя.
 */
export function HeroOffer() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/12 backdrop-blur-sm md:p-7">
      <div className="text-sm font-medium tracking-[0.14em] text-white/65 uppercase">
        Команда по подписке
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-base text-white/70">от</span>
        <span className="text-6xl font-semibold tracking-tight tabular-nums lg:text-7xl">
          {formatNumber(ENTRY_PRICE)}
        </span>
        <span className="text-3xl font-semibold">₽</span>
      </div>
      <div className="mt-1 text-base text-white/70">
        в месяц за одну вакансию в работе. {COMPARABLE_TARIFF.title} одновременно
        — {formatNumber(COMPARABLE_TARIFF.price)}&nbsp;₽
      </div>

      {/* Ради этой строки блок и существует: чем больше вакансий,
          тем дешевле каждая, и это видно одним числом */}
      <div className="mt-6 rounded-xl bg-white px-5 py-4 text-brand-graphite">
        <div className="text-sm font-medium tracking-[0.12em] uppercase opacity-75">
          Одна вакансия в работе
        </div>
        <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums lg:text-5xl">
          <CountUp value={pricePerSlot(TOP_TARIFF)} />&nbsp;₽
        </div>
        <div className="mt-0.5 text-base opacity-75">
          в месяц, если их {TOP_TARIFF.slots}: тариф «{TOP_TARIFF.name}»,{" "}
          {formatNumber(TOP_TARIFF.price)}&nbsp;₽ за все
        </div>
      </div>
    </div>
  );
}
