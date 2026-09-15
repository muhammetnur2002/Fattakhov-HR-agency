"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Что видит человек, когда на сервере что-то упало.
 *
 * Без этого файла Next показывает свою страницу: английский текст
 * «Application error: a server-side exception has occurred» и хеш
 * ошибки без оформления. На своём домене это читается как «сайт
 * сломался целиком», хотя обычно отвалился один запрос.
 *
 * Текста ошибки здесь нет намеренно. В проде Next его и не отдаёт —
 * наружу уходит только digest, — но правило шире: сообщение
 * исключения умеет содержать кусок запроса или имя кандидата,
 * а страница отказа не то место, где такое показывают. Человеку
 * нужен способ продолжить, а digest — чтобы найти запись в логе
 * сервера, где подробности есть.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В браузере это единственное место, где ошибка вообще видна:
    // серверную запись человек, сидящий в кабинете, не откроет.
    // captureException молча ничего не делает, пока Sentry не поднят
    // (см. instrumentation-client.ts) — вызывать безусловно можно
    console.error("[error]", error.digest ?? "", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Что-то пошло не так</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Страница не открылась. Попробуйте ещё раз — если повторится,
          напишите нам и назовите код ниже, по нему мы найдём, что случилось.
        </p>
      </div>

      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {error.digest}
        </code>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* reset перерисовывает участок, а не перезагружает вкладку:
            введённое в других местах страницы остаётся на месте */}
        <Button onClick={reset}>Попробовать снова</Button>
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
