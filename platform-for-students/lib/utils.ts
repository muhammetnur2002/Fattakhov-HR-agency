import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Русское склонение: plural(3, 'отклик', 'отклика', 'откликов') → 'отклика' */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

const nf = new Intl.NumberFormat('ru-RU');

export function formatMoney(value: number): string {
  return nf.format(Math.round(value));
}

export function formatSalary(from?: number | null, to?: number | null, currency = '₽'): string {
  if (!from && !to) return 'по договорённости';
  if (from && to && from !== to) return `${formatMoney(from)} — ${formatMoney(to)} ${currency}`;
  const single = (from ?? to) as number;
  return `${from ? 'от ' : 'до '}${formatMoney(single)} ${currency}`;
}

export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Детерминированный оттенок из строки. Нужен, чтобы у каждой компании была
 * своя, но всегда одна и та же подложка — узнаваемость без загрузки логотипа.
 * Диапазон намеренно узкий (холодные тона), иначе лента распадается на радугу.
 */
export function brandHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 190 + (Math.abs(h) % 60); // 190..250 — сине-голубой сектор
}

export function companyGradient(seed: string): string {
  const hue = brandHue(seed);
  return `linear-gradient(135deg, hsl(${hue} 18% 22%) 0%, hsl(${hue - 14} 22% 12%) 55%, hsl(${hue} 12% 8%) 100%)`;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value));
}

/** «2 часа назад» — короткая относительная метка для лент и логов */
export function timeAgo(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  return formatDate(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Время сообщения: только часы и минуты, дата живёт в разделителе дня. */
export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value));
}

/**
 * Подпись разделителя дня в переписке. «Сегодня» и «вчера» словами:
 * дата рядом с сообщением, отправленным час назад, читается как архив.
 */
export function dayLabel(value: string | Date): string {
  const date = new Date(value);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return formatDate(date);
}

/** Один ли это «залп» сообщений: тот же автор и меньше пяти минут разрыва. */
export function isSameBurst(
  previous: { author: string; createdAt: string } | undefined,
  current: { author: string; createdAt: string },
): boolean {
  if (!previous || previous.author !== current.author) return false;
  return Date.parse(current.createdAt) - Date.parse(previous.createdAt) < 5 * 60_000;
}
