/**
 * Помощь по кабинету (lib/help/guide.ts).
 *
 * Текст сам по себе тестом не проверить — его сверяют с кодом при каждой
 * правке правила (см. шапку guide.ts). Здесь то, что проверить можно:
 * каждой роли — своя помощь и своя сторона, ключи списка уникальны
 * (GuideList строит ключи из вопросов и абзацев: дубль молча склеит два
 * пункта в один), пункт меню есть у всех, а числа, названные в тексте,
 * совпадают с тем, что на деле требуют схемы.
 */
import { describe, expect, it } from "vitest";

import { NAV_ICONS } from "@/components/shell/icons";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/lib/access";
import { guideFor } from "@/lib/help/guide";
import { DISCLOSURE_CONSENT_TTL_DAYS } from "@/lib/legal/disclosure-consent";
import { AGENCY_NAV, CLIENT_NAV, type NavItem } from "@/lib/nav";
import { ERASURE_DEADLINE_DAYS } from "@/lib/services/erasure";
import { SOURCING_LEAD_TTL_DAYS, SOURCING_REMINDER_DAYS_BEFORE } from "@/lib/sourcing";
import { presentSchema } from "@/lib/validation/candidate";
import { vacancySubmitSchema } from "@/lib/validation/vacancy";

const ALL_ROLES = [...AGENCY_ROLES, ...CLIENT_ROLES];

/** Весь текст помощи роли одной строкой — для поиска по нему. */
function textOf(role: (typeof ALL_ROLES)[number]): string {
  return guideFor(role)
    .sections.flatMap((s) => s.items)
    .flatMap((i) => [i.question, ...i.answer])
    .join("\n");
}

describe("состав по ролям", () => {
  it.each(ALL_ROLES)("%s: первым идёт раздел своей роли из одного пункта", (role) => {
    const [first] = guideFor(role).sections;
    expect(first.title).toBe("Ваша роль");
    expect(first.items).toHaveLength(1);
  });

  it("агентству — порядок работы агентства, клиенту — свой", () => {
    for (const role of AGENCY_ROLES) {
      const titles = guideFor(role).sections.map((s) => s.title);
      expect(titles, role).toContain("Воронка");
      expect(titles, role).not.toContain("Кандидаты");
    }
    for (const role of CLIENT_ROLES) {
      const titles = guideFor(role).sections.map((s) => s.title);
      expect(titles, role).toContain("Кандидаты");
      expect(titles, role).not.toContain("Воронка");
    }
  });

  it("раздел роли у каждой роли свой", () => {
    const questions = ALL_ROLES.map((role) => guideFor(role).sections[0].items[0].question);
    expect(new Set(questions).size).toBe(ALL_ROLES.length);
  });
});

describe("ключи списка", () => {
  it.each(ALL_ROLES)("%s: разделы, вопросы и абзацы не повторяются", (role) => {
    const guide = guideFor(role);

    const titles = guide.sections.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);

    const questions = guide.sections.flatMap((s) => s.items.map((i) => i.question));
    expect(new Set(questions).size).toBe(questions.length);

    for (const item of guide.sections.flatMap((s) => s.items)) {
      expect(item.answer.length, item.question).toBeGreaterThan(0);
      expect(new Set(item.answer).size, item.question).toBe(item.answer.length);
      for (const paragraph of item.answer) expect(paragraph.trim()).not.toBe("");
    }
  });
});

describe("пункт меню", () => {
  const help = (nav: NavItem[], href: string) => nav.find((item) => item.href === href);

  it("есть в обоих кабинетах и не требует прав — помощь нужна каждой роли", () => {
    for (const [nav, href] of [
      [CLIENT_NAV, "/help"],
      [AGENCY_NAV, "/a/help"],
    ] as const) {
      const item = help(nav, href);
      expect(item, href).toBeDefined();
      expect(item?.requires, href).toBeUndefined();
      expect(Object.keys(NAV_ICONS), href).toContain(item?.icon);
    }
  });
});

describe("числа в тексте совпадают со схемами", () => {
  it("заявка: «не меньше 30 символов» в обязанностях и требованиях", () => {
    expect(textOf("CLIENT_ADMIN")).toContain("не меньше 30 символов");

    const brief = (n: number) => ({
      title: "Логист-диспетчер",
      responsibilities: "а".repeat(n),
      requirements: "б".repeat(n),
    });
    expect(vacancySubmitSchema.safeParse(brief(29)).success).toBe(false);
    expect(vacancySubmitSchema.safeParse(brief(30)).success).toBe(true);
  });

  it("представление: «не меньше 100 символов» в «почему подходит»", () => {
    expect(textOf("RECRUITER")).toContain("не меньше 100 символов");

    const present = (n: number) => ({
      presentationSummary: "в".repeat(n),
      salaryExpectation: "150000",
    });
    expect(presentSchema.safeParse(present(99)).success).toBe(false);
    expect(presentSchema.safeParse(present(100)).success).toBe(true);
  });

  it("подтверждение передачи работодателю: «действует 90 дней»", () => {
    expect(textOf("RECRUITER")).toContain(`действует ${DISCLOSURE_CONSENT_TTL_DAYS} дней`);
    expect(DISCLOSURE_CONSENT_TTL_DAYS).toBe(90);
  });

  it("уничтожение: «через 30 дней» — и у агентства, и в разделе владельца", () => {
    expect(textOf("RECRUITER")).toContain(`Через ${ERASURE_DEADLINE_DAYS} дней данные уничтожаются`);
    expect(textOf("OWNER")).toContain(`уничтожаются сами через ${ERASURE_DEADLINE_DAYS} дней`);
    expect(ERASURE_DEADLINE_DAYS).toBe(30);
  });
});

describe("сорсинг-лид: числа в тексте совпадают с кодом", () => {
  it("«живут 14 дней» и напоминание «за 3 дня»", () => {
    const text = textOf("RECRUITER");
    expect(text).toContain(`живут ${SOURCING_LEAD_TTL_DAYS} дней`);
    expect(text).toContain(`За ${SOURCING_REMINDER_DAYS_BEFORE} дня до срока`);
    expect(SOURCING_LEAD_TTL_DAYS).toBe(14);
    expect(SOURCING_REMINDER_DAYS_BEFORE).toBe(3);
  });
});

describe("прежние ответы не возвращаются", () => {
  // До контура уничтожения помощь говорила, что данные с истёкшим
  // согласием сами не удаляются, — теперь это неправда (lib/services/erasure.ts)
  it.each(AGENCY_ROLES)("%s: нет обещания, что данные не удаляются сами", (role) => {
    expect(textOf(role)).not.toMatch(/сами по себе данные не удаляются|сама не удаляет/i);
  });
});
