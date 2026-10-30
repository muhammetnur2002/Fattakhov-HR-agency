'use client';

import { unstable_isUnrecognizedActionError as isStaleAction } from 'next/navigation';
import { useEffect } from 'react';
import { CubeMark } from '@/components/brand/CubeMark';
import { Logo } from '@/components/brand/Logo';
import { Button, ButtonLink } from '@/components/ui/Button';

/**
 * Что видит человек, когда страница упала.
 *
 * Раньше в приложении не было ни одного error.tsx: сбой серверного рендера показывал стандартный экран
 * Next — без шапки, без оформления и без кнопки «Повторить» (сверка 08.10.2026). Теперь текст один на
 * все разделы, а вложенные error.tsx (студент, работодатель, админка) показывают его внутри их шапки.
 *
 * Текста ошибки здесь нет намеренно: сообщение исключения может содержать кусок запроса или имя
 * студента. Человеку нужен способ продолжить; по коду ниже запись находят в журнале сервера.
 *
 * Вкладка, открытая до выкладки новой версии, при следующем действии получает «неизвестное серверное
 * действие» — это не сбой: достаточно обновить страницу, «Повторить» с той же вкладки упрётся в то же.
 */
export function ErrorScreen({
  error,
  reset,
  home,
  fullPage = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home: { href: string; label: string };
  /** Корневой экран: своя шапка с логотипом. Во вложенных её рисует каркас раздела. */
  fullPage?: boolean;
}) {
  const stale = Boolean(isStaleAction(error));

  useEffect(() => {
    if (!stale) console.error('[error]', error.digest ?? '', error);
  }, [error, stale]);

  const body = (
    <main
      className={
        fullPage
          ? 'page-x mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center pb-24 text-center'
          : 'mx-auto flex w-full max-w-lg flex-col items-center justify-center py-20 text-center'
      }
    >
      <CubeMark className="h-16 w-16 text-paper/25" />
      <h1 className="mt-8 text-title text-paper">{stale ? 'Страница устарела' : 'Что-то пошло не так'}</h1>
      <p className="mt-3.5 text-body leading-relaxed text-paper-dim">
        {stale
          ? 'Пока она была открыта, мы выложили новую версию, и ваше последнее действие не выполнилось. Обновите страницу и повторите его.'
          : 'Страница не открылась. Попробуйте ещё раз; если повторится, напишите нам и назовите код ниже: по нему мы найдём, что случилось.'}
      </p>
      {!stale && error.digest && (
        <code className="mt-4 rounded-lg bg-paper/[0.06] px-2.5 py-1 text-caption text-paper-faint">{error.digest}</code>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {stale ? (
          <Button size="lg" onClick={() => window.location.reload()}>
            Обновить страницу
          </Button>
        ) : (
          <Button size="lg" onClick={reset}>
            Повторить
          </Button>
        )}
        <ButtonLink href={home.href} variant="ghost" size="lg">
          {home.label}
        </ButtonLink>
      </div>
    </main>
  );

  if (!fullPage) return body;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-x mx-auto flex h-[var(--header-h)] w-full max-w-6xl items-center">
        <Logo />
      </header>
      {body}
    </div>
  );
}
