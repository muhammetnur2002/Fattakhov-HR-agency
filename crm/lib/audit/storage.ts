"use client";

import type { Answers } from "./score";

/**
 * Черновик аудита в браузере.
 *
 * Двенадцать блоков это не минута работы, и потерять их от случайного
 * обновления страницы значит не получить заявку. Поэтому ответы живут
 * в localStorage - и только там: на сервер не уходит ничего, пока
 * человек сам не отправит форму. До этого у нас нет ни его согласия,
 * ни причины хранить его оценки.
 *
 * Обёрнуто в подписку, а не в useEffect с setState, потому что
 * localStorage это и есть внешнее хранилище: React читает его через
 * useSyncExternalStore, без лишнего прохода отрисовки на старте
 * и без расхождения разметки при гидратации.
 *
 * Снимок отдаётся строкой, а не разобранным объектом: снимок обязан
 * быть стабильным по ссылке, иначе React перерисовывает бесконечно.
 * Разбор делает уже вызывающий, один раз на изменение строки.
 */
const KEY = "fhr-audit-v1";

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Чужая вкладка с тем же аудитом должна видеть те же ответы
  window.addEventListener("storage", emit);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", emit);
  };
}

export function getSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Приватный режим и запрет хранилища: аудит работает и без черновика
    return null;
  }
}

/** На сервере черновика нет и быть не может. */
export function getServerSnapshot(): string | null {
  return null;
}

export function save(answers: Answers): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Переполнение или запрет: ответы останутся в памяти вкладки
  }
  emit();
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего чистить - и хорошо
  }
  emit();
}

/**
 * Разбор черновика.
 *
 * Чужой или испорченный JSON не должен ронять страницу: в хранилище
 * мог остаться черновик другой версии, а руками туда вообще может
 * записать кто угодно.
 */
export function parse(raw: string | null): Answers {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};

    const out: Answers = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const stage = Number(k);
      if (!Number.isInteger(stage)) continue;
      if (v === 0 || v === 1 || v === 2) out[stage] = v;
    }
    return out;
  } catch {
    return {};
  }
}
