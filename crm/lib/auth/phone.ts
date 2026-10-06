/**
 * Номер телефона для входа.
 *
 * Для поиска пользователя номер обязан быть в одной записи: «+7 (900)
 * 000-00-00», «89000000000» и «9000000000» — один и тот же человек,
 * и если хранить как ввели, один номер заведёт три кабинета.
 *
 * Только российские номера: SMS уходят через Yandex Cloud Notification
 * Service, а он принимает номера России в E.164. Номер другой страны
 * лучше отвергнуть сразу и понятно, чем принять и молча не прислать код.
 */

export class PhoneFormatError extends Error {}

/** +79001234567 из любого привычного написания российского номера. */
export function normalizeRuPhone(input: string): string {
  const digits = input.replace(/\D/g, "");

  let national: string | null = null;
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  }

  // Российский мобильный или городской: код начинается не с нуля и не
  // с семёрки — «+7 7…» это Казахстан, туда SMS не уйдёт
  if (!national || !/^[3-689]\d{9}$/.test(national)) {
    throw new PhoneFormatError(
      "Проверьте номер: нужен российский, например +7 900 123-45-67",
    );
  }
  return `+7${national}`;
}

/** +7 900 ***-**-67 — показать, куда ушёл код, не раскрывая номер целиком. */
export function maskPhone(e164: string): string {
  const n = e164.replace(/^\+7/, "");
  return `+7 ${n.slice(0, 3)} ***-**-${n.slice(8)}`;
}
