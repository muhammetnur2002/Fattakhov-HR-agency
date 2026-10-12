import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";

/**
 * 404 внутри кабинета: меню и нижняя панель остаются на месте.
 *
 * Единственный корневой not-found рисовался без оболочки: человек, открывший устаревшую
 * ссылку или чужой объект (BR-28 — отказ в доступе тоже 404), оставался на пустой странице
 * без меню и нижней панели и шёл «На главную» вручную. Здесь он видит тот же кабинет
 * и две кнопки: к спискам и на главную. Текст нейтральный — не намекает, что объект
 * существует, но закрыт.
 */
export function CabinetNotFound({
  homeHref,
  listHref,
  listLabel,
}: {
  homeHref: string;
  listHref: string;
  listLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-5xl font-semibold tabular-nums text-muted-foreground">404</div>
      <div>
        <PageTitle>Страница не найдена</PageTitle>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Возможно, ссылка устарела или у вас нет доступа к этому разделу.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={listHref}>{listLabel}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>На главную</Link>
        </Button>
      </div>
    </div>
  );
}
