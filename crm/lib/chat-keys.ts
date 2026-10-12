/**
 * Что делает Enter в поле сообщения.
 *
 * С клавиатуры компьютера Enter отправляет, Shift+Enter переносит строку. На экранной клавиатуре
 * телефона Shift+Enter нет, и если Enter отправляет, многострочное сообщение (реквизиты, список
 * вопросов) не написать: каждый перенос уходит недописанным. Поэтому на сенсорном экране
 * (`pointer: coarse`) Enter переносит строку, а отправляет кнопка со стрелкой.
 *
 * Ввод через IME (набор иероглифов, подтверждение подсказки) не трогаем: Enter там
 * подтверждает текст, а не отправляет сообщение.
 */
export function enterSendsMessage(
  e: { key: string; shiftKey: boolean; nativeEvent?: { isComposing?: boolean } },
  coarsePointer: boolean = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
): boolean {
  if (e.key !== "Enter" || e.shiftKey) return false;
  if (e.nativeEvent?.isComposing) return false;
  return !coarsePointer;
}
