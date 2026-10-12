/**
 * Календарная сетка без базы: московские даты, повторения, раскладка дня,
 * обратный отсчёт и iCal-фид задач (RRULE, EXDATE, VALARM).
 */
import { describe, expect, it } from "vitest";

import {
  DAY_STEPS,
  layoutDay,
  matchesPerson,
  parsePersonFilter,
  personFilterValue,
  SLOT_HEIGHT,
  windowFor,
  WINDOW_MINUTES,
} from "@/components/calendar/calendar-model";
import { remainingText } from "@/lib/calendar/countdown";
import { buildCalendar } from "@/lib/calendar/ical";
import {
  addDays,
  addMonths,
  atMinutes,
  dayKeyOf,
  fromMoscowInput,
  isSaturday,
  isSunday,
  minutesOfDay,
  monthGrid,
  startOfDay,
  toMoscowInput,
  weekdayOf,
  weekStart,
} from "@/lib/calendar/moscow";
import { expandOccurrences, formatRule, isOccurrenceOf, parseRule } from "@/lib/calendar/recurrence";
import { taskFeedEvents, toRRule } from "@/lib/calendar/task-feed";
import { utcToZonedInput, zonedToUtc } from "@/lib/calendar/timezone";

describe("московские даты", () => {
  it("совпадают с Intl для Europe/Moscow в разные моменты года", () => {
    for (const iso of ["2026-01-01T00:00:00Z", "2026-06-30T20:59:59Z", "2026-06-30T21:00:00Z", "2026-12-31T21:00:00Z", "2030-03-04T07:00:00Z"]) {
      const d = new Date(iso);
      expect(toMoscowInput(d)).toBe(utcToZonedInput(d, "Europe/Moscow"));
      expect(fromMoscowInput(toMoscowInput(d)).getTime()).toBe(zonedToUtc(utcToZonedInput(d, "Europe/Moscow"), "Europe/Moscow").getTime());
    }
  });

  it("день определяется по Москве, а не по UTC: 21:00 UTC уже следующий день", () => {
    expect(dayKeyOf(new Date("2026-10-11T20:59:00Z"))).toBe("2026-10-11");
    expect(dayKeyOf(new Date("2026-10-11T21:00:00Z"))).toBe("2026-10-12");
    expect(startOfDay("2026-10-12").toISOString()).toBe("2026-10-11T21:00:00.000Z");
    expect(minutesOfDay(new Date("2026-10-11T21:30:00Z"))).toBe(30);
    expect(atMinutes("2026-10-12", 14 * 60 + 30).toISOString()).toBe("2026-10-12T11:30:00.000Z");
  });

  it("листание дней и месяцев, границы года и високосный февраль", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("неделя с понедельника; суббота и воскресенье", () => {
    expect(weekdayOf("2026-10-12")).toBe(0); // понедельник
    expect(isSaturday("2026-10-17")).toBe(true);
    expect(isSunday("2026-10-18")).toBe(true);
    expect(isSaturday("2026-10-16")).toBe(false);
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
  });

  it("сетка месяца: недели по 7 дней с понедельника, покрывает весь месяц", () => {
    const weeks = monthGrid("2026-10-12");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks.flat()).toContain("2026-10-31");
    expect(weeks).toHaveLength(5);
    // Февраль 2027 ровно по четыре недели
    expect(monthGrid("2027-02-10")).toHaveLength(4);
    expect(monthGrid("2026-08-01")).toHaveLength(6);
  });

  it("поле datetime-local: туда и обратно, мусор не принимается", () => {
    expect(fromMoscowInput("2026-10-12T14:30").toISOString()).toBe("2026-10-12T11:30:00.000Z");
    expect(Number.isNaN(fromMoscowInput("2026-02-31T10:00").getTime())).toBe(true);
    expect(Number.isNaN(fromMoscowInput("2026-10-12T25:00").getTime())).toBe(true);
    expect(Number.isNaN(fromMoscowInput("не дата").getTime())).toBe(true);
  });
});

