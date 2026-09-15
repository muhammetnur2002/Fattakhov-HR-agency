import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/ui/sonner";

/**
 * Анти-мерцающий скрипт — прямо в серверной разметке, а не рождённый
 * клиентским компонентом (как это делал next-themes): React такой script
 * вообще не реконсилирует, предупреждению "Encountered a script tag..."
 * (React 19, react-dom/reconcileChildFibers) неоткуда взяться. Ключ
 * "theme" обязан совпадать с STORAGE_KEY в components/shell/theme-provider.tsx.
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
 * Inter, а не Geist из стартового шаблона: у Geist нет кириллицы, и весь
 * русский интерфейс уезжал бы в системный запасной шрифт.
 */
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Платформа",
    template: "%s · Платформа",
  },
  description: "Подбор персонала: кабинет клиента и рабочее место рекрутера",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
