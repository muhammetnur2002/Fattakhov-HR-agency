import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Скрывает стрелочки счётчика у number-поля.
 *
 * Точечно, а не глобальным правилом: у большинства числовых полей
 * (длительность встречи, количество человек) шаг счётчика как раз
 * к месту. Убирать стрелочки нужно там, где вводят сумму — оклад
 * или границу вилки: шагать до двухсот тысяч по единице бессмысленно,
 * а промахнуться по стрелке рядом с цифрой легко.
 */
export const NO_NUMBER_SPINNER =
  "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

/**
 * Наведение на поле ввода (Input, Textarea, SelectTrigger): рамка темнее в
 * светлой теме и светлее в тёмной — токеном `--foreground`, размеры не
 * меняются. Раньше у `Input` и `Textarea` наведения не было вовсе, а у
 * `Select` — только фоновая подсветка в тёмной теме: поле, на которое
 * указали, ничем не отвечало, и три поля одной формы вели себя по-разному.
 *
 * Без `not-*`-условий намеренно: они прибавляют специфичность и тогда наведение
 * перебило бы рамку фокуса и ошибки. А так порядок вариантов Tailwind сам
 * ставит `hover` ниже `focus-visible` и `aria-invalid`: рамка в фокусе
 * остаётся цветом кольца, красная — красной (проверка — `tests/e2e/selection-states.spec.ts`).
 *
 * Недоступное поле не отвечает на наведение: у `Input` это даёт `pointer-events-none`, у `Textarea`
 * и `SelectTrigger` его нет (курсор «нельзя» нужен), поэтому рамке возвращается покой составным
 * `disabled:hover:` — его специфичность выше обычного `hover:`, а не выше фокуса (отключённое поле
 * фокуса не берёт). Поле с ошибкой остаётся красным и под курсором. Замечание проверки к PR #119.
 */
export const FIELD_HOVER =
  "hover:border-foreground/60 disabled:hover:border-field disabled:hover:aria-invalid:border-destructive dark:disabled:hover:aria-invalid:border-destructive/50"
