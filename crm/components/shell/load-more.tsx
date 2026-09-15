import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * «Показать ещё» — обычная ссылка на ту же страницу с `page+1`.
 *
 * Не клиентский компонент и не бесконечный скролл: страница остаётся
 * server-rendered, а следующая порция просто увеличивает `take`
 * на сервере (BR-22 — без этого список грузился бы целиком сразу).
 */
export function LoadMore({ href }: { href: string }) {
  return (
    <div className="flex justify-center pt-2">
      <Button asChild variant="outline" size="sm">
        <Link href={href} scroll={false}>
          Показать ещё
        </Link>
      </Button>
    </div>
  );
}
