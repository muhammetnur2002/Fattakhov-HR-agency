import { noScriptReturnPath } from "@/lib/forms/no-script-return";

/**
 * Приёмник отправки формы, пока не загрузились скрипты (`lib/forms/no-script.ts`).
 *
 * Форма, что живёт на клиентском коде, до его загрузки — обычная HTML-форма: без `method="post"` она ушла бы
 * GET-ом, и пароль, код 2FA или ответ анкеты оказались бы в адресной строке, истории и журналах сервера.
 * С POST поля едут телом запроса, а здесь на них даже не смотрят: тело не читается, не логируется и никуда
 * не пишется. Ответ один — 303 на ту же страницу, где скрипты получают ещё одну попытку.
 *
 * Права не нужны: нечего защищать, нечего менять. Прокси маршруты /api не трогает (`proxy.ts`), поэтому
 * путь открыт и тем, кто ещё не вошёл (страницы входа и регистрации).
 */
export async function POST(request: Request) {
  const location = noScriptReturnPath(request.headers.get("referer"), request.headers.get("host"));
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}
