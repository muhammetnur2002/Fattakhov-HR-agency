import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Фирменная фактура «рёбра» на тёмных блоках сайта.
 *
 * Раньше это был `background-image` на полупрозрачном слое. Фон браузер находит только
 * после разбора CSS и качает с низким приоритетом вровень со скриптами: на медленной сети
 * картинка приходила последней, а на внутренних страницах (`/tariffs`, `/cases`, `/audit`)
 * именно она была самым большим элементом экрана, то есть LCP (замер 13.10.2026: 2,4–2,7 с
 * на телефоне при тексте в 1,1 с). Файл при этом был 57 КБ JPEG, оптимизатор отдаёт тот же
 * рисунок в WebP на порядок легче.
 *
 * Слой и смешивание остаются на обёртке — `opacity` и `mix-blend-overlay` переданы вызывающим
 * (`className`), поэтому вид блока не меняется: картинка лежит внутри того же изолированного
 * слоя, что и фон раньше.
 *
 * `eager` — только для фактуры первого экрана (шапка внутренней страницы): она в начале
 * разметки и получает высокий приоритет. Остальные ленивые: браузер не качает их, пока блок
 * далеко за экраном, а подгружает заранее, до того как до него долистают.
 */
export function RibbedTexture({
  className,
  eager = false,
  sizes = "100vw",
}: {
  className?: string;
  eager?: boolean;
  /** Ширина слоя при разных окнах. «100vw» — только для блока на всю ширину: Next в разработке предупреждает, если слой уже 60% окна. */
  sizes?: string;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 mix-blend-overlay", className)}>
      <Image
        src="/brand/slate-ribbed.jpg"
        alt=""
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        className="object-cover object-center"
      />
    </div>
  );
}
