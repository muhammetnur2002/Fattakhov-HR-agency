"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Минута — столько же, сколько между пульсами собеседников. */
const INTERVAL_MS = 60_000;
const MIN_GAP_MS = 15_000;

/**
 * Обновляет данные открытого экрана, пока вкладка на виду, — чтобы
 * «В сети» у собеседника не застывало на моменте загрузки страницы.
 *
 * router.refresh() перечитывает серверные части (список диалогов, счётчики,
 * статусы) и не трогает то, что человек набрал в полях. Скрытая вкладка не
 * обновляется; при возврате — сразу. Ничего не рисует.
 */
export function PresenceRefresh() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();

    function refresh() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      router.refresh();
    }

    const timer = setInterval(refresh, INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
