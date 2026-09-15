import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Страница 404.
 *
 * Сюда попадают не только по опечатке в адресе: отказ в доступе к чужому
 * объекту тоже отдаёт 404, а не 403 (BR-28). Поэтому текст нейтральный —
 * он не должен намекать, что объект существует, но закрыт.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-5xl font-semibold tabular-nums text-muted-foreground">
        404
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Страница не найдена</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Возможно, ссылка устарела или у вас нет доступа к этому разделу.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">На главную</Link>
      </Button>
    </div>
  );
}
