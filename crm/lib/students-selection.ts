/**
 * Выбранные студенты («Подходит») на время подбора.
 *
 * Хранится в sessionStorage вкладки: между анкетами и списком выбор не
 * теряется, а закрытая вкладка ничего не оставляет. В адрес и на сервер
 * выбранные попадают только в момент «Добавить в кандидаты».
 *
 * Выбрать можно только открыв анкету: галочка живёт на странице анкеты,
 * в списке выбранные лишь отмечаются.
 */

export type PickedStudent = { id: string; name: string };

const KEY = "crm.students.selected";
const EMPTY: PickedStudent[] = [];

const listeners = new Set<() => void>();
let cache: { raw: string | null; items: PickedStudent[] } = { raw: null, items: EMPTY };

function parse(raw: string | null): PickedStudent[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;
    return data.filter(
      (item): item is PickedStudent =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PickedStudent).id === "string" &&
        typeof (item as PickedStudent).name === "string",
    );
  } catch {
    return EMPTY;
  }
}

/** Снимок для useSyncExternalStore: тот же объект, пока хранилище не изменилось. */
export function readSelection(): PickedStudent[] {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    // хранилище закрыто (приватное окно): выбор живёт только в памяти страницы
    return cache.items;
  }
  if (raw !== cache.raw) cache = { raw, items: parse(raw) };
  return cache.items;
}

export function serverSelection(): PickedStudent[] {
  return EMPTY;
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function write(items: PickedStudent[]): void {
  const raw = items.length > 0 ? JSON.stringify(items) : null;
  try {
    if (raw) window.sessionStorage.setItem(KEY, raw);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // без хранилища выбор держится в кэше до перезагрузки
    cache = { raw, items: items.length > 0 ? items : EMPTY };
  }
  for (const listener of listeners) listener();
}

export function pickStudent(student: PickedStudent): void {
  const current = readSelection();
  if (current.some((s) => s.id === student.id)) return;
  write([...current, student]);
}

export function unpickStudents(ids: string[]): void {
  const drop = new Set(ids);
  const next = readSelection().filter((s) => !drop.has(s.id));
  write(next);
}

export function clearSelection(): void {
  write([]);
}

/**
 * Одна строка про всех, кого не удалось добавить в кандидаты: причины сгруппированы, у каждой — сколько студентов.
 * Раньше на каждого студента выводилась своя плашка-ошибка (`role="alert"`): при десяти отказах читалка получала десять
 * срочных объявлений подряд, и они заглушали друг друга. Теперь плашка одна.
 */
export function summarizeFailures(failed: ReadonlyArray<{ reason: string }>): string | null {
  if (failed.length === 0) return null;
  const counts = new Map<string, number>();
  for (const { reason } of failed) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  if (failed.length === 1) return failed[0].reason;
  const last = failed.length % 10;
  const teen = failed.length % 100 >= 11 && failed.length % 100 <= 14;
  const noun = !teen && last === 1 ? "студента" : "студентов";
  const reasons = [...counts].map(([reason, n]) => (n > 1 ? `${reason} (${n})` : reason)).join("; ");
  return `Не удалось добавить ${failed.length} ${noun}: ${reasons}`;
}
