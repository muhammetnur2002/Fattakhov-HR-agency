import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TARIFFS, pricePerSlot } from "@/lib/marketing/inhouse-cost";
import { formatNumber } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const INCLUDED = [
  "Выделенная команда",
  "Полный цикл по активным вакансиям",
  "Еженедельная аналитика и отчёт",
  "Ежемесячная оплата",
];

/**
 * Тарифная лестница.
 *
 * Показаны все пять конфигураций сразу, а не переключателем. Селектор
 * прячет четыре цены из пяти, и человек видит одно число, которое не
 * с чем сравнить. Открытая лестница делает работу за продавца: слот
 * дешевеет вдвое от первого к пятому, и это видно без объяснений.
 *
 * Цена за слот считается, а не пишется руками: при правке тарифа
 * подпись не должна остаться от старой цены.
 *
 * Числа берутся из того же места, что и блок сравнения со штатом:
 * цена, разошедшаяся между двумя экранами одной страницы, убивает
 * доверие быстрее, чем любая формулировка.
 *
 * Карточки — не строки одной таблицы, а пять раздельных плиток на
 * симметричной дуге размеров: крайние (Старт, Масштаб) — базового
 * размера, соседние с центром (Стандарт, Бизнес) — чуть крупнее,
 * средняя (Развитие, она же t.recommended) — крупнее всех. Дуга
 * задана и шириной колонки, и внутренним отступом карточки, и её
 * подъёмом вверх (все три растут вместе, иначе «крупнее» читалось бы
 * как «шире, но такой же приплюснутой»), поэтому глаз видит одну
 * растущую фигуру, а не рассинхронизированные полоски.
 */
