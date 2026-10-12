/**
 * Копирование в буфер обмена с запасными путями.
 *
 * `navigator.clipboard` есть не везде: его нет на http, во встроенных
 * браузерах мессенджеров и в старых версиях, а Safari отдаёт его только
 * в ответ на жест и иногда отказывает. Кнопка «Копировать», у которой при
 * сбое ничего не происходит, хуже её отсутствия: человек вставляет
 * пустоту и не понимает почему. Порядок такой:
 *
 *   1. navigator.clipboard.writeText;
 *   2. скрытое поле, выделение и document.execCommand("copy");
 *   3. если и это не вышло — честно сказать «Скопируйте вручную» и
 *      выделить текст на экране, чтобы оставалось нажать Ctrl+C / «Копировать»
 *      в меню выделения (см. `selectText`).
 */

/** Сообщение, когда ни один путь не сработал. Одно на весь продукт. */
export const MANUAL_COPY_MESSAGE = "Скопируйте вручную";

/** Получилось ли записать в буфер. Не бросает: сбой — это `false`, а не исключение. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // пойдём запасным путём
  }
  return copyViaSelection(text);
}

/**
 * Запасной путь: временное поле, выделение, execCommand("copy").
 *
 * Поле ставится на экран (а не за него) и крупным шрифтом: iOS Safari
 * выделяет текст только в видимом поле и увеличивает страницу при фокусе
 * на поле мельче 16px. Фокус возвращается туда, где был, — иначе клавиатурный
 * пользователь терял место на странице.
 */
function copyViaSelection(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const previous = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  try {
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.tabIndex = -1;
    Object.assign(area.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "1px",
      height: "1px",
      padding: "0",
      border: "0",
      opacity: "0",
      fontSize: "16px",
    });
    document.body.appendChild(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus?.({ preventScroll: true });
  }
}

/**
 * Выделить содержимое элемента, чтобы человек скопировал его сам.
 * Поле ввода — через его собственное выделение, остальное — через Range.
 */
export function selectText(element: Element | null | undefined): void {
  if (!element || typeof window === "undefined") return;
  try {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus({ preventScroll: true });
      element.select();
      return;
    }
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // выделение — подсказка, а не обязательство
  }
}
