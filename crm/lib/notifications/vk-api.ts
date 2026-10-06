import { randomInt } from "node:crypto";

/**
 * ВКонтакте: сообщения от имени сообщества агентства.
 *
 * Почему ВК. Короткий сигнал на телефон нужен: письмо читают не сразу.
 * ВК российский, до его API сервер достаёт, и сообщения сообщества —
 * штатный способ писать людям без отдельного приложения. Единственный
 * мессенджер-канал платформы (Telegram-бот убран 04.10.2026).
 *
 * Как устроено. Пишет сообщество (VK_GROUP_ID) ключом доступа с правом
 * на сообщения (VK_BOT_TOKEN). Человек указывает свою страницу, а мы
 * храним числовой id: короткое имя страницы можно сменить, id — нет.
 * Писать первым сообщество может только тем, кто разрешил ему сообщения,
 * — это правило ВК, и на него же приходится самый частый отказ (901).
 *
 * Ловушка: отказ приходит с кодом ответа 200,
 * и понять его можно только по полю `error` в теле. По коду HTTP судить
 * нельзя — так проверка «доставлено» врала бы всегда.
 */

const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

export type VkResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: number | null; message: string };

/** Разобрать ответ ВК: успех — поле response, отказ — поле error. */
export function parseVkResponse<T>(body: unknown, httpStatus: number): VkResult<T> {
  const payload = body as {
    response?: T;
    error?: { error_code?: number; error_msg?: string };
  } | null;

  if (payload && "response" in payload && payload.response !== undefined) {
    return { ok: true, value: payload.response };
  }
  return {
    ok: false,
    code: payload?.error?.error_code ?? null,
    message: payload?.error?.error_msg ?? `код ответа ${httpStatus}`,
  };
}

async function vkCall<T>(
  method: string,
  params: Record<string, string>,
  token: string,
  timeoutMs = 15_000,
): Promise<VkResult<T>> {
  try {
    const response = await fetch(`${VK_API}/${method}`, {
      method: "POST",
      body: new URLSearchParams({ ...params, access_token: token, v: VK_VERSION }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null);
    return parseVkResponse<T>(body, response.status);
  } catch (error) {
    return {
      ok: false,
      code: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Достать из того, что человек вставил, короткое имя или id страницы.
 *
 * Вставляют что угодно: полную ссылку, ссылку с мобильной версии,
 * «@имя», голое число. Принимаем всё это, а не требуем «правильный
 * формат» — иначе человек не поймёт, чего от него хотят.
 */
export function vkScreenName(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromUrl = raw.match(
    /^(?:https?:\/\/)?(?:m\.|www\.)?vk\.(?:com|ru)\/([A-Za-z0-9_.]+)\/?(?:[?#].*)?$/,
  );
  const candidate = (fromUrl ? fromUrl[1] : raw).replace(/^@/, "");

  return /^[A-Za-z0-9_.]{1,64}$/.test(candidate) ? candidate : null;
}

/** Числовой id страницы человека по тому, что он вставил. */
export async function resolveVkUserId(
  token: string,
  input: string,
): Promise<VkResult<string>> {
  const name = vkScreenName(input);
  if (!name) {
    return {
      ok: false,
      code: null,
      message: "Не похоже на адрес страницы ВКонтакте — вставьте ссылку вида vk.com/имя",
    };
  }
  if (/^\d+$/.test(name)) return { ok: true, value: name };
  if (/^id\d+$/.test(name)) return { ok: true, value: name.slice(2) };

  const result = await vkCall<{ type: string; object_id: number } | []>(
    "utils.resolveScreenName",
    { screen_name: name },
    token,
  );
  if (!result.ok) return result;
  if (Array.isArray(result.value) || result.value.type !== "user") {
    return {
      ok: false,
      code: null,
      message: "Это не личная страница — укажите страницу человека, а не сообщества",
    };
  }
  return { ok: true, value: String(result.value.object_id) };
}

/** Отправить сообщение от имени сообщества. Не бросает. */
export async function vkSendMessage(
  token: string,
  userId: string,
  text: string,
  timeoutMs?: number,
): Promise<VkResult<number>> {
  return vkCall<number>(
    "messages.send",
    {
      user_id: userId,
      // ВК отбрасывает повтор с тем же random_id — защита от двойной
      // отправки при повторе запроса. Уникальный на каждое сообщение
      random_id: String(randomInt(1, 2 ** 31 - 1)),
      message: text,
      dont_parse_links: "1",
    },
    token,
    timeoutMs,
  );
}

/** Частые отказы ВК — человеческими словами. */
export const VK_ERROR_HINTS: Record<number, string> = {
  5: "ВКонтакте не узнаёт ключ сообщества: он отозван или указан с опечаткой",
  15: "у ключа сообщества нет права на сообщения — выдайте его в настройках сообщества",
  27: "этот ключ не подходит: нужен ключ доступа сообщества, а не личный",
  901: "ВКонтакте не даёт написать первым: откройте сообщество агентства и нажмите «Разрешить сообщения»",
  902: "в ваших настройках приватности ВК запрещены сообщения от сообществ",
};

export function vkHumanError(code: number | null): string | null {
  return code === null ? null : (VK_ERROR_HINTS[code] ?? null);
}

export type VkMessage = { from_id?: number; text?: string; payload?: string };

/**
 * Сообщение из поля object события message_new. С версии API 5.103 оно
 * лежит в object.message, в старых версиях object и есть само сообщение.
 * Какую версию выбрали в настройках Callback API, мы не знаем, поэтому
 * принимаем обе: иначе при «неудачной» версии бот молчал бы без единой ошибки.
 */
export function vkMessageOf(
  object: ({ message?: VkMessage } & VkMessage) | undefined,
): VkMessage | undefined {
  if (!object) return undefined;
  if (object.message && typeof object.message === "object") return object.message;
  return typeof object.from_id === "number" ? object : undefined;
}
