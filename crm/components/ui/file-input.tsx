"use client";

import * as React from "react";
import { PaperclipIcon } from "lucide-react";

import { formatFileSize } from "@/lib/upload-limits";
import { cn, FIELD_HOVER } from "@/lib/utils";

/**
 * Поле выбора файла в оформлении кабинета.
 *
 * Системное поле файла рисует браузер, и рисует по-разному: подпись «Файл не выбран» на языке
 * системы, кнопка своей формы, ни рамки, ни кольца фокуса, ни тёмной темы, ни отключённого вида.
 * Здесь настоящий `<input type="file">` лежит поверх своей плашки невидимым слоем — поэтому
 * `name`, `required`, `accept`, `multiple`, `onChange`, `setCustomValidity` и перетаскивание файла
 * работают как у родного поля, а пузырь проверки встаёт у самой плашки.
 *
 * Видно: кнопка «Выбрать файл», имя выбранного файла с размером (или «Файл не выбран»), рамка
 * `border-field`, кольцо фокуса, красная рамка при `aria-invalid`, приглушённый вид при `disabled`.
 * Подпись выбранного читает и экран-читалка — через `aria-describedby`.
 *
 * Предел размера — не здесь, а в `lib/upload-limits.ts` (`oversizeMessage`): поле его не знает,
 * его ставит форма через `onChange`. Сырой `<input type="file">` в разметке запрещён
 * (`tests/field-components.test.ts`); исключение — скрытое поле под кнопкой («Добавить логотип»).
 */
function FileInput({
  className,
  size = "default",
  id,
  multiple,
  disabled,
  onChange,
  ref: forwardedRef,
  "aria-describedby": describedBy,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size"> & {
  size?: "default" | "sm";
}) {
  const nameId = React.useId();
  const ref = React.useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = React.useState<{ name: string; size: number }[]>([]);

  // Форма после отправки очищает поля сама (React 19 после action) — подпись должна очиститься вместе с ней
  React.useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const reset = () => setFiles([]);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  const caption =
    files.length === 0
      ? "Файл не выбран"
      : files.length === 1
        ? files[0].name
        : `Выбрано файлов: ${files.length}`;

  return (
    <div
      data-slot="file-input"
      data-size={size}
      data-filled={files.length > 0 ? "" : undefined}
      className={cn(
        "relative flex w-full min-w-0 items-center gap-2 rounded-lg border border-field bg-transparent px-1 text-sm transition-colors dark:bg-input/30",
        "data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:text-xs",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring",
        // Режим высокой контрастности отбрасывает тень кольца — рисуем контур системным цветом
        "forced-colors:has-[:focus-visible]:outline-2 forced-colors:has-[:focus-visible]:outline-[color:Highlight]",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-input/50 has-[:disabled]:opacity-50 dark:has-[:disabled]:bg-input/80",
        "has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:not-has-[:focus-visible]:ring-destructive/20",
        FIELD_HOVER,
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none inline-flex h-[calc(100%-0.5rem)] shrink-0 items-center gap-1 rounded-md border border-field bg-secondary px-2 font-medium text-secondary-foreground"
      >
        <PaperclipIcon className="size-3.5" />
        {multiple ? "Выбрать файлы" : "Выбрать файл"}
      </span>
      <span
        id={nameId}
        aria-hidden
        className={cn(
          "pointer-events-none flex min-w-0 flex-1 items-baseline gap-1.5",
          files.length === 0 && "text-muted-foreground",
        )}
      >
        <span className="truncate">{caption}</span>
        {files.length === 1 && (
          <span className="shrink-0 text-muted-foreground">{formatFileSize(files[0].size)}</span>
        )}
      </span>
      <input
        ref={(node) => {
          ref.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        id={id}
        type="file"
        multiple={multiple}
        disabled={disabled}
        aria-describedby={[nameId, describedBy].filter(Boolean).join(" ")}
        onChange={(event) => {
          setFiles(Array.from(event.target.files ?? [], (f) => ({ name: f.name, size: f.size })));
          onChange?.(event);
        }}
        // Невидимый слой на всю плашку: нажатие, перетаскивание и фокус клавиатуры — у настоящего поля
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
}

export { FileInput };
