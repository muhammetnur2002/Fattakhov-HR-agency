"use client";

import { Loader2Icon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";

import { useListBusy } from "./list-pending";
import { Button } from "@/components/ui/button";

/**
 * «Показать ещё» — обычная ссылка на ту же страницу с `page+1`.
 *
 * Не бесконечный скролл: страница остаётся server-rendered, а следующая
 * порция просто увеличивает `take` на сервере (BR-22 — без этого список
 * грузился бы целиком сразу).
 *
 * Клиентский компонент из-за ожидания: порция приходит с сервера не сразу
 * (до 4 секунд на медленной сети), а серверная ссылка не показывала ничего —
 * человек нажимал снова. Теперь, пока идёт переход, в кнопке крутится
 * индикатор, а список выше помечен `aria-busy` (`useLinkStatus` → общее
 * состояние в `list-pending.tsx`). `useLinkStatus` читается только внутри
 * ссылки, поэтому подпись вынесена в отдельный компонент.
 */
export function LoadMore({ href }: { href: string }) {
  return (
    <div className="flex justify-center pt-2">
      <Button asChild variant="outline" size="sm">
        <Link href={href} scroll={false}>
          <LoadMoreLabel />
        </Link>
      </Button>
    </div>
  );
}

function LoadMoreLabel() {
  const { pending } = useLinkStatus();
  useListBusy(pending);
  return (
    <>
      {pending && (
        <Loader2Icon
          aria-hidden
          data-slot="load-more-pending"
          className="size-3.5 animate-spin motion-reduce:animate-none"
        />
      )}
      Показать ещё
    </>
  );
}
