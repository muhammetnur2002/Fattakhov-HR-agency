/**
 * Бейджи статусов: один словарь цветов и одно правило красного (12.10.2026, сверка consistency-7).
 *
 * Было восемь карт «статус → вид бейджа», и красный значил то «отказ», то «ждёт вашей реакции», то
 * «активный», то «срок горит». Теперь цвет следует за смыслом (`lib/status-tones.ts`), статус
 * показывает только `StatusBadge`, а красный — только отказ, ошибка и просрочка.
 */
import { describe, expect, it } from "vitest";
import {
  AgreementStatus,
  ApplicationOutcome,
  CandidateStatus,
  ClientStatus,
  InterviewStatus,
  InvoiceStatus,
  LeadStatus,
  VacancyStatus,
} from "@/lib/generated/prisma/enums";
import {
  AGREEMENT_STATUS_TONE,
  APPLICATION_OUTCOME_TONE,
  CANDIDATE_STATUS_TONE,
  CLIENT_STATUS_TONE,
  deadlineTone,
  INTERVIEW_STATUS_TONE,
  INVOICE_STATUS_TONE,
  LEAD_STATUS_TONE,
  PROFILE_MODERATION_TONE,
  STUDENTS_APPLICATION_STATUS_TONE,
  STUDENTS_VACANCY_STATUS_TONE,
  VACANCY_STATUS_TONE,
  type StatusTone,
} from "@/lib/status-tones";
import { jsxTags, read, sources } from "./helpers/jsx-source";

const TONES: StatusTone[] = ["success", "progress", "warning", "danger", "neutral"];

const MAPS: Array<{ name: string; map: Record<string, StatusTone>; values: string[] }> = [
  { name: "вакансия", map: VACANCY_STATUS_TONE, values: Object.values(VacancyStatus) },
  { name: "счёт", map: INVOICE_STATUS_TONE, values: Object.values(InvoiceStatus) },
  { name: "кандидат", map: CANDIDATE_STATUS_TONE, values: Object.values(CandidateStatus) },
  { name: "клиент", map: CLIENT_STATUS_TONE, values: Object.values(ClientStatus) },
  { name: "договор", map: AGREEMENT_STATUS_TONE, values: Object.values(AgreementStatus) },
  { name: "заявка с сайта", map: LEAD_STATUS_TONE, values: Object.values(LeadStatus) },
  { name: "встреча", map: INTERVIEW_STATUS_TONE, values: Object.values(InterviewStatus) },
  { name: "исход заявки", map: APPLICATION_OUTCOME_TONE, values: Object.values(ApplicationOutcome) },
  {
    name: "вакансия студплатформы",
    map: STUDENTS_VACANCY_STATUS_TONE,
    values: ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "CLOSED"],
  },
  {
    name: "отклик студента",
    map: STUDENTS_APPLICATION_STATUS_TONE,
    values: ["NEW", "VIEWED", "INVITED", "INTERVIEW", "HIRED", "REJECTED"],
  },
  { name: "профиль на платформе", map: PROFILE_MODERATION_TONE, values: ["APPROVED", "PENDING", "REJECTED"] },
];

describe("карты тонов: у каждого статуса есть тон", () => {
  it.each(MAPS)("$name: все значения перечисления покрыты, лишних нет", ({ map, values }) => {
    expect(Object.keys(map).sort()).toEqual([...values].sort());
    for (const tone of Object.values(map)) expect(TONES).toContain(tone);
  });
});

