"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useTheme } from "@/components/shell/theme-provider";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

/**
 * До монтирования на клиенте `resolvedTheme` неизвестен (сервер темы
 * не знает — она выбирается по системным настройкам браузера). Через
 * useSyncExternalStore, а не useState+useEffect: второе значило бы
 * setState прямо в эффекте и лишний каскад перерисовок.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-11 md:size-7"
      aria-label="Переключить тему"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && (resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />)}
    </Button>
  );
}
