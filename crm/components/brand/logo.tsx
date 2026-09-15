import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Логотип Fattakhov HR Agency.
 *
 * Два начертания под тему сразу в разметке, переключаются классом `dark:`.
 * Так логотип не мигает при загрузке и не зависит от того, когда клиентский
 * код узнает текущую тему: на сервере тема неизвестна, а подставлять
 * что-то одно значит показать чёрное на чёрном у половины пользователей.
 *
 * Название вынесено в отдельный текст для читалок, а обе картинки
 * помечены декоративными: какая из них скрыта, решает CSS, и alt на них
 * либо потерялся бы в тёмной теме, либо прочитался бы дважды.
 *
 * `lockup` — знак с надписью, для шапок и внешних страниц.
 * `mark` — только знак, туда, где надпись не поместится.
 */
export function Logo({
  variant = "lockup",
  tone = "auto",
  decorative = false,
  className,
  priority = false,
}: {
  variant?: "lockup" | "mark";
  /**
   * Знак как элемент оформления: крупный в первом экране, водяной
   * в подложке. Тогда название не читается вслух: оно уже есть в шапке,
   * и повтор через каждый экран мешает, а не помогает.
   */
  decorative?: boolean;
  /**
   * `auto` - начертание по теме страницы.
   * `light` / `dark` - принудительно, для мест, где подложка задана
   * жёстко и не зависит от темы: фирменная фактура, графитовый сайдбар.
   */
  tone?: "auto" | "light" | "dark";
  className?: string;
  priority?: boolean;
}) {
  const lockup = variant === "lockup";
  const width = lockup ? 326 : 222;
  const height = lockup ? 128 : 256;

  if (tone !== "auto") {
    const light = tone === "light";
    return (
      <span className={cn("inline-flex items-center", className)}>
        <Image
          src={
            lockup
              ? light
                ? "/brand/logo-light.png"
                : "/brand/logo-dark.png"
              : light
                ? "/brand/mark-light.png"
                : "/brand/mark-dark.png"
          }
          alt=""
          width={width}
          height={height}
          priority={priority}
          className="h-full w-auto"
        />
        {!decorative && <span className="sr-only">Fattakhov HR Agency</span>}
      </span>
    );
  }

  // Размер и видимость задаются на обёртке, а не на картинках. Иначе
  // переданный снаружи `md:hidden` конфликтует с внутренним `dark:block`
  // — оба класса одной специфичности, и кто победит, решает порядок
  // в собранном CSS. На практике это выглядит как логотип, который
  // в тёмной теме не прячется на широком экране.
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src={lockup ? "/brand/logo-dark.png" : "/brand/mark-dark.png"}
        alt=""
        width={width}
        height={height}
        priority={priority}
        className="h-full w-auto dark:hidden"
      />
      <Image
        src={lockup ? "/brand/logo-light.png" : "/brand/mark-light.png"}
        alt=""
        width={width}
        height={height}
        priority={priority}
        className="hidden h-full w-auto dark:block"
      />
      {!decorative && <span className="sr-only">Fattakhov HR Agency</span>}
    </span>
  );
}
