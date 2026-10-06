import { z } from "zod";

import { isCommonPassword } from "@/lib/auth/common-passwords";

/**
 * Требования к паролю.
 *
 * Длина вместо набора символов. Правило «заглавная, цифра и спецсимвол»
 * даёт Parol123! у половины сотрудников: люди подгоняют пароль под
 * проверку минимальным изменением привычного. Длинная фраза и надёжнее,
 * и запоминается.
 */
const MIN_LENGTH = 10;

/**
 * Сообщения о слабом пароле. Каждое говорит, что именно не так и что
 * делать: «слишком простой» без объяснения заставляет гадать.
 */
const MESSAGES = {
  common:
    "Это слишком распространённый пароль: такие подбирают в первую очередь. Придумайте фразу из нескольких слов",
  digits:
    "Пароль из одних цифр подбирается за секунды. Добавьте буквы или составьте фразу из нескольких слов",
  repeated: "Слишком однообразный пароль: символы почти не отличаются друг от друга",
  sequence:
    "Это простая последовательность (вроде 12345678 или qwertyuiop): её подбирают первой",
  email: "Пароль не должен содержать вашу почту или её часть",
} as const;

/**
 * Ряды, по которым пароль «идёт»: цифры, алфавиты и ряды клавиатуры
 * в обеих раскладках. Соседние в ряду символы считаются шагом
 * последовательности — в любую сторону, поэтому «qwerty» и «ytrewq» —
 * одно и то же. Ряды клавиатуры склеены в одну «змейку»: «asdfghjklzxc»
 * переходит с одного ряда на другой, как и рука.
 */
const SEQUENCE_ROWS = [
  "01234567890123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "абвгдежзийклмнопрстуфхцчшщъыьэюя",
  "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
  "qwertyuiopasdfghjklzxcvbnm",
  "йцукенгшщзхъфывапролджэячсмитьбю",
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
 * Люди подгоняют пароль под проверку именно так, и словарь на точное
 * совпадение их не ловит.
 */
function dictionaryBase(lower: string): string {
  return lower.replace(/[\d\s!@#$%^&*()_+=.,;:?\-]+$/u, "");
}

/** Части почты, по которым пароль угадывают первыми: локальная часть и её слова от четырёх символов. */
function emailParts(email: string): string[] {
  const clean = email.trim().toLowerCase();
  const local = clean.split("@")[0] ?? "";
  const parts = new Set<string>();
  if (local.length >= 4) parts.add(local);
  for (const token of local.split(/[._\-+]+/)) {
    if (token.length >= 4) parts.add(token);
  }
  return [...parts];
}

/**
 * Что не так с паролем — сообщением, либо null, если пароль годится.
 *
 * Длину здесь не проверяем: у неё своё сообщение в схеме, и два
 * замечания про один пароль сбивают.
 *
 * email — адрес того, кто задаёт пароль, если он известен. Формы,
 * где почты нет (смена пароля, сброс по ссылке), передают её из базы:
 * правило одно на всех, а контекст разный.
 */
export function passwordProblem(
  password: string,
  context: { email?: string | null } = {},
): string | null {
  if (password.length < MIN_LENGTH) return null;

  const lower = password.trim().toLowerCase();

  if (new Set(lower).size <= 3) return MESSAGES.repeated;
  if (isSequence(lower)) return MESSAGES.sequence;
  if (/^\d+$/.test(lower)) return MESSAGES.digits;

  if (isCommonPassword(lower)) return MESSAGES.common;
  const base = dictionaryBase(lower);
  if (base && base !== lower && isCommonPassword(base)) return MESSAGES.common;

  if (context.email) {
    const email = context.email.trim().toLowerCase();
    if (lower.includes(email)) return MESSAGES.email;
    for (const part of emailParts(email)) {
      if (lower.includes(part)) return MESSAGES.email;
    }
  }

  return null;
}

export const newPasswordSchema = z
  .string()
  .min(MIN_LENGTH, `Не короче ${MIN_LENGTH} символов`)
  .max(200, "Слишком длинный пароль")
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/**
 * Пароль не должен содержать почту того же человека. Для форм, где
 * адрес и пароль приходят вместе (регистрация, создание учётки):
 * схема пароля почты не знает, поэтому проверка вешается на объект.
 * Сообщение — у поля пароля, где человек и будет его исправлять.
 */
export function refinePasswordAgainstEmail<
  T extends { email: string; password: string },
>(value: T, ctx: z.RefinementCtx): void {
  const problem = passwordProblem(value.password, { email: value.email });
  if (problem === MESSAGES.email) {
    ctx.addIssue({ code: "custom", message: problem, path: ["password"] });
  }
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    message: "Пароли не совпадают",
    path: ["newPasswordConfirm"],
  });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    message: "Пароли не совпадают",
    path: ["newPasswordConfirm"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите почту")
    .email("Проверьте адрес почты"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
