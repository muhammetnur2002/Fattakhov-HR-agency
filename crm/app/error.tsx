"use client";

import { ErrorScreen } from "@/components/shell/error-screen";

/**
 * Что видит человек, когда на сервере что-то упало, — на весь экран.
 *
 * Всё содержимое (устаревшая вкладка, код сбоя, кнопки, Sentry) —
 * в общем ErrorScreen: тот же экран стоит и внутри кабинетов
 * (app/(client)/error.tsx, app/(agency)/a/error.tsx), только там он не
 * заменяет меню и нижнюю панель. Сюда попадают сбои вне кабинетов:
 * вход, регистрация, сайт, страницы кандидата.
 */
export default function AppError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} retry={retry} layout="page" />;
}