export function Pricing() {
  const базовый = pricePerSlot(TARIFFS[0]);

  return (
    <div className="mt-12">
      {/*
        На телефоне и планшете пять карточек в столбик или в два ряда —
        это экран прокрутки целиком или неровная сетка ради того, чтобы
        увидеть пятую цену. Ниже lg (то есть везде, кроме ноутбука и
        шире) — не сетка, а горизонтальная лента со snap: свайп
        переключает карточки, как барабан рулетки, и всегда видна
        кромка соседней — подсказка, что ряд не кончился на первой.
        Дуга размеров (шире к центру) — приём для широкого ряда, где
        все пять видно разом; в ленте карточки листают по одной, и она
        там не нужна и не включается раньше lg.

        -mx-5/px-5 компенсируют боковой отступ секции (Section даёт
        px-5): без этого лента прокрутки не доезжала бы до края экрана,
        и «рулетка» упиралась бы в невидимую стену раньше времени.
      */}
      <div
        className={cn(
          "-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "lg:mx-0 lg:grid lg:snap-none lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0",
          "lg:grid-cols-[1fr_1.1fr_1.22fr_1.1fr_1fr] lg:items-end",
        )}
      >
        {TARIFFS.map((t, i) => {
          const заСлот = pricePerSlot(t);
          const дешевле = Math.round((1 - заСлот / базовый) * 100);

          // Позиция на дуге: 0 — край, 1 — сосед центра, 2 — центр
          const уровень = i === 2 ? 2 : i === 1 || i === 3 ? 1 : 0;

          return (
            <div
              key={t.slots}
              className={cn(
                "flex flex-col rounded-2xl border p-6",
                // Ширина меньше экрана — кромка соседней карточки видна
                // у края, это и читается как «здесь можно листать
                // дальше». От lg карточка снова обычная ячейка сетки
                "w-[78%] max-w-[300px] shrink-0 snap-center",
                "lg:w-auto lg:max-w-none lg:shrink lg:snap-align-none",
                // Тень есть у каждой карточки — плитка физически лежит
                // на странице, а не нарисована на ней. У рекомендованной
                // она ровно вдвое плотнее остальных: это тоже часть
                // выделения центра, а не только тёмный фон
                t.recommended
                  ? "border-transparent bg-brand-graphite text-white shadow-xl shadow-black/15"
                  : "border-border bg-card shadow-xl shadow-black/[0.075]",
                // Соседи центра и сам центр приподняты и заметнее отступают
                // внутри — эффект дуги, а не просто более широкая колонка
                уровень === 1 && "lg:-mt-2 lg:p-7",
                уровень === 2 && "lg:-mt-4 lg:p-8",
              )}
            >
              {t.recommended && (
                <div className="mb-3 inline-flex w-fit items-center rounded-full bg-white/15 px-2.5 py-1 text-sm font-medium tracking-[0.08em] text-white uppercase">
                  Рекомендуем
                </div>
              )}

              <div
                className={cn(
                  "text-sm font-medium tracking-[0.12em] uppercase",
                  t.recommended ? "text-white/70" : "text-muted-foreground",
                )}
              >
                {t.name}
              </div>

              <div
                className={cn(
                  "mt-4 font-semibold tracking-tight whitespace-nowrap tabular-nums",
                  уровень === 2 ? "text-4xl" : "text-3xl",
                )}
              >
                {formatNumber(t.price)} ₽
              </div>
              <div
                className={cn(
                  "text-base",
                  t.recommended ? "text-white/65" : "text-muted-foreground",
                )}
              >
                в месяц
              </div>

              <div
                className={cn(
                  "mt-4 border-t pt-4 text-base font-medium",
                  t.recommended ? "border-white/15" : "border-border",
                )}
              >
                {t.slots} {склонение(t.slots)} одновременно
              </div>
              <p
                className={cn(
                  "mt-1 text-sm leading-relaxed",
                  t.recommended ? "text-white/65" : "text-muted-foreground",
                )}
              >
                {t.note}
              </p>

              {/* Ради этой строки лестница и показана целиком */}
              <div
                className={cn(
                  "mt-auto pt-6 text-sm",
                  t.recommended ? "text-white/70" : "text-muted-foreground",
                )}
              >
                <span className="tabular-nums">{formatNumber(заСлот)} ₽</span> за
                слот
                {дешевле > 0 ? (
                  <span
                    className={cn(
                      "block font-medium",
                      t.recommended ? "text-white" : "text-foreground",
                    )}
                  >
                    на {дешевле}% дешевле входа
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Пять точек — не декор, а счётчик: край соседней карточки в
        ленте подсказывает «листай дальше», но не говорит, сколько
        всего тарифов впереди. От lg скрыты — там уже не лента, а вся
        дуга видна разом, и считать нечего.

        Точки не подсвечивают текущую позицию (это потребовало бы
        либо JS-слежения за скроллом, либо именованных scroll-timeline,
        которые здесь не на чем было надёжно проверить вживую) — только
        сообщают «их пять». Простая и гарантированно рабочая версия
        лучше эффектной, но непроверенной.
      */}
      <div
        aria-hidden
        className="mt-3 flex justify-center gap-1.5 lg:hidden"
      >
        {TARIFFS.map((t) => (
          <span
            key={t.slots}
            className="size-1.5 rounded-full bg-foreground/25"
          />
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div>
          <h3 className="text-2xl font-medium">Что входит в любой тариф</h3>
          <ul className="mt-4 space-y-2.5 text-lg">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-2.5">
                <Check className="mt-1.5 size-4 shrink-0 text-primary" />
                {i}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base text-muted-foreground">
            Минимальный срок сотрудничества 3 месяца.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-2xl font-medium">Что такое активный слот</h3>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
            Один слот это одна вакансия в активной работе. Закрыли позицию,
            переводим слот на следующую, сохраняя темп и накопленный контекст
            по вашему рынку. Вы платите за мощность команды, а не за отдельные
            резюме.
          </p>
          <Button asChild size="lg" className="mt-6">
            <a href="#diagnostic">Рассчитать под мой план</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** «5 слота» на сайте агентства - опечатка, здесь она не повторяется. */
function склонение(n: number): string {
  const д = n % 10;
  const с = n % 100;
  if (д === 1 && с !== 11) return "вакансия";
  if (д >= 2 && д <= 4 && (с < 12 || с > 14)) return "вакансии";
  return "вакансий";
}
