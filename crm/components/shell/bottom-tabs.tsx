"use client";

import { ArrowLeft, Ellipsis, Lock, X } from "lucide-react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";

import { NAV_ICONS, type NavIconName } from "./icons";
import { Logo } from "@/components/brand/logo";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

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
      data-lens
      className="absolute inset-0 rounded-[24px] bg-primary shadow-[0_3px_10px_-4px_rgb(0_0_0/0.45)]"
    />
  );
}

/** Без касания панели дольше этого — она становится прозрачной. */
const FADE_IDLE_MS = 3000;
/** Сколько после последнего события прокрутки она считается «листают». */
const FADE_SCROLL_SETTLE_MS = 700;
/** Сколько после касания (и смены раздела) прокрутка её не гасит. */
const FADE_QUIET_AFTER_TAP_MS = 800;

/**
 * Панель вкладок прозрачнеет, когда не нужна (просьба заказчика 05.10.2026):
 * пока страница прокручивается и когда панель не трогали дольше FADE_IDLE_MS.
 * Касание или фокус с клавиатуры возвращают обычный вид — человек видит,
 * куда жмёт, — и отсчёт начинается заново. Вид обоих состояний — правила
 * [data-bottom-tabs] в globals.css; здесь только метка data-dim.
 *
 * Нажатия работают в любом виде. После касания прокрутка какое-то время
 * панель не гасит: переход на другой раздел прокручивает новую страницу
 * наверх, и без этой паузы панель мигнула бы под пальцем.
 *
 * Метка ставится прямо на элемент, без состояния React: прокрутка — десятки
 * событий в секунду, перерисовывать панель на каждое незачем. Слушаем
 * document с захватом: событие scroll не всплывает, а прокручиваться может
 * не только окно, но и вложенный список.
 */
function useFadeWhenIdle(ref: RefObject<HTMLElement | null>, pathname: string) {
  const quietUntil = useRef(0);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    let lastTouch = performance.now();
    let scrolling = false;
    let idleTimer: number | undefined;
    let settleTimer: number | undefined;

    const apply = () => {
      // Запас в 50 мс: таймер срабатывает не раньше срока, но округление
      // performance.now() может дать на волос меньше
      const idle = performance.now() - lastTouch >= FADE_IDLE_MS - 50;
      if (scrolling || idle) nav.dataset.dim = "";
      else delete nav.dataset.dim;
    };
    const armIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(apply, FADE_IDLE_MS);
    };
    const onScroll = () => {
      if (performance.now() < quietUntil.current) return;
      scrolling = true;
      apply();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        scrolling = false;
        apply();
      }, FADE_SCROLL_SETTLE_MS);
    };
    const onTouch = () => {
      lastTouch = performance.now();
      quietUntil.current = lastTouch + FADE_QUIET_AFTER_TAP_MS;
      scrolling = false;
      window.clearTimeout(settleTimer);
      apply();
      armIdle();
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    nav.addEventListener("pointerdown", onTouch);
    nav.addEventListener("focusin", onTouch);
    armIdle();
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      nav.removeEventListener("pointerdown", onTouch);
      nav.removeEventListener("focusin", onTouch);
      window.clearTimeout(idleTimer);
      window.clearTimeout(settleTimer);
    };
  }, [ref]);

  // Новый раздел открылся не касанием панели (ссылка на странице, назад) —
  // его прокрутка наверх не «листают». Только при смене раздела, не при
  // первом открытии: иначе листание в первую секунду после загрузки панель
  // не трогало бы. Отсчёт трёх секунд смена раздела не сбрасывает —
  // считается касание самой панели
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    quietUntil.current = performance.now() + FADE_QUIET_AFTER_TAP_MS;
  }, [pathname]);
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
 * Пока человек печатает, панель уезжает вниз (globals.css, правило про
 * data-bottom-tabs): клавиатура и так занимает половину экрана. Экран,
 * которому она мешает целиком (открытая переписка), убирает её меткой
 * data-hides-bottom-tabs — там же.
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
  const navRef = useRef<HTMLElement>(null);
  useFadeWhenIdle(navRef, pathname);

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
    "relative flex min-h-[46px] flex-1 touch-manipulation select-none flex-col items-center justify-center gap-[3px] rounded-[24px] text-[10px] leading-none tracking-tight max-[350px]:text-[9px] transition-[color,transform,opacity,filter] duration-150 [-webkit-tap-highlight-color:transparent] active:scale-[0.95] motion-reduce:transition-none";

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Разделы"
        data-bottom-tabs
        // Стекло — фон, размытие, кромка и блики — в globals.css
        // ([data-bottom-tabs]): там же вид при прокрутке, рядом
        className="fixed inset-x-4 bottom-[var(--tabbar-offset)] z-40 mx-auto flex max-w-[400px] items-stretch gap-0.5 rounded-[28px] border p-1 max-[350px]:inset-x-2 transition-[transform,opacity,background-color,border-color,box-shadow,backdrop-filter] duration-200 motion-reduce:transition-none md:hidden print:hidden"
      >
        {tabs.map((item) => {
          const Icon = NAV_ICONS[item.icon as NavIconName];
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              // Для прозрачного вида панели: плашка почти исчезает, и активную
              // вкладку красит акцентом сам текст (globals.css)
              data-active={active || undefined}
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
                    <span
                      data-badge
                      className={cn(
                        "absolute -top-1 -right-2.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-destructive px-1 text-[9.5px] leading-none font-semibold text-white tabular-nums",
                        // Кольцо цвета плашки, а не панели: значок садится
                        // «в вырез», а не лежит поверх плашки заплаткой
                        active ? "ring-2 ring-primary" : "ring-2 ring-background",
                      )}
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5">{item.label}</span>
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          data-active={moreActive || undefined}
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

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[88svh] gap-0 rounded-t-[28px] border-none bg-brand-graphite p-0 text-white"
        >
          {/* Ручка: подсказка, что шторку можно закрыть, потянув вниз */}
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-white/25" />

          {/*
            Размеры в шторке — пикселями, а не шкалой кабинета: она
            выводится порталом вне .cabinet-shell и на переменные --text-*
            кабинета не реагирует
          */}
          <SheetHeader className="flex-row items-center gap-3 px-4 pt-2.5 pb-2.5">
            <Logo variant="mark" tone="light" className="h-6 shrink-0" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[15px] leading-tight font-semibold text-white">
                {title}
              </SheetTitle>
              <SheetDescription className="text-[11px] leading-tight text-white/60">
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
                    onClick={() => setMore(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-[68px] touch-manipulation flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center text-[12px] leading-tight transition-colors [-webkit-tap-highlight-color:transparent] active:bg-white/[0.16]",
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
                      <span className="absolute top-1.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-brand-graphite">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            <a
              href={siteHref}
              className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-2xl text-[13px] text-white/55 transition-colors active:bg-white/[0.08]"
            >
              <ArrowLeft className="size-4" />
              На сайт
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
