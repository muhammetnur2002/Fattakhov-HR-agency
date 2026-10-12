"use client";

import { ErrorScreen } from "@/components/shell/error-screen";
import { CLIENT_HOME } from "@/lib/nav-links";

/**
 * Сбой страницы в кабинете клиента: меню и нижняя панель остаются на месте.
 *
 * Без этого файла ошибку перехватывал корневой app/error.tsx и заменял собой
 * всю оболочку — клиент оставался на пустом экране без навигации. Здесь
 * заменяется только область страницы (error.tsx оборачивает page, но не
 * layout своего сегмента). Сам экран — общий, см. ErrorScreen.
 */
export default function ClientError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  return (
    <ErrorScreen error={error} reset={reset} retry={retry} layout="cabinet" homeHref={CLIENT_HOME} />
  );
}
