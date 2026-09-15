"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  isAnswered,
  setChoice,
  subscribe,
} from "@/lib/analytics/consent";
import { Button } from "@/components/ui/button";
import { PRIVACY_POLICY_PATH } from "@/lib/legal/consent-texts";

/**
 * Уведомление о cookie.
 *
 * Текст и логика из документа юриста «Уведомление о файлах cookie
 * и раздел о веб-аналитике». Три правила оттуда, и все три здесь
 * соблюдены:
 *
 * 1. До выбора «Принять аналитику» счётчики не грузятся.
 * 2. Аналитика выключена по умолчанию.
 * 3. Отказ не ограничивает доступ к содержанию сайта - баннер
 *    не перекрывает страницу и закрывается любой из двух кнопок.
 *
 * Поэтому это полоса внизу, а не модальное окно на весь экран.
 * Окно, которое нельзя закрыть, не оставив согласия, - это уже
 * не выбор.
 */
export function CookieBanner() {
  const choice = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (isAnswered(choice)) return null;

  return (
    <div
      role="region"
      aria-label="Уведомление о файлах cookie"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
          Мы используем обязательные cookie для работы сайта, а с вашего
          согласия — аналитические, чтобы понимать посещаемость и улучшать
          сайт. Аналитический инструмент: Яндекс.Метрика. Подробнее в{" "}
          <Link
            href={PRIVACY_POLICY_PATH}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Политике обработки персональных данных
          </Link>
          .
        </p>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setChoice("rejected")}
          >
            Только необходимые
          </Button>
          <Button type="button" size="sm" onClick={() => setChoice("accepted")}>
            Принять аналитику
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ссылка «Настройки cookie» для подвала.
 *
 * Требование документа: выбор должен меняться в любой момент.
 * Отзыв прекращает загрузку счётчика при следующем открытии
 * страницы - уже отправленные данные он, разумеется, не отзывает.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        setChoice("rejected");
        location.reload();
      }}
      className={className}
    >
      Настройки cookie
    </button>
  );
}
