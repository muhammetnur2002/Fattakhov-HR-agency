"use client";

import { useEffect, type Ref } from "react";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { announce } from "@/components/ui/live-announcer";
import { cn } from "@/lib/utils";

/**
 * Результат отправки формы — одна плашка на всё приложение.
 *
 * Раньше «не получилось» было в трёх видах: плашка `Alert`, голая красная строка под кнопкой
 * (text-xs, text-sm — по-разному) и toast. А «получилось» — плашка того же вида, что и ошибка,
 * отличавшаяся только цветом. Теперь:
 *
 * - ошибка: значок «!» в круге, `role="alert"` — читалка объявляет сразу;
 * - успех: значок-галочка. Читалке он уходит через постоянную область (`LiveAnnouncer`, вежливо, не
 *   перебивая), а у самой плашки роли нет: живая область, вставленная в страницу уже с текстом,
 *   объявляется не везде, а с двумя озвучками читалка прочла бы «Сохранено» дважды;
 * - `compact` — строка без рамки для кнопок в списках и строк таблиц, где плашка слишком
 *   тяжела; значок и озвучка те же.
 *
 * Канал один: в форме результат — здесь, встроенным сообщением (оно остаётся на экране, пока
 * человек его не прочтёт, и стоит рядом с кнопкой, которую он нажал). Toast — только для
 * действий без формы (перенос карточки, кнопка в списке): `tests/form-message-rule.test.ts`.
 *
 * `data-form-message="error"` — за него хватается `useFormAction`: после неудачной отправки без
 * ошибок у полей фокус уходит на плашку (кнопка на время отправки отключалась, и фокус с неё слетал).
 * Плашка вне формы (после неё, рядом) этим атрибутом не находится: ей нужен `ref={messageRef}` из хука.
 * Пустой результат не рисует ничего: пустой элемент среди детей `space-y-4` давал бы лишний отступ.
 */
export function FormMessage({
  error,
  ok,
  compact = false,
  className,
  ref,
}: {
  error?: string | null;
  ok?: string | null;
  compact?: boolean;
  className?: string;
  /** Плашка ошибки — для `messageRef` из `useFormAction`, если сообщение стоит не внутри формы. */
  ref?: Ref<HTMLElement>;
}) {
  // Успех читалке — через постоянную область: вставленная сразу с текстом `role="status"` объявляется не везде
  useEffect(() => {
    if (ok) announce(ok);
  }, [ok]);

  if (!error && !ok) return null;
  return (
    <>
      {error ? (
        compact ? (
          <p
            ref={ref as Ref<HTMLParagraphElement>}
            role="alert"
            tabIndex={-1}
            data-form-message="error"
            className={cn("flex items-start gap-1.5 text-xs text-destructive", className)}
          >
            <CircleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : (
          <Alert
            ref={ref as Ref<HTMLDivElement>}
            variant="destructive"
            tabIndex={-1}
            data-form-message="error"
            className={className}
          >
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )
      ) : null}
      {ok ? (
        compact ? (
          <p
            data-form-message="ok"
            className={cn("flex items-start gap-1.5 text-xs text-card-foreground", className)}
          >
            <CircleCheckIcon aria-hidden className="mt-px size-3.5 shrink-0 text-primary" />
            <span>{ok}</span>
          </p>
        ) : (
          <Alert variant="success" role="none" data-form-message="ok" className={className}>
            <AlertDescription>{ok}</AlertDescription>
          </Alert>
        )
      ) : null}
    </>
  );
}
