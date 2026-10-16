"use client";

import Link from "next/link";
import { unstable_isUnrecognizedActionError as isStaleAction } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { captureClientException } from "@/lib/monitoring/capture-client";
import { PageTitle } from "@/components/ui/page-title";
import { MAIN_LANDMARK_PROPS } from "@/lib/a11y";
import { cn } from "@/lib/utils";

/**
 * Что видит человек, когда на сервере что-то упало.
 *
 * Один экран на три места: корень приложения (app/error.tsx), кабинет
 * клиента (app/(client)/error.tsx) и кабинет агентства (app/(agency)/a/error.tsx).
 * Раньше он жил только в корне, и сбой любой страницы кабинета заменял собой
 * всю оболочку: пропадали меню и нижняя панель, человек оставался на пустом
 * экране (проверка 11.10.2026). С error.tsx внутри кабинета оболочка остаётся,
 * заменяется только область страницы.
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
 *
 * layout:
 *  - "page" — вместо всей страницы: на весь экран и со своим <main>
 *    (оболочки вокруг нет, а у страницы должен быть один main);
 *  - "cabinet" — внутри оболочки кабинета: <main> уже есть у AppShell,
 *    экран занимает его область, как CabinetNotFound.
 */
export function ErrorScreen({
  error,
  reset,
  retry,
  layout = "page",
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  /** Перерисовать участок без запроса к серверу. */
  reset: () => void;
  /**
   * Перерисовать с новым запросом к серверу (Next 16.4). Серверная ошибка
   * после одного reset() повторилась бы тут же: тот же ответ, тот же сбой.
   */
  retry?: () => void;
  layout?: "page" | "cabinet";
  /** Куда ведёт «На главную»: в кабинете — на его дашборд, а не на сайт. */
  homeHref?: string;
}) {
  // Вкладку открыли до выкладки новой версии, и сервер не узнал её действие
  // (UnrecognizedActionError). Это не сбой: ничего не записалось, нужно
  // обновить страницу. Без «попробовать снова»: повтор с той же вкладки
  // упрётся в то же самое
  const stale: boolean = Boolean(isStaleAction(error)); // Boolean: без сужения типа error до never

  useEffect(() => {
    // В браузере это единственное место, где ошибка вообще видна:
    // серверную запись человек, сидящий в кабинете, не откроет.
    // captureClientException ничего не делает и ничего не грузит, пока Sentry не поднят
    // (см. instrumentation-client.ts) — вызывать безусловно можно.
    // Устаревшую вкладку сбоем не считаем
    if (stale) return;
    console.error("[error]", error.digest ?? "", error);
    captureClientException(error);
  }, [error, stale]);

  const body = stale ? (
    <>
      <div>
        <PageTitle>Страница устарела</PageTitle>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Пока она была открыта, мы выложили новую версию сайта, и ваше последнее действие не
          выполнилось. Обновите страницу и повторите его.
        </p>
        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          Что вы успели ввести в эту форму, придётся ввести заново: до сервера оно не дошло.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>На главную</Link>
        </Button>
      </div>
    </>
  ) : (
    <>
      <div>
        <PageTitle>Что-то пошло не так</PageTitle>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Страница не открылась. Попробуйте ещё раз — если повторится,
          напишите нам и назовите код ниже, по нему мы найдём, что случилось.
        </p>
        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          Держали страницу открытой долго или отправляли форму сразу после обновления сайта? Тогда достаточно нажать
          «Обновить страницу»: мы уже выложили новую версию, а у вас открыта старая.
        </p>
      </div>

      {error.digest && (
        <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {error.digest}
        </code>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Перерисовывает участок, а не перезагружает вкладку: введённое в других
            местах страницы остаётся на месте. retry (если есть) ещё и берёт
            страницу с сервера заново */}
        <Button onClick={retry ?? reset}>Попробовать снова</Button>
        {/* Полная перезагрузка: после выкладки новой версии открытая вкладка ещё несёт старый код,
            и повторная отрисовка участка его не обновит */}
        <Button variant="outline" onClick={() => window.location.reload()}>
          Обновить страницу
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>На главную</Link>
        </Button>
      </div>
    </>
  );

  const classes = "flex flex-col items-center gap-4 text-center";

  // Вместо всей страницы оболочки нет — значит, нет и main: экран несёт его сам
  if (layout === "page") {
    return (
      <main {...MAIN_LANDMARK_PROPS} className={cn(classes, "min-h-svh justify-center p-8")}>
        {body}
      </main>
    );
  }

  return <div className={cn(classes, "py-16")}>{body}</div>;
}
