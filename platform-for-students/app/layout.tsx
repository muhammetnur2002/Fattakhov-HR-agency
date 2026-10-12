import type { Metadata, Viewport } from 'next';
import { Aurora } from '@/components/layout/Aurora';
import { SplashScreen } from '@/components/layout/SplashScreen';
import { AnalyticsGate } from '@/components/analytics/AnalyticsGate';
import { RouteCurtain } from '@/components/motion/RouteCurtain';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Fattakhov HR Agency — работа для студентов',
    template: '%s · Fattakhov HR Agency',
  },
  description:
    'Подработка и стажировки для студентов: смахните вправо — отклик уходит работодателю. Проверенные компании, график под учёбу.',
  applicationName: 'Fattakhov Students',
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  icons: {
    // Заданный вручную icon отключает автослияние с файловой конвенцией
    // Next.js — apple-touch-icon из app/apple-icon.png приходится
    // прописать здесь же, иначе тег для него просто не появится.
    // Без media — то, что возьмёт поисковик и любой клиент, не знающий
    // о теме: тёмный куб на прозрачном, читается на светлом фоне выдачи.
    apple: '/apple-icon.png',
    icon: [
      { url: '/icons/favicon-light.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/favicon-light.png', media: '(prefers-color-scheme: light)', type: 'image/png' },
      { url: '/icons/favicon-dark.png', media: '(prefers-color-scheme: dark)', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  // Свайп по карточке не должен превращаться в зум страницы
  maximumScale: 1,
};

/**
 * Анти-мерцающий скрипт — тот же приём, что в CRM (app/layout.tsx там же):
 * вписан прямо в серверную разметку, а не рождён клиентским компонентом,
 * чтобы React 19 не помечал исполняемый <script> предупреждением при
 * реконсиляции. Ключ "theme" обязан совпадать со STORAGE_KEY в
 * components/theme/ThemeProvider.tsx. По умолчанию — «как в системе», ровно как
 * у ThemeProvider (readStoredTheme): раньше скрипт ставил тёмную, а после
 * загрузки провайдер пересчитывал в системную — на светлом телефоне страница
 * секунды стояла чёрной и вспыхивала светлой. Значения по умолчанию в двух местах
 * обязаны совпадать.
 */
const NO_FLASH_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("theme") || "system";
    var dark = theme === "dark" ||
      (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    if (dark) root.classList.add("dark");
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`;

/**
 * Без JavaScript блоки, которые появляются анимацией (Stagger, Reveal, FadeIn),
 * остались бы невидимыми: их начальное состояние — прозрачность 0 прямо в разметке.
 * Показываем их как есть; приложение целиком без скриптов не работает, об этом
 * честно сказано в плашке ниже.
 */
const NO_SCRIPT_STYLE = `[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/*
          Два набора из четырёх грузим заранее: интерфейс кириллический,
          названия компаний латиницей — эти встретятся на любом экране.
          Расширенные наборы браузер возьмёт сам, если они понадобятся.
        */}
        <link rel="preload" href="/fonts/inter-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <noscript>
          <style dangerouslySetInnerHTML={{ __html: NO_SCRIPT_STYLE }} />
        </noscript>
      </head>
      <body className="grain min-h-dvh bg-ink text-paper" suppressHydrationWarning>
        <noscript>
          <p className="relative z-[80] bg-graphite-900 px-4 py-3 text-center text-sm text-paper">
            Платформе нужен JavaScript: включите его в настройках браузера, чтобы войти и откликаться на вакансии.
          </p>
        </noscript>
        <ThemeProvider>
          <Aurora />
          <ToastProvider>
            <RouteCurtain>{children}</RouteCurtain>
          </ToastProvider>
          <ThemeToggle />
          <SplashScreen />
          <AnalyticsGate />
        </ThemeProvider>
      </body>
    </html>
  );
}
