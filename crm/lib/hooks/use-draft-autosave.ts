"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Пауза в наборе, после которой текст уходит на сохранение. */
export const DRAFT_SAVE_DELAY_MS = 800;

type SaveResult = { error?: string } | void;

/**
 * Черновик в поле ввода: текст сохраняется сам, как в мессенджерах.
 *
 * Уходит на сервер после паузы в наборе (800 мс), при сворачивании вкладки,
 * закрытии страницы и при уходе с экрана беседы. Сохранения идут строго по
 * очереди: «отправить» ждёт запись, которая ещё в пути, иначе она могла бы
 * дописаться уже после удаления черновика и вернуть его.
 *
 * - `draft` / `setDraft` — текст поля;
 * - `flush` — сохранить прямо сейчас (если текст изменился) и дождаться записи;
 * - `settle` — перед отправкой: отменить ожидающее сохранение (этот текст
 *   сейчас уйдёт сообщением), дождаться уже начатого;
 * - `clear` — после отправки: поле пустое, на сервере черновик уже удалён.
 */
export function useDraftAutosave({
  initial,
  save,
  delayMs = DRAFT_SAVE_DELAY_MS,
}: {
  initial: string;
  save: (text: string) => Promise<SaveResult>;
  delayMs?: number;
}) {
  const [draft, setDraftState] = useState(initial);
  // Что сейчас в поле и что, как известно, лежит на сервере; null — неизвестно (запись не удалась)
  const latest = useRef(initial);
  const saved = useRef<string | null>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback((): Promise<unknown> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const text = latest.current;
    if (text === saved.current) return chain.current;
    saved.current = text;
    chain.current = chain.current
      .then(() => saveRef.current(text))
      .then((result) => {
        // Не записалось (лимит частоты, сеть) — позже попробуем снова
        if (result && result.error && saved.current === text) saved.current = null;
      })
      .catch(() => {
        if (saved.current === text) saved.current = null;
      });
    return chain.current;
  }, []);

  const setDraft = useCallback(
    (text: string) => {
      latest.current = text;
      setDraftState(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  const settle = useCallback((): Promise<unknown> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    return chain.current;
  }, []);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    latest.current = "";
    saved.current = "";
    setDraftState("");
  }, []);

  // Ушли со страницы или спрятали вкладку — недописанное не должно пропасть
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      void flush();
    };
  }, [flush]);

  return { draft, setDraft, flush, settle, clear };
}
