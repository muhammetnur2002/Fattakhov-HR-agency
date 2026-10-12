import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ссылка «назад» над заголовком страницы: одна кнопка-призрак со значком.
 *
 * Было три вида (кнопка-призрак, голая ссылка, пункт меню), а стрелка — буква
 * «←» в тексте: по высоте строки она плавала и не совпадала со значками
 * кнопок. Теперь значок из того же набора, что и остальные.
 */
export function BackLink({
  href,
  children,
  className,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button asChild variant="ghost" size="sm" className={cn("-ml-2 mb-2 min-w-0 max-w-full shrink", className)}>
      <Link href={href} className="min-w-0">
        <ArrowLeftIcon aria-hidden />
        <span className="truncate">{children}</span>
      </Link>
    </Button>
  );
}
