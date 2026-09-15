"use client";

/**
 * Выбор посетителя по аналитическим cookie.
 *
 * До явного согласия счётчик не загружается вовсе - это требование
 * присланного юристом уведомления о cookie: «до выбора „Принять
 * аналитику“ аналитические счётчики не должны загружаться».
 *
 * Разница между «не загружать» и «загрузить и не считать»
 * принципиальная: первое означает, что запроса к чужому серверу
 * не было, второе - что был, вместе с адресом и заголовками.
 *
 * Хранится в localStorage, а не в cookie: собственный выбор про
 * cookie незачем хранить в cookie, а на сервере он не нужен -
 * счётчик подключается в браузере.
 */
const KEY = "fhr-cookie-choice";

/**
 * Версия текста баннера.
 *
 * Требование документа юриста: хранить не только сам выбор, но и
 * версию, под которой он сделан. Поменяли формулировки - подняли
 * версию, и старый выбор перестаёт считаться сделанным: человек
 * соглашался на другое.
 */
export const BANNER_VERSION = "2026-08-13";

export type CookieChoice = "accepted" | "rejected";

/** Что хранится: выбор, версия текста и момент. */
type Stored = { choice: CookieChoice; version: string; at: string };

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", emit);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", emit);
  };
}

/**
 * Снимок выбора.
 *
 * Возвращает строку, а не объект: снимок обязан быть стабильным
 * по ссылке, иначе React перерисовывает бесконечно.
 */
export function getSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Приватный режим: считаем, что согласия нет
    return null;
  }
}

/** На сервере выбора нет, и счётчик там не нужен. */
export function getServerSnapshot(): string | null {
  return null;
}

export function setChoice(choice: CookieChoice): void {
  const запись: Stored = {
    choice,
    version: BANNER_VERSION,
    at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(запись));
  } catch {
    // Не сохранилось - значит спросим снова. Это лучше, чем
    // считать согласие данным
  }
  emit();
}

export function clearChoice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего чистить
  }
  emit();
}

/**
 * Разбор сохранённого выбора.
 *
 * Выбор, сделанный под старой версией текста, не считается сделанным:
 * баннер покажется снова. Иначе правка формулировок молча оставила бы
 * нас с согласием на текст, которого человек не видел.
 *
 * Ломаный или чужой JSON не должен ронять страницу: в хранилище мог
 * остаться формат прошлой версии, а руками туда пишет кто угодно.
 */
function читать(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const o = v as Partial<Stored>;
    if (o.choice !== "accepted" && o.choice !== "rejected") return null;
    if (o.version !== BANNER_VERSION) return null;
    return o as Stored;
  } catch {
    return null;
  }
}

export function isAccepted(raw: string | null): boolean {
  return читать(raw)?.choice === "accepted";
}

export function isAnswered(raw: string | null): boolean {
  return читать(raw) !== null;
}
