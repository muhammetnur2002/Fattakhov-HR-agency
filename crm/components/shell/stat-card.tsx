import Link from "next/link";
import { Children } from "react";

import { CountUp } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * Показатель на дашборде.
 *
 * Сознательно не карточка. Четыре одинаковых карточки в ряд читаются
 * как «четыре равноценных числа», а они не равноценны: одно требует
 * действия сегодня, остальные просто описывают положение дел.
 * Поэтому иерархия строится размером и цветом, а рамок нет вовсе,
 * группировку держат тонкие разделители.
 *
 * `accent` - требует действия. Подсвечивается только когда значение
 * больше нуля: ноль ждущих решения это хорошая новость, а не повод
 * привлекать внимание.
 *
 * Раньше у главного показателя был ещё и свой размер (`lead`), крупнее
 * прочих. От размера отказались: четыре числа разной величины на разных
 * высотах читаются не как иерархия, а как небрежность — глазу не за что
 * зацепиться, чтобы сравнить их между собой. Иерархию держит цвет
 * и засечка у того, что требует действия; этого достаточно, а числа
 * теперь сравнимы.
 */
export function StatCard({
  label,
  value,
  hint,
  accent = false,
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
  /** Число само по себе не отвечает на «кто именно» — клик ведёт к списку. */
  href?: string;
}) {
  const hot = accent && Number(value) > 0;
  /*
    Ряды общие для всей обоймы (subgrid), а не выравнивание по краям.

    Раньше плитка была flex-колонкой с justify-between: пояснение есть
    не у каждого показателя, и число вставало то выше, то ниже соседнего.
    Теперь подпись, число и пояснение лежат в трёх общих рядах ряда
    плиток — числа на одной линии независимо от того, у кого есть
    пояснение.
  */
  const className = cn(
    "relative grid grid-rows-[auto_auto_auto] content-start gap-0 px-5 py-4",
    "sm:row-span-3 sm:grid-rows-subgrid",
    // Засечка повторяет вертикальные рёбра знака
    hot && "before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-full before:bg-primary",
    href && "transition-colors hover:bg-muted/50",
  );

  const content = (
    <>
      <div className="text-sm leading-snug text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 self-start text-4xl font-semibold tracking-tight tabular-nums",
          hot ? "text-primary" : "text-foreground",
        )}
      >
        {/* Досчитывается только настоящее число: строку счётчиком
            не изобразить, а подделывать анимацией нечего */}
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {/* Без дополнительной прозрачности: на 12px приглушённый серый
          и так на границе читаемости, а /80 уводил его за неё */}
      {hint && (
        <div className="mt-1.5 text-xs leading-snug text-muted-foreground">
          {hint}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

/**
 * Обойма для показателей: одна рамка на группу и волосяные линии между
 * плитками вместо рамки у каждой. Так ряд читается как один прибор,
 * а не как четыре независимых объекта.
 *
 * Число плиток на дашборде агентства не постоянно — от 4 до 8, в
 * зависимости от того, что актору доступно (см. app/(agency)/a/page.tsx).
 * Ряд на четыре колонки всегда был жёстким, и пятая плитка повисала
 * одна в почти пустой строке — не пустой на самом деле: фон строки
 * заливает всё та же bg-border под волосяные линии, и без соседей
 * рядом три оставшиеся колонки читались сплошным серым полем.
 *
 * Число колонок на широком экране подбирается под то, сколько плиток
 * реально пришло, а не подгоняется под них после отрисовки: 4 и 8
 * делятся на 4 ровно, 6 — на 3 (две строки по три, шире каждая плитка,
 * чем шесть в ряд), 5 — на 5 (в точности одна строка). Прочие количества
 * не встречаются, но откатываются к четырём как раньше.
 */
export function StatRow({ children }: { children: React.ReactNode }) {
  /*
    Children.toArray, а не Children.count.

    Часть плиток условная — `{manages && ... && <StatCard .../>}` — и
    там, где условие не выполнено, в дереве детей всё равно остаётся
    слот со значением `false`: JSX не убирает несработавшее выражение,
    оно просто ничего не рендерит. Children.count считает и такие слоты
    тоже — для пяти видимых плиток рекрутёра он вернул 9 (5 настоящих
    + 4 несработавших условия), 9 делится на 3, и колонок вместо пяти
    получилось три. Children.toArray их убирает — ровно то, что нужно.
  */
  const count = Children.toArray(children).length;
  const lgCols =
    count % 4 === 0
      ? "lg:grid-cols-4"
      : count % 3 === 0
        ? "lg:grid-cols-3"
        : count % 5 === 0
          ? "lg:grid-cols-5"
          : "lg:grid-cols-4";

  // Линии сделаны зазором в один пиксель на фоне цвета границы: так они
  // получаются одинаковыми и по вертикали, и по горизонтали при любом
  // числе колонок. Раскладывать border по детям пришлось бы отдельно
  // для каждой ширины экрана, и на переносах строк это всегда рвётся.
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:auto-rows-auto sm:grid-cols-2 sm:grid-rows-[auto_auto_auto]",
        lgCols,
      )}
    >
      <div className="contents [&>*]:bg-card">{children}</div>
    </div>
  );
}
