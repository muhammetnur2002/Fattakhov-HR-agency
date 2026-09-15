/**
 * Токен календарной ленты.
 *
 * Маршрут /api/calendar/<токен>.ics открыт без сессии — так задумано:
 * за лентой ходит приложение календаря, у которого нет наших кук.
 * Значит, подпись в самой ссылке и есть вся защита, и проверять её
 * нужно так же придирчиво, как подписи ссылок на файлы.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { calendarTokenFor, parseCalendarToken } from "@/lib/calendar/ical";

const USER = "usr_rec1";
const OTHER = "usr_owner";

beforeAll(() => {
  // Подпись берёт ключ из окружения, а тестам своего никто не задаёт
  process.env.AUTH_SECRET ??= "test-secret-for-calendar-token";
});

describe("подпись календарной ссылки", () => {
  it("свой токен разбирается обратно в того же пользователя", () => {
    expect(parseCalendarToken(calendarTokenFor(USER))).toBe(USER);
  });

  it("разные пользователи получают разные токены", () => {
    expect(calendarTokenFor(USER)).not.toBe(calendarTokenFor(OTHER));
  });

  it("чужой id со своей подписью не проходит", () => {
    // Самая понятная попытка подделки: взять свою ссылку и заменить
    // в ней идентификатор на чужой, оставив подпись
    const [, signature] = calendarTokenFor(USER).split(".");
    const foreignId = Buffer.from(OTHER).toString("base64url");

    expect(parseCalendarToken(`${foreignId}.${signature}`)).toBeNull();
  });

  it("испорченная подпись не проходит", () => {
    const [id, signature] = calendarTokenFor(USER).split(".");
    const broken = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");

    expect(parseCalendarToken(`${id}.${broken}`)).toBeNull();
  });

  it("подпись другой длины отвергается, а не роняет проверку", () => {
    // timingSafeEqual бросает на буферах разной длины, поэтому длину
    // сверяем отдельно. Без этой проверки подбор подписи ронял бы
    // маршрут пятисоткой вместо честного отказа
    const [id] = calendarTokenFor(USER).split(".");

    expect(() => parseCalendarToken(`${id}.`)).not.toThrow();
    expect(parseCalendarToken(`${id}.короткая`)).toBeNull();
    expect(parseCalendarToken(`${id}.${"A".repeat(200)}`)).toBeNull();
  });

  it("мусор вместо токена не проходит", () => {
    expect(parseCalendarToken("")).toBeNull();
    expect(parseCalendarToken("без-точки")).toBeNull();
    expect(parseCalendarToken(".")).toBeNull();
    expect(parseCalendarToken("..")).toBeNull();
  });

  it("пустой id не выдаётся за пользователя", () => {
    // base64url от пустой строки — тоже пустая строка, и без явной
    // проверки такой токен вернул бы «пользователя» с пустым id
    const empty = Buffer.from("").toString("base64url");
    const [, signature] = calendarTokenFor(USER).split(".");

    expect(parseCalendarToken(`${empty}.${signature}`)).toBeNull();
  });
});
