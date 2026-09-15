/**
 * Внешние адреса продукта.
 *
 * Их два, и они разные:
 *
 *   сайт        - лендинг, куда приходят с рекламы и из поиска
 *   приложение  - кабинеты и все ссылки, которые мы шлём людям
 *
 * Всё, что уходит в письмо, в Telegram или в календарь, обязано вести
 * в приложение: приглашение, согласие на ПДн, выбор времени интервью,
 * лента встреч. Ссылка на согласие, открывшаяся на маркетинговом
 * домене, это в лучшем случае 404, в худшем - потерянный кандидат.
 *
 * Одно место вместо девяти повторов `process.env.AUTH_URL ?? localhost`:
 * при разъезде доменов забыть один из них было бы слишком просто,
 * а проявилось бы это только на живых людях.
 */

const LOCAL = "http://localhost:3000";

function origin(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  // Хвостовой слэш ломает склейку: получилось бы //invite/...
  return raw.replace(/\/+$/, "");
}

/** Адрес приложения: кабинеты и все ссылки для людей. */
export function appOrigin(): string {
  return origin(process.env.APP_URL ?? process.env.AUTH_URL, LOCAL);
}

/** Адрес сайта. По умолчанию совпадает с приложением: домены разводят при деплое. */
export function siteOrigin(): string {
  return origin(process.env.SITE_URL, appOrigin());
}

/** Абсолютная ссылка в приложение. Путь начинается со слэша. */
export function appUrl(path = ""): string {
  return `${appOrigin()}${path}`;
}

/** Абсолютная ссылка на сайт. */
export function siteUrl(path = ""): string {
  return `${siteOrigin()}${path}`;
}

/** Студенческая платформа в разработке: свой dev-сервер рядом с этим. */
const STUDENTS_LOCAL = "http://localhost:3001";

/**
 * Адрес студенческой платформы — отдельного приложения со своей базой.
 *
 * На проде без STUDENTS_URL адреса нет вовсе, и кнопки на сайте
 * прячутся: подставить localhost значило бы показать посетителю
 * кнопку, которая никуда не ведёт.
 */
export function studentsOrigin(): string | null {
  const fallback =
    process.env.NODE_ENV === "production" ? "" : STUDENTS_LOCAL;
  return origin(process.env.STUDENTS_URL, fallback) || null;
}

/** Абсолютная ссылка на студенческую платформу или null, если адрес не задан. */
export function studentsUrl(path = ""): string | null {
  const base = studentsOrigin();
  return base ? `${base}${path}` : null;
}

/**
 * Имя хоста сайта без схемы и порта. Нужно прокси, чтобы отличить
 * запрос к сайту от запроса к приложению. Пусто, если домены не разведены.
 */
export function siteHost(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}
