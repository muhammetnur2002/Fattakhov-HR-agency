import type { ReactNode } from "react";

import { SITE_CONTAINER } from "./layout";
import { RibbedTexture } from "./texture";

/**
 * Тёмная полоса-шапка внутренней страницы: фон, контейнер и вертикальный отступ.
 *
 * Контейнер тот же, что у шапки сайта и разделов (`SITE_CONTAINER`): раньше у `/tariffs`,
 * `/cases` и `/audit` стояло `max-w-4xl px-5`, и левый край заголовка лежал на 105px (1280),
 * 185px (1440) и 425px (1920) при логотипе на 70. Ширину ограничивает сам абзац (`max-w-2xl`
 * в `PageIntro`), а не колонка: заголовок и логотип стоят на одной вертикали.
 *
 * Отступ героя — единственный на внутренние страницы (`py-12 md:py-16`): первый экран получает
 * больше воздуха, чем раздел (`Section`), и это исключение записано в `tests/site-rhythm.test.ts`.
 * Главная устроена иначе (hero.tsx): её первый экран сжат под сгиб.
 */
export function PageHero({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-brand-slate text-white">
      <RibbedTexture className="opacity-20" eager />
      <div className={`relative ${SITE_CONTAINER} py-12 md:py-16`}>{children}</div>
    </section>
  );
}

/**
 * Шапка внутренней страницы сайта на тёмном фоне: надзаголовок, h1 и вводный абзац.
 *
 * Один компонент вместо трёх копий (`/tariffs`, `/cases`, `/audit`): копии расходились
 * по размеру и ритму при первой же правке. Главная страница устроена иначе (hero.tsx):
 * у неё крупнее заголовок и свой первый экран. Размер заголовка — единственный h1 страницы.
 */
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Вводный абзац под заголовком. */
  children: ReactNode;
}) {
  return (
    <>
      <div className="text-xs font-medium tracking-[0.14em] text-white/65 uppercase">{eyebrow}</div>
      <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance md:text-5xl">
        {title}
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">{children}</p>
    </>
  );
}
