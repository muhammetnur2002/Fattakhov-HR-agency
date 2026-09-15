"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { SidebarNav } from "./sidebar-nav";
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
import type { NavItem } from "@/lib/nav";

/**
 * Меню кабинета для узких экранов.
 *
 * Сайдбар в `<aside>` скрыт до `md` — без этой кнопки на телефоне
 * не было вообще никакого способа дойти до раздела, кроме дашборда.
 * Состояние открытия держим сами (не полагаемся на дефолт Sheet),
 * чтобы закрыть меню при переходе: `(client)/layout.tsx` не
 * перемонтируется между страницами одного кабинета, и без явного
 * закрытия панель осталась бы открытой поверх новой страницы.
 */
export function MobileNav({
  items,
  title,
  roleLabel,
}: {
  items: NavItem[];
  title: string;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-11 md:size-7" aria-label="Открыть меню">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 border-none bg-brand-graphite p-4 text-white"
      >
        <SheetHeader className="p-0">
          <SheetTitle asChild>
            <div className="mb-1 px-1">
              <Logo variant="lockup" tone="light" className="h-7" />
            </div>
          </SheetTitle>
          <SheetDescription className="px-1 text-[11px] text-white/65">
            {title}
            <br />
            {roleLabel}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <SidebarNav items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
