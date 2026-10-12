import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TARIFFS, pricePerSlot } from "@/lib/marketing/inhouse-cost";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { SITE_GUTTER, SITE_GUTTER_BLEED, SPLIT_EVEN } from "./layout";

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
 * Числа берутся из того же места, что и ценник в первом экране
 * и калькулятор: цена, разошедшаяся между двумя экранами одной
 * страницы, убивает доверие быстрее, чем любая формулировка.
 *
 * Карточки — не строки одной таблицы, а пять раздельных плиток на
 * симметричной дуге: крайние (Старт, Масштаб) стоят ниже всех, соседи центра
 * (Стандарт, Бизнес) выше на 10px, средняя (Развитие, она же t.recommended) — на 20px.
 * Дуга рисуется верхним краем коробки: плитка тянется вверх отрицательным
 * отступом, а её внутренний верх на столько же толще, поэтому название, цена и все
 * строки ниже стоят на общих линиях — разброс цен по высоте 0 (замер 11.10.2026:
 * было 66px на 1920, потому что плитки выравнивались по низу и разной высоты, а
 * плашка «Рекомендуем» стояла в потоке и сдвигала цену центральной на 51px).
 * Плашка не в потоке вовсе: она лежит на верхней кромке плитки.
 */
export function Pricing() {
  const базовый = pricePerSlot(TARIFFS[0]);

  return (
    <div className="flow-root">
      {/*
        На телефоне и планшете пять карточек в столбик или в два ряда —
        это экран прокрутки целиком или неровная сетка ради того, чтобы
        увидеть пятую цену. Ниже 2xl — не сетка, а горизонтальная
        лента со snap: свайп переключает карточки, как барабан рулетки,
        и всегда видна кромка соседней — подсказка, что ряд не кончился
        на первой. Дуга размеров (шире к центру) — приём для широкого
        ряда, где все пять видно разом; в ленте карточки листают по
        одной, и она там не нужна и не включается раньше 2xl.

        Граница 2xl (1536), а не стандартный lg: базовый размер продукта
        поднят до 125% (app/globals.css), и пять колонок с неразрывными
        ценами вроде «250 000 ₽» (224px) помещаются, только если карточка
        от 264px: у px-4 и промежутка gap-3 на 1536 запас 16px. С px-5 и
        gap-4 пятой карточке на 1536 не хватало 54px, и она выступала за
        край окна на 12px (замер 11.10.2026). Меняешь базовый размер,
        отступы карточек или промежуток — перемеряй границу, сама она
        не подстроится (tests/e2e/site-grid.spec.ts).

        SITE_GUTTER_BLEED и SITE_GUTTER выводят ленту из боковых полей раздела
        на их величину на каждой ширине (20 · 32 · 56): лента уходит под край
        окна, а карточка не обрывается в пустоте. Раньше стояло -mx-5 px-5 —
        поправка на мобильное поле, и на 1280 и 1440 лента кончалась за 45px
        до края. pt-4 — место под плашку «Рекомендуем» (overflow-x у ленты
        обрезает и по вертикали); -mt-4 забирает это место из зазора после
        заголовка, чтобы видимый интервал до первой плитки остался общими
        50px, а не 70 (замечание проверки к PR #118, 12.10.2026). Корень
        flow-root не даёт отрицательному отступу схлопнуться с отступом
        заголовка и сдвинуть сам корень: он по-прежнему ровно в 50px.
        С 2xl лента — сетка без обрезки, там пара не нужна (2xl:mt-0 2xl:pt-0);
        дуга поднимает центральную плитку на 20px выше края — это её цена.
      */}
      <div
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto -mt-4 pt-4 pb-2",
          SITE_GUTTER_BLEED,
          SITE_GUTTER,
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "2xl:mx-0 2xl:mt-0 2xl:grid 2xl:snap-none 2xl:gap-3 2xl:overflow-visible 2xl:px-0 2xl:pt-0 2xl:pb-0",
          "2xl:grid-cols-[1fr_1.1fr_1.22fr_1.1fr_1fr]",
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
                "relative flex flex-col rounded-2xl border p-5",
                // Ширина меньше экрана — кромка соседней карточки видна
                // у края, это и читается как «здесь можно листать
                // дальше». От 2xl карточка снова обычная ячейка сетки
                "w-[78%] max-w-[300px] shrink-0 snap-center",
                "2xl:w-auto 2xl:max-w-none 2xl:shrink 2xl:snap-align-none 2xl:px-4",
                // Тень есть у каждой карточки — плитка физически лежит
                // на странице, а не нарисована на ней. У рекомендованной
                // она ровно вдвое плотнее остальных: это тоже часть
                // выделения центра, а не только тёмный фон
                t.recommended
                  ? "border-white/25 bg-brand-graphite text-white shadow-xl shadow-black/15"
                  : "border-border bg-card shadow-xl shadow-black/[0.075]",
                // Дуга: соседи центра и сам центр тянутся вверх отрицательным
                // отступом на 10 и 20px, а внутренний верх толще на столько же
                // (pt-7 = 25 + 10, pt-9 = 25 + 20): название и цена остаются
                // на общей линии со всеми плитками, поднимается только коробка.
                // Низ у всех общий — ячейки сетки растянуты по высоте ряда
                уровень === 1 && "2xl:-mt-2 2xl:pt-7",
                уровень === 2 && "2xl:-mt-4 2xl:pt-9",
              )}
            >
              {t.recommended && (
                // Не в потоке: лежит на верхней кромке плитки и не сдвигает
                // название и цену. Сплошной фон и контур, как у самой плитки,
                // иначе половина плашки над кромкой — белый текст на светлой странице
                <div className="absolute -top-3 left-5 inline-flex w-fit items-center rounded-full border border-white/25 bg-brand-graphite px-3 py-0.5 text-xs font-medium tracking-[0.08em] text-white uppercase 2xl:left-4">
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

              {/* Один размер у всех: у центральной цена была крупнее, и на телефоне (28 и 36px)
                  это двигало нижние строки её плитки относительно соседних */}
              <div className="mt-4 text-3xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
                {formatMoney(t.price)}
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
                <span className="tabular-nums">{formatMoney(заСлот)}</span> за
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
        всего тарифов впереди. От 2xl скрыты — там уже не лента, а вся
        дуга видна разом, и считать нечего.

        Точки не подсвечивают текущую позицию (это потребовало бы
        либо JS-слежения за скроллом, либо именованных scroll-timeline,
        которые здесь не на чем было надёжно проверить вживую) — только
        сообщают «их пять». Простая и гарантированно рабочая версия
        лучше эффектной, но непроверенной.
      */}
      <div
        aria-hidden
        className="mt-3 flex justify-center gap-1.5 2xl:hidden"
      >
        {TARIFFS.map((t) => (
          <span
            key={t.slots}
            className="size-1.5 rounded-full bg-foreground/25"
          />
        ))}
      </div>

      <div className={`mt-6 ${SPLIT_EVEN} lg:items-start`}>
        <div>
          <h3 className="text-2xl font-medium">Что входит в любой тариф</h3>
          <ul className="mt-4 space-y-3 text-lg">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-3">
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
