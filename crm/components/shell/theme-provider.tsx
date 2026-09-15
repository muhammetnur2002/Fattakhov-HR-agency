"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

/**
 * Своя, минимальная замена next-themes.
 *
 * next-themes для анти-мерцания рендерит <script> внутри клиентского
 * компонента, и React 19 такое безусловно помечает предупреждением
 * "Encountered a script tag while rendering React component" — это
 * не обычный hydration mismatch (suppressHydrationWarning, который
 * next-themes и так уже ставит на свой script, тут не помогает), а
 * отдельная, безусловная проверка реконсилятора: исключение в react-dom
 * сделано только для скриптов-контейнеров данных (isScriptDataBlock,
 * например type="application/json"), а не для исполняемого JS. Апстрим-
 * фикса в next-themes нет и не предвидится — библиотека годами полагается
 * именно на этот приём.
 *
 * Решение — тот же анти-мерцающий скрипт, но вписанный прямо в разметку
 * серверного app/layout.tsx (см. STORAGE_KEY там же), а не рождённый
 * клиентским компонентом: React его вообще не реконсилирует, предупреждению
 * неоткуда взяться. Здесь — только реактивная часть, тем же приёмом,
 * что и lib/analytics/consent.ts: useSyncExternalStore, SSR-снимок
 * всегда "system", реальное значение подхватывается сразу после гидратации.
 */

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

/** Должен совпадать с ключом в анти-мерцающем скрипте в app/layout.tsx. */
const STORAGE_KEY = "theme";

function prefersDark(): boolean {
  // Вызывается и при статической прегенерации страниц (window нет вовсе) —
  // ThemeProvider тогда рендерится с getServerSnapshot()==="system", и без
  // этой проверки resolve() уронил бы саму сборку
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): Resolved {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

/** Тот же класс и то же свойство, что уже выставил анти-мерцающий скрипт. */
function applyToDocument(resolved: Resolved): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

function readStoredTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  } catch {
    return "system";
  }
}

function getThemeSnapshot(): Theme {
  return readStoredTheme();
}

/** На сервере выбора нет — считаем "system" безусловно. */
function getThemeServerSnapshot(): Theme {
  return "system";
}

/**
 * Отдельный снимок под резолвенное значение — не то же самое, что
 * getThemeSnapshot().
 *
 * useSyncExternalStore перерисовывает компонент, только когда сам снимок
 * меняется (по Object.is). Смена системной темы при theme==="system" не
 * трогает то, что лежит в localStorage, — снимок "сырого" выбора остаётся
 * тем же "system", и без отдельного снимка эта смена вообще не долетала
 * бы до реакта: подписка срабатывала (mql 'change' ниже), а перерисовки
 * не происходило — resolvedTheme пересчитывался бы только при следующем
 * рендере по другой причине.
 */
function getResolvedSnapshot(): Resolved {
  return resolve(readStoredTheme());
}

function getResolvedServerSnapshot(): Resolved {
  return "light";
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  // storage долетает только до ДРУГИХ вкладок — свою же вкладку после
  // клика по переключателю оповещает вручную setTheme ниже
  window.addEventListener("storage", onChange);
  mql.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    mql.removeEventListener("change", onChange);
  };
}

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    getResolvedServerSnapshot,
  );

  // Единая точка, где резолвенная тема красит документ — независимо от
  // того, что её изменило: клик по переключателю, смена системной темы
  // или запись в другой вкладке
  useEffect(() => {
    applyToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Приватный режим — тема просто не переживёт перезагрузку
    }
    // Нативный storage-event эту же вкладку не оповещает никогда —
    // без синтетического события кнопка перекрасила бы документ
    // при следующем внешнем сигнале, а не сразу по клику
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme вызван вне ThemeProvider");
  return ctx;
}
