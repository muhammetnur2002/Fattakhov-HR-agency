'use client';

/**
 * Выбор посетителя по аналитическим cookie.
 *
 * До явного согласия счётчик не загружается вовсе: «загрузить и не считать»
 * не годится — запрос к чужому серверу к этому моменту уже состоялся, вместе
 * с адресом страницы и заголовками браузера.
 *
 * Хранится в localStorage, а не в cookie: собственный выбор про cookie
 * незачем хранить в cookie, а серверу он не нужен — счётчик подключается
 * в браузере.
 */
const KEY = 'fhr-students-cookie-choice';

/**
 * Версия текста баннера и раздела «Cookie» в политике. Поменяли формулировки —
 * подняли версию, и старый выбор перестаёт считаться сделанным: человек
 * соглашался на другое.
 */
export const BANNER_VERSION = '2026-10-01';

export type CookieChoice = 'accepted' | 'rejected';

type Stored = { choice: CookieChoice; version: string; at: string };

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', emit);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener('storage', emit);
  };
}

/** Снимок выбора — строка, а не объект: снимок обязан быть стабильным по ссылке. */
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
  const record: Stored = { choice, version: BANNER_VERSION, at: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Не сохранилось — спросим снова. Это лучше, чем считать согласие данным
  }
  emit();
}

/** Выбор, сделанный под старой версией текста, не считается сделанным. Битый JSON страницу не роняет. */
function parse(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const stored = value as Partial<Stored>;
    if (stored.choice !== 'accepted' && stored.choice !== 'rejected') return null;
    if (stored.version !== BANNER_VERSION) return null;
    return stored as Stored;
  } catch {
    return null;
  }
}

export function isAccepted(raw: string | null): boolean {
  return parse(raw)?.choice === 'accepted';
}

export function isAnswered(raw: string | null): boolean {
  return parse(raw) !== null;
}
