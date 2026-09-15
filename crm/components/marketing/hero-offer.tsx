import { CountUp } from "@/components/motion/primitives";
import {
  COMPARABLE_TARIFF,
  ENTRY_PRICE,
  annualSavings,
  inhouseMonthlyCost,
} from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";

/**
 * Ценник в первом экране.
 *
 * Занимает правую половину экрана вместо фирменного знака. Знак красив,
 * но не работает: человек пришёл с рекламы и решает за три секунды,
 * читать ли дальше. Знак на это решение не влияет, разница в деньгах
 * влияет.
 *
 * Главное число здесь не процент и не цена, а сумма, остающаяся
 * в компании за год. Процент абстрактен, цену человек сравнивает
 * с другими агентствами, а годовую сумму примеряет на свой бюджет,
 * потому что в этих единицах бюджет и обсуждают.
 *
 * Зачёркнутая цена сверху - единственный приём распродажи, который
 * здесь уместен, и работает он только потому, что число настоящее
 * и разобрано строкой ниже по экрану. Без разбора это была бы
 * обычная наклейка со скидкой.
 */
export function HeroOffer() {
  const inhouse = inhouseMonthlyCost().total;
  const saved = annualSavings();

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/12 backdrop-blur-sm md:p-7">
      <div className="text-sm font-medium tracking-[0.14em] text-white/65 uppercase">
        Свой отдел найма
      </div>
      <div className="mt-1.5 text-3xl font-medium text-white/45 line-through decoration-white/35 decoration-2">
        {formatNumber(inhouse)} ₽ в месяц
      </div>

      <div className="mt-6 border-t border-white/12 pt-6">
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
          в месяц, {COMPARABLE_TARIFF.slots} вакансии одновременно за{" "}
          {/* Неразрывный: иначе на телефоне «₽» уезжает на свою строку */}
          {formatNumber(COMPARABLE_TARIFF.price)} ₽
        </div>
      </div>

      {/* Ради этой строки блок и существует */}
      <div className="mt-6 rounded-xl bg-white px-5 py-4 text-brand-graphite">
        <div className="text-sm font-medium tracking-[0.12em] uppercase opacity-75">
          Остаётся в компании
        </div>
        <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums lg:text-5xl">
          <CountUp value={saved} /> ₽
        </div>
        <div className="mt-0.5 text-base opacity-75">
          за год, на трёх параллельных вакансиях
        </div>
      </div>
    </div>
  );
}
