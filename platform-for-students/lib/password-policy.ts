/**
 * Правила пароля, которые можно проверить без сервера: длина и простые
 * шаблоны. Модуль чистый — его читает и форма в браузере, и сервер.
 *
 * Словарь распространённых паролей сюда не входит: десять тысяч строк не
 * нужно возить в бандле к каждому посетителю. Его добавляет сервер
 * (lib/security/password-check.ts), и та же проверка стоит там, где пароль
 * реально задаётся: регистрация, сброс по ссылке, служебные команды.
 *
 * Правило то же, что у CRM (crm/lib/validation/password.ts): длина вместо
 * набора символов. «Заглавная, цифра и знак» даёт Parol123! почти у всех:
 * люди подгоняют привычный пароль под проверку минимальной правкой, а
 * длинная фраза и надёжнее, и запоминается. Формулировки тоже те же —
 * сотрудник и студент не должны читать про один и тот же пароль разное.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Сообщения о слабом пароле. Каждое говорит, что не так и что делать:
 * «слишком простой» без объяснения заставляет гадать.
 */
export const PASSWORD_MESSAGES = {
  common:
    'Это слишком распространённый пароль: такие подбирают в первую очередь. Придумайте фразу из нескольких слов',
  digits: 'Пароль из одних цифр подбирается за секунды. Добавьте буквы или составьте фразу из нескольких слов',
  repeated: 'Слишком однообразный пароль: символы почти не отличаются друг от друга',
  sequence: 'Это простая последовательность (вроде 12345678 или qwertyuiop): её подбирают первой',
  email: 'Пароль не должен содержать вашу почту или её часть',
} as const;

/**
 * Ряды, по которым пароль «идёт»: цифры, алфавиты и ряды клавиатуры в обеих
 * раскладках. Соседние в ряду символы — шаг последовательности, в любую
 * сторону: «qwerty» и «ytrewq» одно и то же. Ряды клавиатуры склеены
 * «змейкой» («asdfghjklzxc» переходит с ряда на ряд, как и рука).
 */
const SEQUENCE_ROWS = [
  '01234567890123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'абвгдежзийклмнопрстуфхцчшщъыьэюя',
  'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  'qwertyuiopasdfghjklzxcvbnm',
  'йцукенгшщзхъфывапролджэячсмитьбю',
];

const NEIGHBORS = (() => {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const row of SEQUENCE_ROWS) {
    const chars = [...row];
    for (let i = 0; i + 1 < chars.length; i++) {
      link(chars[i], chars[i + 1]);
      link(chars[i + 1], chars[i]);
    }
  }
  return map;
})();

/** Каждый следующий символ — сосед предыдущего по какому-либо ряду. */
function isSequence(lower: string): boolean {
  const chars = [...lower];
  if (chars.length < 2) return false;
  for (let i = 0; i + 1 < chars.length; i++) {
    if (!NEIGHBORS.get(chars[i])?.has(chars[i + 1])) return false;
  }
  return true;
}

/**
 * «Слово из словаря + цифры и знаки на конце»: Password2026!, summer2026.
 * Так подгоняют пароль под проверку, и точное совпадение со словарём
 * этого не ловит.
 */
export function dictionaryBase(lower: string): string {
  return lower.replace(/[\d\s!@#$%^&*()_+=.,;:?-]+$/u, '');
}

/** Части почты, по которым пароль угадывают первыми: локальная часть и её слова от четырёх символов. */
function emailParts(email: string): string[] {
  const local = email.trim().toLowerCase().split('@')[0] ?? '';
  const parts = new Set<string>();
  if (local.length >= 4) parts.add(local);
  for (const token of local.split(/[._\-+]+/)) {
    if (token.length >= 4) parts.add(token);
  }
  return [...parts];
}

export interface PasswordContext {
  /** Почта того, кто задаёт пароль, если она известна. */
  email?: string | null;
  /** Проверка по словарю — её подставляет сервер, в браузере словаря нет. */
  isCommon?: (lower: string) => boolean;
}

/**
 * Что не так с паролем — сообщением, либо null, если пароль годится.
 *
 * Длину здесь не проверяем: у неё своё сообщение в схеме, и два замечания
 * про один пароль сбивают. Регистр и пробелы по краям не важны.
 */
export function passwordProblem(password: string, context: PasswordContext = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return null;

  const lower = password.trim().toLowerCase();

  if (new Set(lower).size <= 3) return PASSWORD_MESSAGES.repeated;
  if (isSequence(lower)) return PASSWORD_MESSAGES.sequence;
  if (/^\d+$/.test(lower)) return PASSWORD_MESSAGES.digits;

  if (context.isCommon) {
    if (context.isCommon(lower)) return PASSWORD_MESSAGES.common;
    const base = dictionaryBase(lower);
    if (base && base !== lower && context.isCommon(base)) return PASSWORD_MESSAGES.common;
  }

  if (context.email) {
    const email = context.email.trim().toLowerCase();
    if (email && lower.includes(email)) return PASSWORD_MESSAGES.email;
    for (const part of emailParts(email)) {
      if (lower.includes(part)) return PASSWORD_MESSAGES.email;
    }
  }

  return null;
}
