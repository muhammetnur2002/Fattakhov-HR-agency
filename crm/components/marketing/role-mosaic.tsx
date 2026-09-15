import { ArrowUpRight } from "lucide-react";

import { Reveal } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * Мозаика ролей.
 *
 * Одна сетка на 12 колонок, две строки, доли колонок в каждой строке
 * складываются ровно в 12 — раскладка не «подогнана на глаз», а честно
 * выравнена. Раньше у каждой плитки была своя скорость прокруточного
 * параллакса (components/motion/primitives.tsx, ParallaxLayer): плитки
 * визуально разъезжались по высоте при скролле и сетка читалась как
 * сломанная. Движение здесь — только общее появление (Reveal), без
 * расхождения плиток между собой.
 *
 * Акцент — ровно один: у самой широкой, «якорной» роли заголовок
 * крупнее остальных. Приём обоснован пропорцией плитки, а не желанием
 * выделить конкретное название; на других плитках размер и перенос
 * строк одинаковы, чтобы одинаковый тип текста читался одинаково.
 *
 * Роли не выдуманы: это позиции из кейсов агентства и из вакансий,
 * которые оно ведёт. Мозаика из красивых, но несуществующих названий
 * читалась бы как сток.
 */

type Tone = "light" | "graphite" | "slate";

type Tile = {
  title: string;
  kind: string;
  tone: Tone;
  /** Колонки из 12 в своей строке. */
  span: number;
  /** Единственный акцент сетки — крупный заголовок якорной роли. */
  featured?: boolean;
};

const ROWS: Tile[][] = [
  [
    {
      title: "Руководитель отдела продаж",
      kind: "Коммерция",
      tone: "graphite",
      span: 6,
      featured: true,
    },
    { title: "Системный аналитик", kind: "IT", tone: "light", span: 3 },
    {
      title: "Инженер проекта",
      kind: "Производство",
      tone: "slate",
      span: 3,
    },
  ],
  [
    {
      title: "ИИ-специалисты и датасайенс",
      kind: "IT",
      tone: "light",
      span: 4,
    },
    {
      title: "Бизнес-ассистент",
      kind: "Операционные роли",
      tone: "light",
      span: 4,
    },
    {
      title: "Руководители направлений",
      kind: "Управление",
      tone: "slate",
      span: 4,
    },
  ],
];

/** Tailwind не собирает классы из шаблонных строк — только буквальный список. */
const COL_SPAN: Record<number, string> = {
  3: "md:col-span-3",
  4: "md:col-span-4",
  6: "md:col-span-6",
};

function TileCard({ tile }: { tile: Tile }) {
  const dark = tile.tone !== "light";

  return (
    <article
      className={cn(
        "group relative flex h-full min-h-48 flex-col justify-between overflow-hidden rounded-2xl p-5 md:min-h-56",
        tile.tone === "light" && "border bg-card",
        tile.tone === "graphite" && "bg-brand-graphite text-white",
        tile.tone === "slate" && "bg-brand-slate text-white",
      )}
    >
      {tile.tone === "slate" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/brand/slate-ribbed.jpg')] bg-cover bg-center opacity-40 mix-blend-overlay"
        />
      )}

      <div className="relative flex items-start justify-between gap-4">
        <span
          className={cn(
            "text-sm font-medium tracking-[0.12em] uppercase",
            dark ? "text-white/65" : "text-muted-foreground",
          )}
        >
          {tile.kind}
        </span>
        <ArrowUpRight
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5",
            dark ? "text-white/65" : "text-muted-foreground",
          )}
        />
      </div>

      <h3
        className={cn(
          "relative mt-8 leading-[1.03] font-semibold tracking-tight text-balance",
          tile.featured
            ? "text-4xl md:text-6xl"
            : "text-3xl md:text-4xl",
        )}
      >
        {tile.title}
      </h3>
    </article>
  );
}

export function RoleMosaic() {
  return (
    <div className="mt-12 space-y-3">
      {ROWS.map((row, i) => (
        <div key={i} className="grid gap-3 md:grid-cols-12">
          {row.map((tile, j) => (
            <Reveal
              key={tile.title}
              delay={j * 0.05}
              className={cn("min-w-0", COL_SPAN[tile.span])}
            >
              <TileCard tile={tile} />
            </Reveal>
          ))}
        </div>
      ))}
    </div>
  );
}
