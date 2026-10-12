import * as React from "react";

import { PageTitle } from "@/components/ui/page-title";
import { cn } from "@/lib/utils";

/**
 * Шапка страницы: заголовок, подпись и действия справа.
 *
 * Разметка была скопирована на каждую страницу с кнопкой
 * (`flex flex-wrap items-start justify-between …`) и работала, пока подпись
 * короткая. У воронки студплатформы подпись длинная, левый блок у неё не
 * умел сжиматься (ни `min-w-0`, ни `flex-1`), занимал ширину самой длинной
 * строки — и на ноутбуке в 1280 кнопка «Все клиенты» не помещалась рядом и
 * уходила отдельной строкой под подпись, слева, тогда как на соседних
 * страницах стоит справа от заголовка.
 *
 * Здесь левый блок берёт всё свободное место (`flex-1`) и переносит подпись
 * сам, а действия остаются справа; на узком экране, где рядом с заголовком
 * им не хватает места (`basis-80` у левого блока), они переходят под него.
 *
 * Подпись — `description`, а не вложенный абзац: так у страницы один порядок
 * «заголовок, подпись, действия» и один отступ. Заголовок — PageTitle,
 * единственный h1 страницы.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Кнопки и ссылки справа. Один элемент или несколько — их раскладка здесь. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}
    >
      <div className="min-w-0 flex-1 basis-80">
        <PageTitle>{title}</PageTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
