"use client";

import { ErrorScreen } from "@/components/shell/error-screen";
import { AGENCY_HOME } from "@/lib/nav-links";

/**
 * Сбой страницы в кабинете агентства: меню и нижняя панель остаются на месте.
 *
 * Тот же приём, что у кабинета клиента (app/(client)/error.tsx): ошибка
 * заменяет область страницы, а не всю оболочку. Сам экран — общий, см. ErrorScreen.
 */
export default function AgencyError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  return (
    <ErrorScreen error={error} reset={reset} retry={retry} layout="cabinet" homeHref={AGENCY_HOME} />
  );
}
