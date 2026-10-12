import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { MAIN_LANDMARK_PROPS } from "@/lib/a11y";

/**
 * Страница 404.
 *
 * Сюда попадают не только по опечатке в адресе: отказ в доступе к чужому
 * объекту тоже отдаёт 404, а не 403 (BR-28). Поэтому текст нейтральный —
 * он не должен намекать, что объект существует, но закрыт.
 *
 * Рисуется без оболочки, поэтому несёт собственный <main>: у страницы
 * должен быть ровно один.
 */
export default function NotFound() {
  return (
    <main {...MAIN_LANDMARK_PROPS} className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-5xl font-semibold tabular-nums text-muted-foreground">
        404
      </div>
      <div>
        <PageTitle>Страница не найдена</PageTitle>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Возможно, ссылка устарела или у вас нет доступа к этому разделу.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">На главную</Link>
      </Button>
    </main>
  );
}
