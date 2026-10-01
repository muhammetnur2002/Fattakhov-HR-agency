import { Phone } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MarketingMobileMenu } from "./mobile-menu";
import { PHONE_DISPLAY, PHONE_HREF } from "@/lib/contacts";
import { MARKETING_LINKS } from "@/lib/marketing/nav";
import { appUrl, studentsUrl } from "@/lib/urls";

/**
 * Шапка лендинга.
 *
 * Держится в одну строку на десктопе и не выше 64 пикселей: высокие
 * «агентские» шапки съедают первый экран, ради которого страница
 * и существует. На узких экранах ссылки-разделы уходят, остаются
 * логотип, телефон, вход и одно действие.
 */
export function MarketingHeader() {
  // Студенческая платформа — отдельное приложение, поэтому обычная
  // ссылка, а не Link. На проде без её адреса пункта нет
  const students = studentsUrl("/");

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[2200px] items-center gap-6 px-5 md:px-8 xl:px-14">
        <Link href="/" aria-label="Fattakhov HR Agency" className="flex shrink-0 items-center">
          <Logo variant="lockup" className="h-7" priority />
        </Link>

        <nav className="ml-4 hidden items-center gap-6 lg:flex">
          {MARKETING_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-base text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          {/* Только от xl: на 1024px пятый пункт переносил «Как работаем»
              и «Аудит найма» на две строки. Уже шапки студент найдёт вход
              в блоке на главной и в подвале */}
          {students && (
            <a
              href={students}
              className="hidden text-base text-muted-foreground transition-colors hover:text-foreground xl:inline"
            >
              Студентам
            </a>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/*
            Телефон в шапке — для тех, кто скорее позвонит, чем заполнит
            форму. Раньше номер стоял только в подвале, то есть в конце
            двадцати экранов прокрутки: до него доезжали не все, кому
            он был нужен. На узких экранах остаётся иконкой — место
            в шапке уже занято входом и главным действием.
          */}
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="size-11 max-sm:hidden lg:hidden"
          >
            <a href={PHONE_HREF} aria-label={`Позвонить: ${PHONE_DISPLAY}`}>
              <Phone className="size-4" />
            </a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
          >
            <a href={PHONE_HREF}>
              <Phone className="size-4" />
              {PHONE_DISPLAY}
            </a>
          </Button>

          {/* На телефоне вход живёт в меню: рядом с логотипом, главным
              действием и кнопкой меню ему не хватает места (замер на 320) */}
          <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
            <a href={appUrl("/login")}>Войти в кабинет</a>
          </Button>
          {/* h-11 — минимальная зона касания (44px). На телефоне это
              единственное конверсионное действие в шапке, ужимать его
              до тех же 28px, что у второстепенных кнопок рядом, не
              стоит. От lg возвращается к обычному размеру кнопки. */}
          <Button asChild size="sm" className="h-11 lg:h-7">
            {/* Короткая подпись на телефоне: полная рядом с логотипом
                и кнопкой меню не помещается на 320 */}
            <Link href="/#diagnostic">
              <span className="sm:hidden">Обсудить</span>
              <span className="hidden sm:inline">Обсудить найм</span>
            </Link>
          </Button>
          <MarketingMobileMenu
            phoneHref={PHONE_HREF}
            phoneDisplay={PHONE_DISPLAY}
            loginHref={appUrl("/login")}
            registerHref="/#diagnostic"
            studentsHref={students}
          />
        </div>
      </div>
    </header>
  );
}
