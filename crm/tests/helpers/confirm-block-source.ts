/**
 * Поиск «ручных» блоков подтверждения в тексте исходника — для сторожа tests/confirm-block-rule.test.ts.
 *
 * Ручной блок — кнопка отмены («Отмена», «Оставить», «Не удалять»…) и опасная кнопка (красная или «Да, …») вне
 * `<ConfirmBlock>`. Вынесено из теста, чтобы тот же поиск можно было направить на старые исходники (git show) и
 * проверить, что сторож их узнаёт.
 */
import { jsxTree, stripComments, type JsxNode } from "./jsx-source";

/** Подписи кнопок «не надо». */
export const CANCEL_LABEL = /^(Отмена|Оставить|Не отменять|Нет|Назад|Не удалять|Не отзывать)$/;
/** Кнопка-«опасная»: красная или подтверждающая «Да, …». */
export const DANGER_LABEL = /^Да, [а-яё]/;
export const BUTTONS = /^(Button|button|SubmitButton|SubmitButtonBase|Submit|DecisionButton)$/;
/**
 * Только нижняя панель кнопок окна Radix (`DialogFooter`, `AlertDialogFooter`, `SheetFooter`, `DrawerFooter`): «Отмена»
 * и «Сохранить» там — кнопки самого окна, фокус и закрытие ведёт библиотека. Тело окна (`DialogContent`) под
 * исключение НЕ попадает: «Удалить / Не удалять» внутри окна — это блок подтверждения, и фокус в нём ведёт не Radix
 * (окно уже открыто), а наш хук. Блок удаления задачи в календаре стоял именно так и сторож его не видел
 * (проверка 15.10.2026).
 */
const LIBRARY_FOOTER = /^(Dialog|AlertDialog|Sheet|Drawer)Footer$/;

/** Текст между открывающим и закрывающим тегом кнопки (вложенных кнопок не бывает). */
function innerText(source: string, node: JsxNode): string {
  const from = node.index + node.text.length;
  const to = source.indexOf(`</${node.name}>`, from);
  if (node.selfClosing || to < 0) return "";
  return source
    .slice(from, to)
    .replace(/<[^>]*>/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function insideLibraryFooter(node: JsxNode): boolean {
  for (let p = node.parent; p; p = p.parent) if (LIBRARY_FOOTER.test(p.name)) return true;
  return false;
}

/** Ручные блоки в тексте файла: кнопки «отмена» и «опасная» вне ConfirmBlock и вне нижней панели окна Radix. */
export function findManualConfirms(rawSource: string) {
  const source = stripComments(rawSource);
  const tree = jsxTree(source);
  // Кнопка, переданная в `trigger={<Button …>}` или `confirmLabel={…}`, — часть ConfirmBlock, а не отдельная
  const inConfirmBlock = (node: JsxNode) =>
    tree.some((n) => n.name === "ConfirmBlock" && node.index > n.index && node.index < n.index + n.text.length);

  const own = tree.filter((n) => BUTTONS.test(n.name) && !inConfirmBlock(n) && !insideLibraryFooter(n));
  const cancels = own.filter((n) => CANCEL_LABEL.test(innerText(source, n)));
  const dangers = own.filter(
    (n) =>
      /variant=["{]\s*["']?destructive/.test(n.text) ||
      DANGER_LABEL.test(innerText(source, n)) ||
      /\blabel=["']Да, /.test(n.text),
  );
  return { cancels, dangers };
}
