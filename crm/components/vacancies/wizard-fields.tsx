"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Radix не даёт пустую строку как значение пункта — сентинел для
// «ничего не выбрано», единственного случая, где это здесь нужно.
const EMPTY_VALUE = "__empty__";

/**
 * Поля мастера заявки.
 *
 * Подсказка под сложным полем — не украшение: плохой бриф это главная
 * причина плохого подбора, и пример заполнения работает лучше, чем
 * возврат заявки с вопросами через день (ТЗ 7.2.3).
 */
export function Field({
  label,
  htmlFor,
  hint,
  counter,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  /**
   * Счётчик длины — своей строкой под подсказкой.
   *
   * В хвосте подсказки он терялся: подсказка занимает две строки,
   * и «пока 7 символов из 30» читается как её продолжение.
   */
  counter?: string;
  /** Чего не хватает именно здесь. Показывается вместе с подсказкой, а не вместо. */
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span> *</span>}
      </Label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {counter && (
        <p
          id={`${htmlFor}-counter`}
          className="text-xs tabular-nums text-muted-foreground"
        >
          {counter}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Что читает вслух скринридер, встав на поле.
 *
 * Ошибка идёт первой: она про то, что прямо сейчас мешает, подсказка —
 * про то, как заполнять.
 */
function describedBy(
  id: string,
  hint?: string,
  error?: string,
  counter?: string,
) {
  const ids = [
    error && `${id}-error`,
    counter && `${id}-counter`,
    hint && `${id}-hint`,
  ].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  required,
  placeholder,
  type = "text",
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function AreaField({
  id,
  label,
  value,
  onChange,
  hint,
  counter,
  error,
  required,
  placeholder,
  rows = 5,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  counter?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      counter={counter}
      error={error}
      required={required}
    >
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error, counter)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  emptyLabel,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <Select
        value={value === "" ? EMPTY_VALUE : value}
        onValueChange={(v) => onChange(v === EMPTY_VALUE ? "" : v)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {emptyLabel && <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
