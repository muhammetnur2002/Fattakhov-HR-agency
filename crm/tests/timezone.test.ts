/**
 * Перевод «настенного» времени в момент времени.
 *
 * Ошибка здесь не падает и не логируется — встреча просто оказывается
 * на несколько часов не там, и это выясняется, когда кандидат не пришёл.
 */
import { describe, expect, it } from "vitest";

import { utcToZonedInput, zonedToUtc } from "@/lib/calendar/timezone";

describe("время из формы в UTC", () => {
  it("московские 10:00 это 07:00 UTC", () => {
    const utc = zonedToUtc("2026-08-12T10:00", "Europe/Moscow");
    expect(utc.toISOString()).toBe("2026-08-12T07:00:00.000Z");
  });

  it("владивостокские 10:00 это 00:00 UTC", () => {
    const utc = zonedToUtc("2026-08-12T10:00", "Asia/Vladivostok");
    expect(utc.toISOString()).toBe("2026-08-12T00:00:00.000Z");
  });

  it("калининградские 10:00 это 08:00 UTC", () => {
    const utc = zonedToUtc("2026-08-12T10:00", "Europe/Kaliningrad");
    expect(utc.toISOString()).toBe("2026-08-12T08:00:00.000Z");
  });

  it("одно и то же местное время в разных зонах — разные моменты", () => {
    const msk = zonedToUtc("2026-08-12T10:00", "Europe/Moscow");
    const vvo = zonedToUtc("2026-08-12T10:00", "Asia/Vladivostok");
    // Разница Владивостока и Москвы — семь часов
    expect((msk.getTime() - vvo.getTime()) / 3_600_000).toBe(7);
  });

  it("переход через полночь не теряет дату", () => {
    const utc = zonedToUtc("2026-08-12T01:00", "Asia/Vladivostok");
    expect(utc.toISOString()).toBe("2026-08-11T15:00:00.000Z");
  });

  it("зона с переходом на летнее время считается по дате", () => {
    // Берлин летом UTC+2, зимой UTC+1 — фиксированное смещение
    // сдвинуло бы половину встреч на час
    const summer = zonedToUtc("2026-07-15T10:00", "Europe/Berlin");
    const winter = zonedToUtc("2026-01-15T10:00", "Europe/Berlin");

    expect(summer.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(winter.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("мусор на входе даёт невалидную дату, а не случайную", () => {
    expect(Number.isNaN(zonedToUtc("не дата", "Europe/Moscow").getTime())).toBe(
      true,
    );
  });
});

describe("обратный перевод для формы", () => {
  it("возвращает то же местное время", () => {
    const local = "2026-08-12T10:00";
    const utc = zonedToUtc(local, "Europe/Moscow");
    expect(utcToZonedInput(utc, "Europe/Moscow")).toBe(local);
  });

  it("тот же момент в другой зоне показывается иначе", () => {
    const utc = zonedToUtc("2026-08-12T10:00", "Europe/Moscow");
    expect(utcToZonedInput(utc, "Asia/Vladivostok")).toBe("2026-08-12T17:00");
  });

  it("перевод туда и обратно устойчив для дальних зон", () => {
    for (const zone of [
      "Europe/Kaliningrad",
      "Europe/Moscow",
      "Asia/Yekaterinburg",
      "Asia/Vladivostok",
      "Asia/Kamchatka",
    ]) {
      const local = "2026-12-31T23:30";
      expect(utcToZonedInput(zonedToUtc(local, zone), zone), zone).toBe(local);
    }
  });
});