describe("красный — только отказ, ошибка и просрочка", () => {
  /** Всё, что вообще может быть красным. Добавить сюда статус — осознанное решение, а не «чтобы заметнее». */
  const DANGER = [
    "заявка с сайта:REJECTED",
    "встреча:NO_SHOW",
    "исход заявки:REJECTED",
    "вакансия студплатформы:REJECTED",
    "отклик студента:REJECTED",
    "профиль на платформе:REJECTED",
    "счёт:OVERDUE",
  ];

  it("список красных статусов — ровно этот", () => {
    const actual = MAPS.flatMap(({ name, map }) =>
      Object.entries(map)
        .filter(([, tone]) => tone === "danger")
        .map(([status]) => `${name}:${status}`),
    );
    expect(actual.sort()).toEqual([...DANGER].sort());
  });

  it("активные и ожидающие реакции не красные: «в работе», «уточняем», «ждёт подтверждения»", () => {
    expect(VACANCY_STATUS_TONE.ACTIVE).toBe("progress");
    expect(VACANCY_STATUS_TONE.CLARIFYING).toBe("warning");
    expect(VACANCY_STATUS_TONE.ESTIMATED).toBe("warning");
    expect(AGREEMENT_STATUS_TONE.PENDING).toBe("warning");
    expect(CLIENT_STATUS_TONE.ACTIVE).not.toBe("danger");
    expect(CANDIDATE_STATUS_TONE.WAITING_CLIENT).toBe("warning");
    expect(INTERVIEW_STATUS_TONE.SLOTS_REQUESTED).toBe("warning");
  });

  it("успех — зелёный: нанят, оплачен, одобрен, договор действует", () => {
    expect(APPLICATION_OUTCOME_TONE.HIRED).toBe("success");
    expect(INVOICE_STATUS_TONE.PAID).toBe("success");
    expect(PROFILE_MODERATION_TONE.APPROVED).toBe("success");
    expect(AGREEMENT_STATUS_TONE.ACTIVE).toBe("success");
  });

  it("срок: пока есть время — спокойный, за три дня — жёлтый, вышел — красный", () => {
    expect(deadlineTone(10)).toBe("neutral");
    expect(deadlineTone(4)).toBe("neutral");
    expect(deadlineTone(3)).toBe("warning");
    expect(deadlineTone(1)).toBe("warning");
    expect(deadlineTone(0)).toBe("danger");
    expect(deadlineTone(-2)).toBe("danger");
  });
});

