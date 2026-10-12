/**
 * Куда вернуть человека после отправки формы без скриптов (`app/api/no-script-form/route.ts`).
 *
 * Обратно на страницу, откуда форма ушла: до загрузки скриптов сделать с введённым нечего, а страница при
 * повторном открытии получает скрипты ещё раз. Адрес берётся из `Referer` (политика `same-origin` отдаёт его
 * целиком только своим же страницам) и только если он наш: чужая страница не должна выбирать, куда уйдёт
 * человек. Возвращается путь с запросом, без хоста — относительная ссылка не может увести за пределы сайта,
 * и всё же проверяется, что строка именно путь (`//чужой.хост` и `/\чужой.хост` браузеры читают как адрес
 * другого сайта). Всё сомнительное — на главную.
 */
const FALLBACK = "/";

export function noScriptReturnPath(referer: string | null, host: string | null): string {
  if (!referer || !host) return FALLBACK;

  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return FALLBACK;
  }
  if (url.host !== host) return FALLBACK;

  const path = `${url.pathname}${url.search}`;
  // Относительная ссылка начинается с одного слэша: «//a.b» и «/\a.b» браузер читает как адрес другого сайта
  if (!/^\/(?![/\\])/.test(path) || hasBackslashOrControl(path)) return FALLBACK;
  try {
    // Страховка: разбор относительно чужого хоста обязан остаться на нём
    if (new URL(path, "http://placeholder.invalid").origin !== "http://placeholder.invalid") return FALLBACK;
  } catch {
    return FALLBACK;
  }
  return path;
}

function hasBackslashOrControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x5c || code < 0x20) return true;
  }
  return false;
}
