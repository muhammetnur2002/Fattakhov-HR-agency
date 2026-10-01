"use client";

import { Menu, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MARKETING_LINKS } from "@/lib/marketing/nav";

/**
 * Меню сайта на телефоне и планшете.
 *
 * До этого разделы в шапке на экранах уже 1280 просто прятались,
 * и открыть их было нечем: «Кейсы», «Тарифы» и «Аудит найма» с телефона
 * находились только прокруткой главной до подвала, а с внутренней
 * страницы — никак. Шторка — общий Sheet из components/ui/sheet.tsx
 * (Radix Dialog): фокус внутри, закрытие по Esc и по тапу мимо, фокус
 * после закрытия возвращается на кнопку меню. Своих механик здесь нет,
 * и заводить их не стоит.
 *
 * Здесь же телефон целиком и вход в кабинет: в узкой шапке для них
 * места нет, а убирать совсем нельзя — по номеру звонят те, кто не
 * будет заполнять форму, а входом пользуются действующие клиенты.
 *
 * Открытость держим сами: переход по ссылке должен закрыть шторку.
 * Макет сайта между страницами не перемонтируется, и без явного
 * закрытия панель осталась бы висеть поверх новой страницы; а при
 * переходе к разделу той же страницы («/#how») смены страницы нет
 * вовсе.
 */
export function MarketingMobileMenu({
  phoneHref,
  phoneDisplay,
  loginHref,
  registerHref,
  studentsHref = null,
}: {
  phoneHref: string;
  phoneDisplay: string;
  loginHref: string;
  /** Регистрация компании в приложении — туда ведёт «Обсудить найм». */
  registerHref: string;
  /** Студенческая платформа — отдельное приложение; нет адреса — нет пункта. */
  studentsHref?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 lg:hidden"
          aria-label="Открыть меню"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-80 max-w-[85vw] gap-0 p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle asChild>
            <div>
              <Logo variant="lockup" className="h-8" />
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Разделы сайта, телефон и вход в кабинет
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="Разделы сайта" className="flex flex-col px-2 py-3">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="rounded-md px-3 py-3 text-lg text-foreground transition-colors hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
          {studentsHref && (
            <a
              href={studentsHref}
              onClick={close}
              className="rounded-md px-3 py-3 text-lg text-foreground transition-colors hover:bg-muted"
            >
              Студентам
            </a>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t px-5 py-5">
          <a
            href={phoneHref}
            className="flex items-center gap-2 py-2 text-base text-foreground"
          >
            <Phone className="size-4 text-muted-foreground" />
            {phoneDisplay}
          </a>
          <Button asChild variant="outline" className="h-11">
            <a href={loginHref} onClick={close}>
              Войти в кабинет
            </a>
          </Button>
          <Button asChild className="h-11">
            <a href={registerHref} onClick={close}>
              Обсудить найм
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
