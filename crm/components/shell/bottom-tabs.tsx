"use client";

import { Ellipsis, Lock, X } from "lucide-react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { NAV_ICONS, type NavIconName } from "./icons";
import { TabbarDebug } from "./tabbar-debug";
import { Logo } from "@/components/brand/logo";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { navLinkLabel } from "@/lib/nav-links";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/count-badge";
import { useReturnFocus } from "@/lib/hooks/use-return-focus";
import { useTabbarVisibility } from "@/lib/hooks/use-tabbar-visibility";

/**
 * Плашка под активной вкладкой. Объявлена здесь, а не внутри BottomTabs:
 * компонент, созданный во время отрисовки, пересоздавался бы при каждой
 * перерисовке и терял состояние — layoutId не мог бы связать старое
 * положение плашки с новым, и переезд превратился бы в мигание.
 *
 * Цвет — фирменный акцент (--primary), как у активных фильтров и кнопок
 * в остальном кабинете. В CRM агентства плашка была графитом знака, но
 * там графит и был --primary; здесь единственный акцент — серо-голубой,
 * и в обеих темах он один и тот же, поэтому отдельного тёмного варианта
 * нет.
 */
function Lens({ transition }: { transition: Transition }) {
  return (
    <motion.span
      layoutId="bottom-tab-lens"
      transition={transition}
      aria-hidden
      className="absolute inset-0 rounded-[24px] bg-primary shadow-[0_3px_10px_-4px_rgb(0_0_0/0.45)]"
    />
  );
}

/*
  Узкие экраны (до 350 точек — iPhone SE первого поколения и подобные):
  замер 22.09.2026 показал, что при 320 текст «Вакансии» упирался
  в края активной плашки (запас 0), а подписи соседних вкладок
  отстояли на 2 точки. Подпись 9px и поля панели 8px возвращают
  запас в 3–4 точки. Типичные 360–390 не затронуты.
*/

/**
 * Нижняя панель разделов на телефоне.
 *
 * Плавающая капсула, а не полоса на всю ширину с линией сверху. Первая
 * версия была ровно такой полосой — и читалась как элемент веб-страницы,
 * а не как приложение (заказчик её отвергла): активная вкладка
 * отличалась одной жирностью подписи. Теперь панель парит над содержимым
 * с зазором от краёв экрана, фон стеклянный (размывает то, что под ним),
 * а активный раздел подсвечен плашкой, которая переезжает от вкладки
 * к вкладке.
 *
 * Подписи остались у всех вкладок, не только у активной. Соблазн убрать
 * их у неактивных понятен — так выходит компактнее, — но значки
 * «Вакансии» (портфель) и «Кандидаты» (люди) без слов не очевидны,
 * а кабинет открывают не каждый день.
 *
 * Пока человек листает страницу вниз, панель прячется, а на прокрутку
 * вверх, остановку, начало и конец страницы, смену раздела и фокус внутри
 * неё возвращается (lib/tabbar-visibility.ts, метка data-hidden; просьба
 * владельца 17.10.2026). Раньше она не уезжала, а тускнела и возвращалась
 * только касанием — люди нажимали по памяти. Прячется только сдвигом
 * (без прозрачности), на собственном слое, а на iOS мгновенно, без
 * перехода, — иначе в Safari на iPhone она зависала на середине или
 * повисала посреди страницы (lib/hooks/use-tabbar-visibility.ts: доводка
 * перехода, самолечение положения, освежение слоя; globals.css). Временная
 * отладочная строка (components/shell/tabbar-debug.tsx) выводится рядом.
 *
 * Пока человек печатает, панель уезжает вниз (globals.css, правило про
 * data-bottom-tabs): клавиатура и так занимает половину экрана. Экран,
 * которому она мешает целиком (открытая переписка), убирает её меткой
 * data-hides-bottom-tabs — там же. Оба способа независимы.
 *
 * Отступ от низа — --tabbar-offset (globals.css): над жестовой полосой
 * iPhone, но не на всю её высоту. Плашка анимируется через layoutId;
 * при «уменьшить движение» в системе переезжает мгновенно.
 */
