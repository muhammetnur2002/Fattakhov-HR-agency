import Link from "next/link";

import { PageHero, PageIntro } from "@/components/marketing/page-intro";
import { Button } from "@/components/ui/button";

/**
 * Содержимое страницы «не найдено» на домене сайта: заголовок, пояснение и три ссылки на страницы сайта.
 *
 * Показывает её `app/(marketing)/site-not-found/page.tsx`, куда прокси с кодом 404 переписывает любой
 * неизвестный адрес сайта (lib/site-routing.ts). Ссылки ведут на сайт, а не в кабинет: человек пришёл
 * с поиска или чужой ссылки.
 */
export function SiteNotFound() {
  return (
    <PageHero>
      <PageIntro eyebrow="Ошибка 404" title="Страница не найдена">
        Возможно, ссылка устарела или в адресе опечатка. Вернитесь на главную или откройте один из разделов сайта.
      </PageIntro>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg" variant="secondary">
          <Link href="/">На главную</Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="ghost"
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <Link href="/tariffs">Тарифы</Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="ghost"
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <Link href="/audit">Экспресс-аудит</Link>
        </Button>
      </div>
    </PageHero>
  );
}
