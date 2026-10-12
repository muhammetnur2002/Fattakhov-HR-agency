/**
 * Черновик анкеты регистрации студента.
 *
 * Пять шагов живут только в состоянии React: обновление страницы, жест «назад» на телефоне
 * или выгрузка вкладки Safari, пока студент ушёл за кодом из почты, стирали фото, график, навыки
 * и «о себе» — анкету приходилось начинать с первого шага (сверка 08.10.2026). Черновик
 * хранится в sessionStorage вкладки: закрыл вкладку — исчез, на сервер не отправляется.
 *
 * Не сохраняются пароль и все согласия: пароль набирается заново, а согласие обязано быть дано
 * сейчас, а не «восстановлено». Файлы (фото, резюме) — только ссылки на уже загруженное.
 *
 * Модуль без зависимостей от React и браузера: его проверяет tests/unit.ts.
 */
export const REGISTRATION_DRAFT_KEY = 'fhr:students:registration:v1';

/** Что не попадает в черновик ни при каких условиях. */
export const NEVER_STORED = ['password', 'consent', 'terms', 'marketing'] as const;

const DRAFT_VERSION = 1;

export function serializeDraft(step: number, form: object): string {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    if (!(NEVER_STORED as readonly string[]).includes(key)) safe[key] = value;
  }
  return JSON.stringify({ v: DRAFT_VERSION, step, form: safe });
}

/**
 * Разобрать сохранённое. Берёт только поля, которые есть в `initial`, и только того же вида
 * (строка к строке, массив к массиву, число к числу; поле, пустое в `initial`, принимает строку
 * или null) — подмена содержимого хранилища форму не сломает. Номер шага ограничивается
 * числом шагов. Возвращает null, если сохранённого нет или оно не разбирается.
 */
export function parseDraft<T extends object>(
  raw: string | null,
  initial: T,
  stepCount: number,
): { step: number; form: T } | null {
  if (!raw) return null;
  let data: { v?: unknown; step?: unknown; form?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || data.v !== DRAFT_VERSION || typeof data.form !== 'object' || data.form === null) return null;

  const stored = data.form as Record<string, unknown>;
  const base0 = initial as Record<string, unknown>;
  const form: Record<string, unknown> = { ...base0 };
  for (const key of Object.keys(base0)) {
    if ((NEVER_STORED as readonly string[]).includes(key) || !(key in stored)) continue;
    const base = base0[key];
    const value = stored[key];
    if (Array.isArray(base)) {
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) form[key] = value;
    } else if (typeof base === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) form[key] = value;
    } else if (typeof base === 'string') {
      if (typeof value === 'string') form[key] = value;
    } else if (base === null) {
      if (value === null || typeof value === 'string') form[key] = value;
    }
  }

  const step = typeof data.step === 'number' && Number.isInteger(data.step) ? data.step : 0;
  return { step: Math.min(Math.max(step, 0), Math.max(stepCount - 1, 0)), form: form as T };
}

/** Есть ли в черновике хоть что-то, ради чего стоит сообщать «мы сохранили ваши ответы». */
export function isMeaningfulDraft(step: number, form: object, initial: object): boolean {
  if (step > 0) return true;
  const a = form as Record<string, unknown>;
  const b = initial as Record<string, unknown>;
  return Object.keys(b).some((key) => !(NEVER_STORED as readonly string[]).includes(key) && JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}
