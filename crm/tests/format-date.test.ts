/**
 * Время для человека: зона названа явно, часы процесса ни при чём.
 *
 * Раньше формат считался в зоне того, кто считает: контейнер стоит в UTC,
 * браузер — где угодно, и серверный рендер расходился с гидратацией. Тест
 * ниже подменяет зону процесса и требует одинаковой строки.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_ZONE,
  formatDate,
  formatDateForFileName,
  formatDateNumeric,
  formatDateTime,
  formatDayDivider,
  formatDayMonth,
  formatInZone,
  formatMessageStamp,
  formatTime,
  resolveTimeZone,
  zonedClock,
  zonedDayDiff,
  zonedDayKey,
} from "@/lib/format-date";

// 12 октября 2026, 21:30 UTC: в Москве уже ночь 13-го, во Владивостоке 07:30 13-го
const MOMENT = new Date("2026-10-12T21:30:00Z");

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("зона названа явно", () => {
  it("один момент — разные часы в разных зонах", () => {
    expect(formatTime(MOMENT, "Europe/Moscow")).toBe("00:30");
    expect(formatTime(MOMENT, "Asia/Vladivostok")).toBe("07:30");
    expect(formatTime(MOMENT, "Europe/Kaliningrad")).toBe("23:30");
  });

  it("день тоже зависит от зоны: в Москве уже 13-е", () => {
    expect(formatDayMonth(MOMENT, "UTC")).toBe("12 октября");
    expect(formatDayMonth(MOMENT, "Europe/Moscow")).toBe("13 октября");
  });

  it.each(["UTC", "America/Los_Angeles", "Pacific/Auckland", "Asia/Kolkata"])(
    "зона процесса %s не меняет ни одной строки",
    (processZone) => {
      const render = () => [
        formatDate(MOMENT, "Europe/Moscow"),
        formatDateNumeric(MOMENT, "Europe/Moscow"),
        formatDateTime(MOMENT, "Europe/Moscow"),
        formatTime(MOMENT, "Europe/Moscow"),
        formatInZone(MOMENT, "weekdayDayMonthTime", "Asia/Yekaterinburg"),
        formatMessageStamp(MOMENT, MOMENT, "Europe/Moscow"),
        zonedDayKey(MOMENT, "Europe/Moscow"),
      ];
      process.env.TZ = "UTC";
      const reference = render();
      process.env.TZ = processZone;
      expect(render()).toEqual(reference);
    },
  );

  it("форматы на известной дате", () => {
    const zone = "Europe/Moscow";
    expect(formatDate(MOMENT, zone)).toBe("13 октября 2026 г.");
    expect(formatDateNumeric(MOMENT, zone)).toBe("13.10.2026");
    expect(formatDateTime(MOMENT, zone)).toBe("13.10, 00:30");
    expect(formatInZone(MOMENT, "dayMonthTime", zone)).toBe("13 октября в 00:30");
    expect(formatInZone(MOMENT, "weekdayDayMonth", zone)).toBe("вторник, 13 октября");
    expect(formatInZone(MOMENT, "weekdayDayMonthTime", zone)).toBe("вторник, 13 октября в 00:30");
    expect(formatInZone(MOMENT, "dateTimeSeconds", zone)).toBe("13.10, 00:30:00");
    expect(formatDateForFileName(MOMENT, zone)).toBe("13-10-2026");
  });

  it("строка и число принимаются как момент", () => {
    expect(formatTime("2026-10-12T21:30:00Z", "Europe/Moscow")).toBe("00:30");
    expect(formatTime(MOMENT.getTime(), "Europe/Moscow")).toBe("00:30");
  });
});

describe("зона из базы — свободная строка", () => {
  it("пусто, null и опечатка дают запасную, а не падение", () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("Moscow/Nowhere")).toBe(DEFAULT_TIME_ZONE);
    expect(formatTime(MOMENT, "Moscow/Nowhere")).toBe(formatTime(MOMENT, DEFAULT_TIME_ZONE));
  });

  it("настоящая зона остаётся как есть", () => {
    expect(resolveTimeZone("Asia/Vladivostok")).toBe("Asia/Vladivostok");
  });
});

describe("календарные дни в зоне", () => {
  it("23:50 и 00:10 соседних суток — день разницы, хоть и двадцать минут", () => {
    const before = new Date("2026-10-12T20:50:00Z"); // 23:50 МСК, 12-е
    const after = new Date("2026-10-12T21:10:00Z"); // 00:10 МСК, 13-е
    expect(zonedDayDiff(after, before, "Europe/Moscow")).toBe(1);
    expect(zonedDayDiff(after, before, "UTC")).toBe(0);
  });

  it("через границу месяца и года", () => {
    expect(zonedDayDiff("2026-01-01T09:00:00Z", "2025-12-31T09:00:00Z", "Europe/Moscow")).toBe(1);
    expect(zonedDayDiff("2026-03-01T09:00:00Z", "2026-02-28T09:00:00Z", "Europe/Moscow")).toBe(1);
  });

  it("разделитель дня: сегодня, вчера, дата", () => {
    const now = new Date("2026-10-13T09:00:00Z");
    expect(formatDayDivider("2026-10-13T05:00:00Z", now, "Europe/Moscow")).toBe("Сегодня");
    expect(formatDayDivider("2026-10-12T15:00:00Z", now, "Europe/Moscow")).toBe("Вчера");
    expect(formatDayDivider("2026-10-01T15:00:00Z", now, "Europe/Moscow")).toBe("1 октября");
  });

  it("подпись в списке бесед: сегодня время, раньше короткая дата", () => {
    const now = new Date("2026-10-13T09:00:00Z");
    expect(formatMessageStamp("2026-10-13T05:00:00Z", now, "Europe/Moscow")).toBe("08:00");
    expect(formatMessageStamp("2026-10-10T05:00:00Z", now, "Europe/Moscow")).toBe("10 окт.");
  });

  it("«сегодня» у человека во Владивостоке и в Москве — разные дни", () => {
    const now = new Date("2026-10-13T09:00:00Z"); // 12:00 МСК, 19:00 Владивосток
    const message = "2026-10-12T20:00:00Z"; // 23:00 МСК 12-го, 06:00 Владивосток 13-го
    expect(formatDayDivider(message, now, "Europe/Moscow")).toBe("Вчера");
    expect(formatDayDivider(message, now, "Asia/Vladivostok")).toBe("Сегодня");
  });

  it("показания часов числами", () => {
    expect(zonedClock(MOMENT, "Europe/Moscow")).toEqual({
      year: 2026,
      month: 10,
      day: 13,
      hour: 0,
      minute: 30,
    });
  });
});
