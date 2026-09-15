"use client";

import { LogOut } from "lucide-react";

import { logout } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  fullName,
  email,
  roleLabel,
}: {
  fullName: string;
  email: string;
  roleLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Имя видно только от sm: и шире (см. span ниже) — на телефоне
            кнопка остаётся без всякого текста, aria-label обязателен */}
        <Button
          variant="ghost"
          className="h-auto gap-2 px-2 py-2.5 md:py-1.5"
          aria-label={`Меню пользователя: ${fullName}`}
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {initials(fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{fullName}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{fullName}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
          <div className="mt-1 text-xs text-muted-foreground">{roleLabel}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              Выйти
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