describe("статус показывает только StatusBadge", () => {
  const all = [...sources("app"), ...sources("components")];
  const outsideUi = all.filter((f) => !f.includes("components/ui/"));

  it("голый <Badge> вне ui — только нейтральная метка: variant secondary или outline", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      for (const tag of jsxTags(read(file), "Badge")) {
        const variant = /\bvariant="([a-z]+)"/.exec(tag.text)?.[1];
        const dynamic = /\bvariant=\{/.test(tag.text);
        if (dynamic || !variant || !["secondary", "outline"].includes(variant)) {
          offenders.push(`${file}:${tag.line} ${tag.text.slice(0, 60).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(
      offenders,
      "статус и счётчик — <StatusBadge tone=…>; <Badge> без variant (залитый) и destructive остались для него",
    ).toEqual([]);
  });

  it("у <Badge> нет цвета статуса в className", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      for (const tag of jsxTags(read(file), "Badge|StatusBadge")) {
        if (/(?<![\w-])(bg|text|border)-(destructive|success|warning|progress)\b/.test(tag.classes)) {
          offenders.push(`${file}:${tag.line}`);
        }
      }
    }
    expect(offenders, "цвет задаёт tone, а не класс").toEqual([]);
  });

  it("самодельных цветных плашек-статусов нет: ни палитры Tailwind, ни bg-destructive/NN с pill-скруглением", () => {
    const palette = /(?<![\w-])(bg|text|border)-(red|green|emerald|amber|yellow|orange|lime|rose|teal)-\d{2,3}\b/;
    // Внутренний комментарий подсвечен янтарной подложкой — это видимость («не уйдёт клиенту»), а не
    // статус и не бейдж; в тёмной теме подложка настроена вручную. На токен warning — отдельным заходом
    // (файл правит соседняя работа по формам и комментариям)
    const NOT_A_STATUS = new Set(["components/comments/comment-thread.tsx"]);
    const offenders: string[] = [];
    for (const file of outsideUi) {
      if (file.startsWith("components/marketing") || file.startsWith("app/(marketing)")) continue;
      if (NOT_A_STATUS.has(file)) continue;
      for (const tag of jsxTags(read(file))) {
        const classes = tag.classes;
        if (palette.test(classes)) offenders.push(`${file}:${tag.line} палитра`);
        if (/(?<![\w-])bg-destructive\/\d+/.test(classes) && /rounded-(full|4xl)/.test(classes)) {
          offenders.push(`${file}:${tag.line} самодельный бейдж`);
        }
        // Плашка с полем или прозрачностью — бейдж; сплошная точка-индикатор (size-2 bg-success) — не он
        if (/(?<![\w-])bg-(success|warning|progress)\/\d+/.test(classes) || (/(?<![\w-])bg-(success|warning|progress)\b/.test(classes) && /(?<![\w-])px-/.test(classes))) {
          offenders.push(`${file}:${tag.line} тон мимо StatusBadge`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("карты «статус → вид бейджа» не заводят заново: слова STATUS_VARIANT и VARIANTS в разметке нет", () => {
    const offenders = outsideUi.filter((f) => /\b(STATUS_VARIANT|VARIANTS)\b\s*[:=]/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe("этап воронки — нейтральная метка, одинаковая везде", () => {
  // Этап — место кандидата в воронке, а не состояние: цвет у него отнимал бы смысл у «в работе» и
  // «ждёт решения», которые стоят рядом. Шапка заявки была синей, а карточка кандидата, список заявок
  // и сравнение — серыми (замечание проверки к PR #123)
  const outsideUi = [...sources("app"), ...sources("components")].filter((f) => !f.includes("components/ui/"));
  const STAGE_NAME = /\bstage\??\.name\b/;

  it("название этапа не лежит в <StatusBadge>: цвет бывает только у статуса", () => {
    const offenders: string[] = [];
    for (const file of outsideUi) {
      const text = read(file);
      for (const tag of jsxTags(text, "StatusBadge")) {
        const inner = text.slice(tag.index + tag.text.length).split("</StatusBadge>")[0];
        if (STAGE_NAME.test(inner)) offenders.push(`${file}:${tag.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("где название этапа стоит в <Badge>, это secondary — шапка заявки, карточка кандидата, список, сравнение", () => {
    const places = [
      "app/(agency)/a/applications/[id]/page.tsx",
      "app/(client)/applications/[id]/page.tsx",
      "app/(agency)/a/candidates/[id]/page.tsx",
      "components/candidates/application-list.tsx",
      "components/kanban/compare-view.tsx",
    ];
    for (const file of places) {
      const text = read(file);
      const badges = jsxTags(text, "Badge").filter((tag) => {
        const inner = text.slice(tag.index + tag.text.length).split("</Badge>")[0];
        return STAGE_NAME.test(inner);
      });
      expect(badges.length, `${file}: этап показан бейджем`).toBeGreaterThan(0);
      for (const tag of badges) expect(tag.text, `${file}:${tag.line}`).toMatch(/variant="secondary"/);
    }
  });
});

describe("счётчик очереди «ждёт реакции» — жёлтый, пока в ней кто-то есть", () => {
  // Колонка «Пора предложить подбор» в воронке клиентов: число людей, которым агентство должно
  // ответить. Это смысл «ждёт реакции» для количества, а не для статуса, поэтому он записан в таблице
  // тонов в AGENTS.md (замечание проверки к PR #123)
  const funnel = read("app/(agency)/a/clients/funnel/page.tsx");
  const agents = read("AGENTS.md");

  it("в воронке жёлтым красится только непустая колонка READY, остальные нейтральны", () => {
    expect(funnel).toMatch(/<StatusBadge tone=\{stage === "READY" && items\.length > 0 \? "warning" : "neutral"\}>/);
  });

  it("случай внесён в строку warning таблицы тонов", () => {
    const row = agents.split("\n").find((line) => line.startsWith("  | `warning` |")) ?? "";
    expect(row).toMatch(/счётчик/i);
    expect(row).toContain("Пора предложить подбор");
  });

  it("этап воронки перечислен в строке neutral, а не progress", () => {
    const rows = agents.split("\n");
    const neutral = rows.find((line) => line.startsWith("  | `neutral` |")) ?? "";
    const progress = rows.find((line) => line.startsWith("  | `progress` |")) ?? "";
    expect(neutral).toMatch(/этап воронки/);
    expect(progress).not.toMatch(/этап воронки/);
  });
});
