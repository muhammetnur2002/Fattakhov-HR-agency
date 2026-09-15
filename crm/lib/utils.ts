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
