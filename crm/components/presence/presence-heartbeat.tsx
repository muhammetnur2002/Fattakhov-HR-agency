"use client";

import { useEffect } from "react";

/** Раз в минуту, пока вкладка на виду: точность статуса — минуты (lib/presence.ts). */
const INTERVAL_MS = 60_000;

/**
 * Не чаще — на случай, когда вкладку то прячут, то показывают: возврат
 * вызывает пульс сразу, но десять переключений за десять секунд — не десять
 * запросов.
 */
const MIN_GAP_MS = 15_000;

/**
 * Пульс «в сети»: пока вкладка кабинета открыта и видна, раз в минуту — и
 * сразу при возврате на неё — сообщает серверу, что человек здесь
 * (app/api/presence/route.ts). Сервер пишет отметку не чаще раза в минуту
 * на человека, так что частота здесь — про свежесть статуса, а не про базу.
 *
 * Скрытая вкладка не стучится: человек, у которого кабинет остался открытым
 * в фоне на всю ночь, «в сети» не значится. Ничего не рисует.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let last = 0;
    let stopped = false;

    async function ping() {
      if (stopped || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          // Сессия кончилась — прокси отвечает редиректом на вход; идти за
          // ним незачем, и стучаться дальше тоже
          redirect: "manual",
          keepalive: true,
        });
        if (response.type === "opaqueredirect" || response.status === 401) stopped = true;
      } catch {
        // Нет сети — отметим со следующим пульсом, ошибка человеку не нужна
      }
    }

    void ping();
    const timer = setInterval(() => void ping(), INTERVAL_MS);
    const onVisible = () => void ping();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