describe("правила повторения", () => {
  it("разбор и каноническая запись", () => {
    expect(parseRule("DAILY")).toEqual({ freq: "DAILY" });
    expect(parseRule("MONTHLY")).toEqual({ freq: "MONTHLY" });
    expect(parseRule("WEEKLY:FR,MO")).toEqual({ freq: "WEEKLY", days: [0, 4] });
    expect(formatRule({ freq: "WEEKLY", days: [4, 0, 0, 2] })).toBe("WEEKLY:MO,WE,FR");
    for (const bad of ["", "WEEKLY", "WEEKLY:", "WEEKLY:XX", "YEARLY", "daily"]) {
      expect(parseRule(bad)).toBeNull();
    }
  });

  it("еженедельное по пн и пт, с концом включительно и без вхождений до начала", () => {
    const task = {
      startsAt: new Date("2030-03-04T07:00:00Z"), // понедельник
      recurrenceRule: "WEEKLY:MO,FR",
      recurrenceUntil: startOfDay("2030-03-15"), // пятница, включительно
    };
    const all = expandOccurrences(task, new Date("2030-01-01T00:00:00Z"), new Date("2030-12-31T00:00:00Z"));
    expect(all.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual([
      "2030-03-04", "2030-03-08", "2030-03-11", "2030-03-15",
    ]);
    expect(isOccurrenceOf(task, new Date("2030-03-08T07:00:00Z"))).toBe(true);
    expect(isOccurrenceOf(task, new Date("2030-03-09T07:00:00Z"))).toBe(false);
    expect(isOccurrenceOf(task, new Date("2030-03-18T07:00:00Z"))).toBe(false);
  });

  it("отмена, перенос и выполнение вхождения; перенос попадает в диапазон по новому времени", () => {
    const task = { startsAt: new Date("2030-03-04T07:00:00Z"), recurrenceRule: "DAILY", recurrenceUntil: null };
    const tue = new Date("2030-03-05T07:00:00Z");
    const wed = new Date("2030-03-06T07:00:00Z");
    const thu = new Date("2030-03-07T07:00:00Z");
    const movedTo = new Date("2030-03-20T09:00:00Z");
    const exceptions = [
      { occurrenceDate: tue, cancelled: true, movedToStartsAt: null, completedAt: null },
      { occurrenceDate: wed, cancelled: false, movedToStartsAt: movedTo, completedAt: null },
      { occurrenceDate: thu, cancelled: false, movedToStartsAt: null, completedAt: new Date() },
    ];
    const week = expandOccurrences(task, new Date("2030-03-04T00:00:00Z"), new Date("2030-03-08T00:00:00Z"), exceptions);
    expect(week.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(["2030-03-04", "2030-03-07"]);
    expect(week[1].completedAt).not.toBeNull();
    const later = expandOccurrences(task, new Date("2030-03-20T00:00:00Z"), new Date("2030-03-21T00:00:00Z"), exceptions);
    expect(later.map((o) => o.startsAt.toISOString())).toContain(movedTo.toISOString());
    expect(later.find((o) => o.startsAt.getTime() === movedTo.getTime())?.occurrenceDate.getTime()).toBe(wed.getTime());
  });

  it("обычная задача — одно вхождение в своём диапазоне", () => {
    const task = { startsAt: new Date("2030-03-04T07:00:00Z"), recurrenceRule: null, recurrenceUntil: null };
    expect(expandOccurrences(task, new Date("2030-03-04T00:00:00Z"), new Date("2030-03-05T00:00:00Z"))).toHaveLength(1);
    expect(expandOccurrences(task, new Date("2030-03-05T00:00:00Z"), new Date("2030-03-06T00:00:00Z"))).toHaveLength(0);
  });

  it("огромный диапазон не раскручивается без предела", () => {
    const task = { startsAt: new Date("2030-01-01T07:00:00Z"), recurrenceRule: "DAILY", recurrenceUntil: null };
    const rows = expandOccurrences(task, new Date("2030-01-01T00:00:00Z"), new Date("2100-01-01T00:00:00Z"));
    expect(rows.length).toBeLessThanOrEqual(1000);
  });
});

describe("осталось до срока", () => {
  const due = new Date("2030-03-04T12:00:00Z");
  it("часы и минуты, потом «просрочено»", () => {
    expect(remainingText(due, new Date("2030-03-04T09:45:00Z"))).toBe("осталось 2 ч 15 мин");
    expect(remainingText(due, new Date("2030-03-04T11:15:00Z"))).toBe("осталось 45 мин");
    expect(remainingText(due, new Date("2030-03-04T10:00:00Z"))).toBe("осталось 2 ч");
    expect(remainingText(due, new Date("2030-03-02T09:00:00Z"))).toBe("осталось 2 д 3 ч");
    expect(remainingText(due, new Date("2030-03-04T11:59:40Z"))).toBe("осталось меньше минуты");
    expect(remainingText(due, new Date("2030-03-04T12:00:00Z"))).toBe("просрочено");
    expect(remainingText(due, new Date("2030-03-04T13:00:00Z"))).toBe("просрочено");
  });
});

describe("масштаб дня и раскладка блоков", () => {
  it("шаги 60, 30, 15, 5; на 15 и 5 окно 4 и 2 часа вокруг текущего времени", () => {
    expect([...DAY_STEPS]).toEqual([60, 30, 15, 5]);
    expect(WINDOW_MINUTES[60]).toBe(1440);
    expect(windowFor(60, 700)).toEqual({ start: 0, end: 1440 });
    expect(windowFor(30, 700)).toEqual({ start: 0, end: 1440 });
    // 14:35 при шаге 15: окно 12:30–16:30
    expect(windowFor(15, 14 * 60 + 35)).toEqual({ start: 12 * 60 + 30, end: 16 * 60 + 30 });
    // 14:35 при шаге 5: окно 13:35–15:35
    expect(windowFor(5, 14 * 60 + 35)).toEqual({ start: 13 * 60 + 35, end: 15 * 60 + 35 });
    // У границ суток окно прижимается
    expect(windowFor(15, 20)).toEqual({ start: 0, end: 240 });
    expect(windowFor(5, 23 * 60 + 50)).toEqual({ start: 1320, end: 1440 });
    // Чем мельче шаг, тем выше строка
    expect(SLOT_HEIGHT[5]).toBeLessThan(SLOT_HEIGHT[60]);
  });

  it("пересекающиеся блоки делят ширину, соседние занимают всю", () => {
    const placement = layoutDay([
      { key: "a", startMin: 600, endMin: 660 },
      { key: "b", startMin: 630, endMin: 690 },
      { key: "c", startMin: 600, endMin: 615 },
      { key: "d", startMin: 720, endMin: 780 },
    ]);
    // c закончился до начала b и освободил колонку: колонок всего две
    expect(placement.get("a")).toEqual({ col: 0, cols: 2 });
    expect(placement.get("c")).toEqual({ col: 1, cols: 2 });
    expect(placement.get("b")).toEqual({ col: 1, cols: 2 });
    expect(placement.get("d")).toEqual({ col: 0, cols: 1 });
  });

  it("фильтр «Все / Мои / сотрудник» по исполнителю и по участникам интервью", () => {
    expect(matchesPerson("all", "me", "x")).toBe(true);
    expect(matchesPerson("mine", "me", "me")).toBe(true);
    expect(matchesPerson("mine", "me", "x")).toBe(false);
    expect(matchesPerson({ userId: "x" }, "me", "x")).toBe(true);
    expect(matchesPerson("mine", "me", ["a", "me"])).toBe(true);
    expect(matchesPerson({ userId: "x" }, "me", ["a", "me"])).toBe(false);
    for (const f of ["all", "mine", { userId: "u1" }] as const) {
      expect(parsePersonFilter(personFilterValue(f))).toEqual(f);
    }
  });
});

describe("iCal: задачи", () => {
  const base = {
    id: "t1",
    title: "Позвонить, срочно; важно",
    description: "Детали",
    dueAt: new Date("2030-03-03T21:30:00Z"), // 00:30 понедельника 4 марта по Москве
    durationMinutes: 30,
    hasDeadline: true,
    remindBeforeMinutes: 60,
    recurrenceRule: null as string | null,
    recurrenceUntil: null as Date | null,
    completedAt: null as Date | null,
    isPersonal: true,
    createdById: "u1",
    exceptions: [] as { occurrenceDate: Date; cancelled: boolean; movedToStartsAt: Date | null }[],
  };
  const names = new Map([["u1", "Иван"]]);

  it("обычная задача: VEVENT с напоминанием VALARM, интервью без изменений", () => {
    const ics = buildCalendar({
      name: "Тест",
      events: [
        { uid: "interview-1@hr-platform", startsAt: new Date("2030-03-04T07:00:00Z"), durationMinutes: 60, summary: "Интервью" },
        ...taskFeedEvents([base], names, "https://crm.example"),
      ],
    });
    expect(ics).toContain("UID:task-t1@hr-platform");
    expect(ics).toContain("SUMMARY:Позвонить\\, срочно\\; важно");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(ics).not.toContain("VTIMEZONE");
    expect(ics).not.toContain("RRULE");
    // Интервью: прежний вид без TZID и тревог
    const interview = ics.split("BEGIN:VEVENT")[1];
    expect(interview).toContain("DTSTART:20300304T070000Z");
    expect(interview).not.toContain("VALARM");
  });

  it("задача без дедлайна не получает VALARM; выполненная помечена галочкой", () => {
    const ics = buildCalendar({
      name: "Тест",
      events: taskFeedEvents([{ ...base, hasDeadline: false, completedAt: new Date() }], names, "https://crm.example"),
    });
    expect(ics).not.toContain("VALARM");
    expect(ics).toContain("SUMMARY:✓ Позвонить");
  });

  it("повторяющаяся: RRULE по московскому дню, EXDATE и перенесённое вхождение", () => {
    const rule = { ...base, recurrenceRule: "WEEKLY:MO,FR", recurrenceUntil: startOfDay("2030-04-01") };
    expect(toRRule(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20300401T205959Z");

    const events = taskFeedEvents(
      [
        {
          ...rule,
          exceptions: [
            { occurrenceDate: new Date("2030-03-07T21:30:00Z"), cancelled: true, movedToStartsAt: null },
            { occurrenceDate: new Date("2030-03-10T21:30:00Z"), cancelled: false, movedToStartsAt: new Date("2030-03-11T08:00:00Z") },
          ],
        },
      ],
      names,
      "https://crm.example",
    );
    const ics = buildCalendar({ name: "Тест", events });
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("DTSTART;TZID=Europe/Moscow:20300304T003000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20300401T205959Z");
    expect(ics).toContain("EXDATE;TZID=Europe/Moscow:20300308T003000");
    expect(ics).toContain("EXDATE;TZID=Europe/Moscow:20300311T003000");
    expect(ics).toContain("RECURRENCE-ID;TZID=Europe/Moscow:20300311T003000");
    expect(ics).toContain("DTSTART;TZID=Europe/Moscow:20300311T110000");
    expect(ics.match(/UID:task-t1@hr-platform/g)).toHaveLength(2);
    expect(toRRule({ ...base, recurrenceRule: "DAILY" })).toBe("FREQ=DAILY");
    expect(toRRule({ ...base, recurrenceRule: "MONTHLY" })).toBe("FREQ=MONTHLY;BYMONTHDAY=4");
  });

  it("поставленная другим: в описании видно, кто поставил", () => {
    const ics = buildCalendar({
      name: "Тест",
      events: taskFeedEvents([{ ...base, isPersonal: false }], names, "https://crm.example"),
    });
    expect(ics).toContain("Поставил(а): Иван");
  });
});
