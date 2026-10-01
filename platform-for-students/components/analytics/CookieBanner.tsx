'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { getServerSnapshot, getSnapshot, isAnswered, setChoice, subscribe } from '@/lib/analytics/consent';

/**
 * Уведомление о cookie.
 *
 * Три правила: аналитика выключена по умолчанию; до «Принять аналитику» счётчик
 * не грузится; отказ не закрывает содержание сайта — это полоса внизу, а не окно
 * на весь экран, и закрывается любой из двух кнопок.
 */
export function CookieBanner() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (isAnswered(choice)) return null;

  return (
    <div
      role="region"
      aria-label="Уведомление о файлах cookie"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] bg-ink/95 backdrop-blur"
    >
      <div className="page-x mx-auto flex max-w-[2200px] flex-col gap-4 py-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-[12.5px] leading-relaxed text-paper-dim">
          Мы используем обязательные cookie для работы сайта, а с вашего согласия — аналитические, чтобы понимать
          посещаемость и улучшать сайт. Аналитический инструмент: Яндекс.Метрика. Подробнее в{' '}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-paper">
            Политике обработки персональных данных
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setChoice('rejected')}>
            Только необходимые
          </Button>
          <Button size="sm" onClick={() => setChoice('accepted')}>
            Принять аналитику
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Ссылка «Настройки cookie» для подвала: выбор можно изменить в любой момент. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem('fhr-students-cookie-choice');
        } catch {
          /* нечего чистить */
        }
        location.reload();
      }}
      className={className}
    >
      Настройки cookie
    </button>
  );
}
