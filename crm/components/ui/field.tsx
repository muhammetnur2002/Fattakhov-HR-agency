"use client"

import * as React from "react"
import { CircleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/**
 * Поле формы: подпись, поле, подсказка и ошибка — одним компонентом.
 *
 * Зачем. Ошибка «ИНН — 10 цифр» стояла общей строкой над кнопкой, и человек искал, какое из
 * восьми полей неверно. Теперь текст ошибки лежит под самим полем, а поле связано с ним для
 * читалки: `aria-invalid` и `aria-describedby` (подсказка и ошибка по очереди) ставит `Field`,
 * не разметка формы. Красную рамку рисуют сами `Input`, `Textarea` и `SelectTrigger` по
 * `aria-invalid` (токен `--destructive`, в покое кольцо, на фокусе обычное).
 *
 * Два способа подключить поле:
 *
 * ```tsx
 * <Field label="Почта" error={fields.email} hint="Рабочий адрес">
 *   <Input name="email" type="email" />          // id, aria-* добавит Field
 * </Field>
 *
 * <Field label="Роль" error={fields.role}>
 *   {(control) => (                              // поле лежит глубже: Select → SelectTrigger
 *     <Select name="role"><SelectTrigger {...control} /> … </Select>
 *   )}
 * </Field>
 * ```
 *
 * Пара «подпись — поле» — `space-y-2` (правило `form-spacing`); подсказка и ошибка стоят в той
 * же стопке. Ошибка без `role="alert"` намеренно: после отправки фокус уходит на первое неверное
 * поле (`useFormAction`) и читалка зачитывает ошибку вместе с полем; десяток объявлений подряд
 * заглушили бы друг друга. Общая сводка над кнопкой — `FormMessage`, она объявляется.
 */

export type FieldControl = {
  id: string
  "aria-invalid"?: true
  "aria-describedby"?: string
}

type ControlProps = {
  id?: string
  "aria-invalid"?: boolean | "true" | "false"
  "aria-describedby"?: string
}

/**
 * Атрибуты поля для читалки: `id`, `aria-invalid` при ошибке и `aria-describedby` на подсказку и
 * ошибку. Нужны там, где `Field` как обёртка не подходит — поля стоят в своей сетке (subgrid
 * приглашения), а тексты ошибок выводятся отдельно, под рядом. Ошибка при этом — `FieldError`
 * с `id={`${id}-error`}`, подсказка — `${id}-hint`.
 */
function controlProps(
  id: string,
  { error, hint, describedBy }: { error?: string | null; hint?: boolean; describedBy?: string } = {},
): FieldControl {
  const ids = [describedBy, hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ")
  return {
    id,
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(ids ? { "aria-describedby": ids } : {}),
  }
}

function Field({
  label,
  error,
  hint,
  id,
  required,
  className,
  children,
}: {
  /** Подпись. Нет — у поля свой `aria-label`. */
  label?: React.ReactNode
  /** Текст ошибки под полем. Пусто — поле в порядке. */
  error?: string | null
  /** Пояснение под полем: формат, ограничение, что произойдёт. */
  hint?: React.ReactNode
  /** Если у поля уже есть свой `id` (на него ссылаются снаружи) — он сохраняется. */
  id?: string
  /** Звёздочка у подписи. Читалке она не нужна: «обязательное» ей говорит `required` самого поля. */
  required?: boolean
  className?: string
  children: React.ReactElement<ControlProps> | ((control: FieldControl) => React.ReactNode)
}) {
  const generated = React.useId()
  const own = typeof children === "function" ? undefined : children.props.id
  const controlId = id ?? own ?? generated
  const ownDescribedBy =
    typeof children === "function" ? undefined : children.props["aria-describedby"]
  const control = controlProps(controlId, { error, hint: Boolean(hint), describedBy: ownDescribedBy })
  const errorId = error ? `${controlId}-error` : undefined
  const hintId = hint ? `${controlId}-hint` : undefined

  return (
    <div
      data-slot="field"
      data-invalid={error ? "true" : undefined}
      className={cn("space-y-2", className)}
    >
      {label ? (
        <Label htmlFor={controlId}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </Label>
      ) : null}
      {typeof children === "function" ? children(control) : React.cloneElement(children, control)}
      {hint ? (
        <p id={hintId} data-slot="field-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}

/** Ошибка под полем: значок «!» и текст, красным (`--destructive`, ≥4,5:1 на карточке). */
function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null
  return (
    <p
      data-slot="field-error"
      className={cn("flex items-start gap-1.5 text-sm text-destructive", className)}
      {...props}
    >
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Группа полей (галочки, переключатели): легенда сверху, подсказка и ошибка — под всей группой.
 * Ошибку группы читалка получает через `aria-describedby` самой группы.
 */
function FieldSet({
  legend,
  error,
  hint,
  id,
  className,
  children,
}: {
  legend: React.ReactNode
  error?: string | null
  hint?: React.ReactNode
  id: string
  className?: string
  children: React.ReactNode
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined
  return (
    <fieldset
      id={id}
      data-slot="field-set"
      data-invalid={error ? "true" : undefined}
      aria-describedby={describedBy}
      className={cn("space-y-3", className)}
    >
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {children}
      {hint ? (
        <p id={hintId} data-slot="field-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  )
}

export { Field, FieldError, FieldSet, controlProps }
