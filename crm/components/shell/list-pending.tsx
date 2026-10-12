"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Ожидание списка: фильтр, поиск и «Показать ещё» меняют только адрес, а
 * новую выборку отдаёт сервер — с задержкой, и человек не видел, что что-то
 * происходит (замер 11.10.2026: на медленной сети после ввода в поиск
 * проходило 2–4 секунды без единого признака, что запрос ушёл).
 *
 * Три части, одно место:
 *
 * - `useListNavigation()` — для тех, кто меняет адрес списка (поиск, выпадающие
 *   фильтры). `router.replace` внутри `startTransition`: пока сервер собирает
 *   страницу, `pending` держится, а прежний список остаётся на экране.
 * - `useListBusy(busy)` — для тех, у кого ожидание приходит откуда-то ещё
 *   (ссылка «Показать ещё» читает его из `useLinkStatus`, чип-ссылка — так же).
 * - `ListRegion` — обёртка самого списка: `aria-busy` и приглушение, пока он
 *   устаревший. Читалке экрана сообщается не только «обновляется», но и
 *   «обновлено»: единственная живая область (`aria-live="polite"`) стоит
 *   в `ListPendingProvider` один раз на весь кабинет (AppShell), а не копией
 *   в каждом фильтре.
 *
 * Вне провайдера (тесты, страницы без каркаса) всё работает, но без общего
 * состояния и без объявления: хуки не падают.
 */

/** Текст для читалки экрана, когда список обновился. */
export const LIST_UPDATED_MESSAGE = "Список обновлён";

type Ctx = {
  busy: boolean;
  report: (source: string, busy: boolean) => void;
};

const ListPendingContext = createContext<Ctx | null>(null);

export function ListPendingProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const wasBusy = useRef(false);

  const report = useCallback((source: string, busy: boolean) => {
    setSources((prev) => {
      if (prev.has(source) === busy) return prev;
      const next = new Set(prev);
      if (busy) next.add(source);
      else next.delete(source);
      return next;
    });
  }, []);

  const busy = sources.size > 0;

  // Объявляем завершение: ожидание было и кончилось. Сначала пусто, потом
  // текст — одинаковая строка подряд читалкой не повторяется
  useEffect(() => {
    if (wasBusy.current && !busy) {
      setAnnouncement("");
      const say = setTimeout(() => setAnnouncement(LIST_UPDATED_MESSAGE), 60);
      const clear = setTimeout(() => setAnnouncement(""), 4000);
      wasBusy.current = busy;
      return () => {
        clearTimeout(say);
        clearTimeout(clear);
      };
    }
    wasBusy.current = busy;
  }, [busy]);

  const value = useMemo(() => ({ busy, report }), [busy, report]);

  return (
    <ListPendingContext.Provider value={value}>
      {children}
      {/* Единственная живая область для обновления списков */}
      <div data-slot="list-live" role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </ListPendingContext.Provider>
  );
}

/** Сообщить, что где-то на странице список обновляется (и перестал). */
export function useListBusy(busy: boolean): void {
  const ctx = useContext(ListPendingContext);
  const source = useId();
  const report = ctx?.report;

  useEffect(() => {
    report?.(source, busy);
  }, [report, source, busy]);

  // Исчез с экрана посреди ожидания (страница уже сменилась) — снять отметку
  useEffect(() => () => report?.(source, false), [report, source]);
}

/**
 * Перейти на тот же список с другими параметрами и показать ожидание.
 *
 * `navigate(url)` — `router.replace` без прокрутки, внутри перехода.
 * `pending` — для значка у самого поля или чипа.
 */
export function useListNavigation(): {
  pending: boolean;
  navigate: (url: string) => void;
} {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useListBusy(pending);

  const navigate = useCallback(
    (url: string) => {
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [router],
  );

  return { pending, navigate };
}

/**
 * Обёртка самого списка: пока идёт обновление, он помечен `aria-busy` и
 * приглушён — старые строки на экране читаются как «ещё не обновилось».
 */
export function ListRegion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const busy = useContext(ListPendingContext)?.busy ?? false;
  return (
    <div
      data-slot="list-region"
      aria-busy={busy || undefined}
      className={cn("transition-opacity", busy && "opacity-60", className)}
    >
      {children}
    </div>
  );
}
