import { HttpError } from './http-error';

/** Методы, которые ничего не меняют: для них отсутствие Origin — обычное дело (переход по ссылке, загрузка картинки). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Защита от межсайтовой отправки форм.
 *
 * Куки помечены SameSite=Lax, поэтому браузер и так не приложит их к
 * кросс-сайтовому POST. Сверка Origin — второй рубеж на случай клиента,
 * который SameSite не соблюдает.
 *
 * Изменяющий запрос (POST, PUT, PATCH, DELETE) обязан сказать, откуда он:
 * либо заголовком Origin (его браузеры шлют со всеми такими запросами,
 * в том числе на свой же адрес), либо Sec-Fetch-Site: same-origin (он же допускает `Origin: null`). Раньше
 * запрос без Origin пропускался «как не браузерный» — но не браузерный клиент
 * с кукой сессии в этих маршрутах не нужен: службы (cron, CRM, вебхуки) ходят
 * по своим маршрутам с секретом в заголовке, а не с кукой, и проверки Origin
 * не проходят вовсе. Пропуск без Origin оставлял щель для клиентов, которые
 * SameSite не соблюдают и Origin не шлют.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');

  if (!origin) {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return;
    if (request.headers.get('sec-fetch-site') === 'same-origin') return;
    throw new HttpError(403, 'Запрос без указания источника отклонён', 'BAD_ORIGIN');
  }

  // «Origin: null» браузеры шлют из песочниц, WebView и после некоторых редиректов. Сам по себе
  // он ничего не доказывает, но вместе с Sec-Fetch-Site: same-origin браузер подтверждает, что
  // запрос с нашей же страницы, — это то же, что и запрос без Origin, и защиту не ослабляет
  if (origin === 'null' && request.headers.get('sec-fetch-site') === 'same-origin') return;

  const host = request.headers.get('host');
  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, 'Запрос с чужого источника отклонён', 'BAD_ORIGIN');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(403, 'Некорректный заголовок Origin', 'BAD_ORIGIN');
  }
}
