import { z } from "zod";

import { CHECK_FIELDS_MESSAGE, type FieldErrors, type FormState } from "@/lib/form-state";

/**
 * Ошибки схемы — по полям формы.
 *
 * Раньше действия отдавали `parsed.error.issues[0].message`: одна строка над формой, без
 * указания, какое поле неверно, и без второй ошибки, пока не исправлена первая. Теперь у каждого
 * поля свой текст (первый по этому полю), а проверки, не привязанные к полю (`path: []`),
 * идут общим сообщением.
 *
 * Ключ — первый элемент пути: `grants.2` относится к полю `grants`.
 */
export function fieldErrorsOf(error: z.ZodError): { fields: FieldErrors; general?: string } {
  const flat = z.flattenError(error);
  const fields: FieldErrors = {};
  for (const [name, messages] of Object.entries(flat.fieldErrors)) {
    const first = (messages as string[] | undefined)?.[0];
    if (first) fields[name] = first;
  }
  return { fields, general: flat.formErrors[0] };
}

/**
 * Ответ действия на непройденную проверку: `return invalidForm(parsed.error)`.
 *
 * Есть ошибки полей — они в `fields`, а `error` остаётся короткой сводкой (или общей ошибкой
 * схемы, если она есть). Полей нет — одно общее сообщение.
 */
export function invalidForm(error: z.ZodError, summary: string = CHECK_FIELDS_MESSAGE): FormState {
  const { fields, general } = fieldErrorsOf(error);
  if (Object.keys(fields).length === 0) return { error: general ?? summary };
  return { error: general ?? summary, fields };
}
