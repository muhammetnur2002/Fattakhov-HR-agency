import type { InstitutionOption } from '@/lib/types';

/** Case-insensitive matching shared by profile suggestions and institution identity. */
export function normalizeSchool(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'.,()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchInstitutions(list: InstitutionOption[], query: string): InstitutionOption[] {
  const q = normalizeSchool(query);
  if (!q) return [];
  const tokens = q.split(' ');

  const scored = list.flatMap((item) => {
    const short = normalizeSchool(institutionLabel(item));
    const names = [short, normalizeSchool(item.shortName ?? ''), normalizeSchool(item.name)];
    // Match prefixes of names/words, never arbitrary letters or the city.
    const words = names.join(' ').split(' ');
    if (!tokens.every((token) => words.some((word) => word.startsWith(token)))) return [];
    const score = short.startsWith(q) ? 0 : 1;
    return [{ item, score }];
  });

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        (a.item.shortName ?? a.item.name).localeCompare(b.item.shortName ?? b.item.name, 'ru'),
    )
    .map((entry) => entry.item);
}

/** Вуз, название которого введено целиком, — без выбора из подсказок. */
export function exactInstitution(list: InstitutionOption[], value: string): InstitutionOption | null {
  const v = normalizeSchool(value);
  if (!v) return null;
  const found = list.filter((item) => normalizeSchool(item.name) === v || normalizeSchool(item.shortName ?? '') === v || normalizeSchool(institutionLabel(item)) === v);
  return found.length === 1 ? found[0] : null;
}

/** Как вуз показывается в профиле, чатах и кабинете работодателя. */
export function institutionLabel(item: { name: string; shortName: string | null }): string {
  // Keep the existing institution ID; КАИ and КНИТУ-КАИ are one university.
  return item.shortName === 'КАИ' ? 'КНИТУ-КАИ' : (item.shortName ?? item.name);
}
