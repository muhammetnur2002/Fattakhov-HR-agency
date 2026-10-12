"use client";

/**
 * Постоянная область для читалки: сообщение «Сохранено» объявляется через неё.
 *
 * Зачем. Живая область (`role="status"`), которой не было в странице до появления текста, объявляется
 * не везде: читалка подписывается на изменения области, а не на её появление. Поэтому «Сохранено»,
 * вставленное в страницу сразу вместе с текстом, в части связок читалки и браузера пропадало.
 * Область стоит в корневом макете с первой отрисовки и всегда пуста; `announce()` меняет только её
 * содержимое. Ошибка этого не требует: `role="alert"` читалки объявляют и при вставке.
 *
 * Не внутри формы и не рядом с `FormMessage`: пустой элемент среди детей `space-y-*` давал бы лишние
 * 16px у кнопки. Видимая плашка успеха своей роли не имеет — иначе читалка прочла бы её дважды.
 */
export const LIVE_ANNOUNCER_ID = "live-announcer";

export function LiveAnnouncer() {
  return (
    <div
      id={LIVE_ANNOUNCER_ID}
      data-live-announcer
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}

/** Через сколько после очистки появляется текст: пустая область → полная читается как новое сообщение. */
const REFILL_DELAY_MS = 60;

let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Сказать читалке. Область очищается и заполняется заново: одинаковый текст подряд («Сохранено»
 * дважды) без очистки не считался бы изменением. Области в странице нет (тест, страница без макета) —
 * ничего не происходит.
 */
export function announce(message: string): void {
  if (typeof document === "undefined") return;
  const region = document.getElementById(LIVE_ANNOUNCER_ID);
  if (!region) return;
  region.textContent = "";
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    region.textContent = message;
    pending = undefined;
  }, REFILL_DELAY_MS);
}
