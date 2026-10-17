import { NextResponse } from "next/server";

/**
 * Куда вести человека без сессии — и как это сказать браузеру.
 *
 * Страницу достаточно перенаправить. А вот форма (серверное действие) ждёт в ответ
 * поток данных Next: получив вместо него HTML страницы входа, Next бросает
 * «An unexpected response was received» — и человек видел «Что-то пошло не так»
 * вместо объяснения, что сессия закончилась. Поэтому действию отвечаем так, как отвечает
 * само серверное действие, когда зовёт redirect(): заголовком `x-action-redirect`.
 * Браузер Next по нему делает обычный переход на вход.
 */
export function isServerActionRequest(req: { method: string; headers: Headers }): boolean {
  return req.method === "POST" && req.headers.has("next-action");
}

/** Адрес входа: куда вернуться после него и признак «сессия закончилась» для пояснения на странице. */
export function loginPathFor(pathname: string, expired: boolean): string {
  const params = new URLSearchParams({ callbackUrl: pathname });
  if (expired) params.set("expired", "1");
  return `/login?${params.toString()}`;
}

/** Ответ на серверное действие без сессии: переход на вход вместо страницы ошибки. */
export function actionLoginResponse(loginPath: string): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "x-action-redirect": `${loginPath};push`,
      "content-type": "text/plain",
    },
  });
}

/**
 * Адрес возврата после входа: только внутренний путь. `//хост` и `/\хост` браузер читает как чужой сайт,
 * управляющие символы в адресе недопустимы. Всё сомнительное — на корень.
 */
export function sanitizeCallbackUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return "/";
  for (let i = 0; i < url.length; i++) {
    if (url.charCodeAt(i) < 0x20 || url.charCodeAt(i) === 0x5c) return "/";
  }
  return url;
}