export function BottomTabs({
  items,
  title,
  roleLabel,
  siteHref,
}: {
  items: NavItem[];
  title: string;
  roleLabel: string;
  siteHref: string;
}) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [more, setMore] = useState(false);
  // Шторка открывается кнопкой «Ещё», но не через SheetTrigger: фокус возвращаем сами
  const returnFocus = useReturnFocus();
  const navRef = useRef<HTMLElement>(null);
  useTabbarVisibility(navRef, pathname, more);

  const tabs = items.filter((i) => i.mobileTab).slice(0, 4);
  // В «Ещё» — только то, чего нет во вкладках: четыре раздела из шторки
  // не должны повторяться, иначе она выглядит как копия сайдбара
  const rest = items.filter((i) => !tabs.includes(i));

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  // «Ещё» горит, только когда открыт раздел из неё. На странице вне меню
  // (поиск, уведомления, профиль компании) не горит ничего: подсветка
  // «Ещё» там врала бы
  const moreActive = rest.some(isActive);

  const lensTransition: Transition = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 40, mass: 0.8 };

  const itemClass =
    "relative flex min-h-[46px] flex-1 touch-manipulation select-none flex-col items-center justify-center gap-[3px] rounded-[24px] text-[10px] leading-none tracking-tight max-[350px]:text-[9px] transition-[color,transform] duration-150 [-webkit-tap-highlight-color:transparent] active:scale-[0.95] motion-reduce:transition-none";

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Разделы"
        data-bottom-tabs
        // Стекло — фон, размытие, кромка и блики — в globals.css
        // ([data-bottom-tabs]): там же вид спрятанной панели ([data-hidden]) и её
        // постоянный композитный слой. Выезд и появление — только transform за
        // --tabbar-slide-ms, без opacity: прозрачность у элемента с размытием фона, по
        // всей видимости, и зависала на середине в Safari на iPhone. На iOS перехода нет
        // вовсе (@supports в globals.css). При «уменьшить движение» мгновенно
        className="fixed inset-x-4 bottom-[var(--tabbar-offset)] z-40 mx-auto flex max-w-[400px] items-stretch gap-0.5 rounded-[28px] border p-1 max-[350px]:inset-x-2 transition-[transform] duration-(--tabbar-slide-ms) motion-reduce:transition-none md:hidden print:hidden"
      >
        {tabs.map((item) => {
          const Icon = NAV_ICONS[item.icon as NavIconName];
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={navLinkLabel(item)}
              className={cn(
                itemClass,
                active ? "font-medium text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {active && <Lens transition={lensTransition} />}
              <span className="relative flex flex-col items-center gap-[3px]">
                <span className="relative">
                  {Icon && (
                    <Icon
                      className="size-5"
                      strokeWidth={active ? 2.1 : 1.75}
                    />
                  )}
                  {/* Раздел до договора закрыт — тот же замок, что в боковом
                      меню, только значком у иконки: подпись и так на пределе
                      ширины при 320 */}
                  {item.locked && (
                    <Lock
                      aria-label="Откроется после договора"
                      className="absolute -right-2 -bottom-0.5 size-3 opacity-70"
                    />
                  )}
                  {!!item.badge && (
                    <CountBadge
                      aria-hidden
                      count={item.badge}
                      tone="alert"
                      className={cn(
                        "absolute -top-1.5 -right-3",
                        // Кольцо цвета плашки, а не панели: значок садится
                        // «в вырез», а не лежит поверх плашки заплаткой
                        active ? "ring-2 ring-primary" : "ring-2 ring-background",
                      )}
                    />
                  )}
                </span>
                <span className="max-w-full truncate px-0.5">{item.label}</span>
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={(e) => {
            returnFocus.remember(e.currentTarget);
            setMore(true);
          }}
          aria-haspopup="dialog"
          className={cn(
            itemClass,
            moreActive ? "font-medium text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {moreActive && <Lens transition={lensTransition} />}
          <span className="relative flex flex-col items-center gap-[3px]">
            <Ellipsis className="size-5" strokeWidth={moreActive ? 2.1 : 1.75} />
            <span>Ещё</span>
          </span>
        </button>
      </nav>

      {/* Временная отладочная строка: без флага в «Настройках» не рисует ничего */}
      <TabbarDebug navRef={navRef} />

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[88svh] gap-0 rounded-t-[28px] border-none bg-brand-graphite p-0 text-white"
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        >
          {/* Ручка: подсказка, что шторку можно закрыть, потянув вниз */}
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-white/25" />

          {/*
            Размеры в шторке — пикселями, а не шкалой кабинета: она
            выводится порталом вне .cabinet-shell и на переменные --text-*
            кабинета не реагирует
          */}
          <SheetHeader className="flex-row items-center gap-3 px-4 pt-2.5 pb-2.5">
            <a href={siteHref} aria-label="Fattakhov HR Agency — открыть сайт" className="shrink-0">
              <Logo variant="mark" tone="light" className="h-6" />
            </a>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-sm leading-tight font-semibold text-white">
                {title}
              </SheetTitle>
              <SheetDescription className="text-xs leading-tight text-white/60">
                {roleLabel}
              </SheetDescription>
            </div>
            <SheetClose
              aria-label="Закрыть"
              className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition-colors after:absolute after:-inset-1 after:content-[''] active:bg-white/20"
            >
              <X className="size-[18px]" />
            </SheetClose>
          </SheetHeader>

          <div className="min-h-0 overflow-y-auto px-4 pb-[calc(12px+var(--safe-bottom))]">
            <div className="grid grid-cols-3 gap-2">
              {rest.map((item) => {
                const Icon = NAV_ICONS[item.icon as NavIconName];
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      // Плитка уводит на другой раздел: фокус на «Ещё» после закрытия шторки гонялся бы
                      // с тем, что Next ставит сам на новой странице. Плитка текущего раздела никуда не
                      // ведёт — тогда фокус возвращается, как при «Закрыть»
                      if (item.href !== pathname) returnFocus.forget();
                      setMore(false);
                    }}
                    aria-current={active ? "page" : undefined}
                    aria-label={navLinkLabel(item)}
                    className={cn(
                      "relative flex min-h-[68px] touch-manipulation flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center text-xs leading-tight transition-colors [-webkit-tap-highlight-color:transparent] active:bg-white/[0.16]",
                      active
                        ? "bg-white/[0.16] font-medium text-white ring-1 ring-white/25"
                        : "bg-white/[0.06] text-white/85",
                    )}
                  >
                    {Icon && <Icon className="size-[22px]" strokeWidth={1.75} />}
                    <span className="line-clamp-2">{item.label}</span>
                    {item.locked && (
                      <Lock
                        aria-label="Откроется после договора"
                        className="absolute top-2 left-2 size-3 text-white/45"
                      />
                    )}
                    {!!item.badge && (
                      <CountBadge
                        aria-hidden
                        count={item.badge}
                        tone="inverse"
                        className="absolute top-1.5 right-1.5"
                      />
                    )}
                  </Link>
                );
              })}
            </div>

          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
