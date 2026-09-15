/**
 * Тестовые данные (ТЗ 17.1).
 *
 * Идемпотентно: полностью очищает данные и создаёт заново с фиксированными id,
 * поэтому `npx prisma db seed` можно гонять сколько угодно раз.
 *
 * Состав подобран не «чтобы было», а под проверку конкретных правил
 * следующих этапов: порог видимости (BR-3), SLA-таймер клиента (BR-9),
 * гарантийный период (BR-10), причины отказов (BR-11).
 *
 * Используется prismaRaw — сырой клиент без фильтра мягкого удаления,
 * иначе deleteMany пометил бы записи удалёнными вместо физической очистки.
 */
import { hashPassword } from "../lib/auth/password";
import { prismaRaw as db } from "../lib/db/prisma";
import { DEFAULT_PIPELINE_STAGES } from "../lib/services/pipeline-stages";

const ORG_ID = "org_fattakhov";
const now = new Date();
/**
 * Единый пароль для всех тестовых учёток — только для локальной разработки.
 * В seed прод-данных этого быть не должно: пользователи заводятся
 * приглашениями и задают пароль сами.
 */
const DEV_PASSWORD = "demo1234";

/** Дата со сдвигом в днях от текущего момента. */
function daysFromNow(days: number, hour = 12): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function clean() {
  // Порядок важен: сначала зависимые таблицы.
  await db.personalDataAccessLog.deleteMany();
  await db.activityLog.deleteMany();
  await db.notification.deleteMany();
  await db.commentRead.deleteMany();
  await db.comment.deleteMany();
  await db.interviewSlot.deleteMany();
  await db.interview.deleteMany();
  await db.attachment.deleteMany();
  await db.stageTransition.deleteMany();
  await db.application.deleteMany();
  await db.candidate.deleteMany();
  await db.pipelineStage.deleteMany();
  await db.invoice.deleteMany();
  await db.vacancy.deleteMany();
  await db.agreement.deleteMany();
  await db.invitation.deleteMany();
  await db.user.deleteMany();
  await db.client.deleteMany();
  await db.organization.deleteMany();
}

/**
 * История переходов кандидата до его текущего этапа.
 *
 * Кандидат на оффере проходил через лонг-лист, скрининг и представление —
 * без этих записей воронка в аналитике показывала бы срез на сегодня
 * вместо пути. Даты расставляем назад от текущего этапа.
 */
async function createStageHistory(params: {
  applicationId: string;
  finalStage: string;
  daysOnStage: number;
  outcome: string;
  /** Резолвер id этапа: этапы принадлежат вакансии и создаются в main. */
  stageId: (code: string) => string;
}) {
  const order: string[] = DEFAULT_PIPELINE_STAGES.map((s) => s.code);
  const finalIndex = order.indexOf(params.finalStage);
  if (finalIndex < 0) return;

  const path = order.slice(0, finalIndex + 1);

  for (const [index, code] of path.entries()) {
    // Чем раньше этап, тем дальше в прошлом
    const daysAgo = params.daysOnStage + (path.length - 1 - index) * 3;

    await db.stageTransition.create({
      data: {
        applicationId: params.applicationId,
        fromStageId: index === 0 ? null : params.stageId(path[index - 1]),
        toStageId: params.stageId(code),
        toOutcome: "IN_PROGRESS",
        actorId: "usr_rec1",
        createdAt: daysFromNow(-daysAgo),
      },
    });
  }

  // Отказ — отдельная запись поверх последнего этапа
  if (params.outcome === "REJECTED" || params.outcome === "WITHDRAWN") {
    await db.stageTransition.create({
      data: {
        applicationId: params.applicationId,
        fromStageId: params.stageId(params.finalStage),
        toStageId: params.stageId(params.finalStage),
        fromOutcome: "IN_PROGRESS",
        toOutcome: params.outcome as "REJECTED" | "WITHDRAWN",
        actorId: "usr_rec1",
        createdAt: daysFromNow(-params.daysOnStage),
      },
    });
  }
}

/**
 * Отказ работать на боевой базе.
 *
 * Сид не просто добавляет данные — он начинается с полной очистки
 * и заводит учётки с общеизвестным паролем. Запуск такого на проде
 * означает сразу две беды: чужие данные стёрты, а вход владельца
 * открыт всем, кто читал репозиторий.
 *
 * Проверка стоит здесь, а не в инструкции по деплою, потому что
 * `prisma db seed` вызывается не только руками: его дёргает
 * `prisma migrate dev`, и он легко попадает в шаг выкатки рядом
 * с `migrate deploy`. Инструкцию можно не прочитать, отказ на старте —
 * нет. Так же устроен setup:real со своим WIPE_DEV_DB.
 */
function refuseOnProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SEED_PRODUCTION === "yes") {
    console.warn(
      "NODE_ENV=production, но задан SEED_PRODUCTION=yes — продолжаю. " +
        "Надеюсь, это тестовый стенд.",
    );
    return;
  }

  console.error(
    "Отказ: NODE_ENV=production.\n" +
      "Сид стирает базу целиком и заводит учётные записи с общим паролем — " +
      "боевой базе это противопоказано.\n" +
      "Первая настройка прода: npm run setup:real (владелец получает " +
      "приглашение и задаёт пароль сам).\n" +
      "Если это всё-таки тестовый стенд с NODE_ENV=production: " +
      "SEED_PRODUCTION=yes npx prisma db seed",
  );
  process.exit(1);
}

async function main() {
  refuseOnProduction();

  console.log("Очистка...");
  await clean();

  // Хешируем один раз: argon2 намеренно медленный, а пароль у всех тестовых
  // учёток одинаковый — считать его 11 раз незачем.
  const passwordHash = await hashPassword(DEV_PASSWORD);

  // ---------- ОРГАНИЗАЦИЯ ----------
  console.log("Организация и сотрудники...");
  await db.organization.create({
    data: {
      id: ORG_ID,
      name: "Fattakhov HR Agency",
      inn: "1650000000",
      settings: {
        timezone: "Europe/Moscow",
        workingHours: { start: "09:00", end: "19:00" },
        workingDays: [1, 2, 3, 4, 5],
      },
    },
  });

  // ---------- СОТРУДНИКИ АГЕНТСТВА ----------
  const agencyUsers = [
    {
      id: "usr_owner",
      email: "owner@fattakhov.hr",
      fullName: "Полина Фаттахова",
      role: "OWNER" as const,
      position: "Владелец агентства",
    },
    {
      id: "usr_head",
      email: "head@fattakhov.hr",
      fullName: "Марина Соколова",
      role: "HEAD" as const,
      position: "Руководитель подбора",
    },
    {
      id: "usr_account",
      email: "account@fattakhov.hr",
      fullName: "Дмитрий Крылов",
      role: "ACCOUNT" as const,
      position: "Аккаунт-менеджер",
    },
    {
      id: "usr_rec1",
      email: "rec1@fattakhov.hr",
      fullName: "Алина Гизатуллина",
      role: "RECRUITER" as const,
      position: "Ведущий рекрутер",
    },
    {
      id: "usr_rec2",
      email: "rec2@fattakhov.hr",
      fullName: "Игорь Пантелеев",
      role: "RECRUITER" as const,
      position: "Рекрутер",
    },
    {
      id: "usr_rec3",
      email: "rec3@fattakhov.hr",
      fullName: "Светлана Ким",
      role: "RECRUITER" as const,
      position: "Рекрутер",
    },
  ];

  for (const u of agencyUsers) {
    await db.user.create({
      data: {
        ...u,
        passwordHash,
        organizationId: ORG_ID,
        notifyPrefs: { email: true, telegram: true, digest: "instant" },
      },
    });
  }

  // ---------- КЛИЕНТЫ ----------
  console.log("Клиенты и договоры...");

  await db.client.create({
    data: {
      id: "cl_starfish",
      organizationId: ORG_ID,
      name: "Старфиш",
      legalName: 'ООО "Старфиш"',
      inn: "1655000001",
      industry: "Розничная торговля",
      city: "Казань",
      description:
        "Сеть магазинов морепродуктов, 14 точек по Татарстану. Активно растут, открывают новые точки.",
      accountManagerId: "usr_account",
      status: "ACTIVE",
    },
  });

  await db.client.create({
    data: {
      id: "cl_technopark",
      organizationId: ORG_ID,
      name: "Технопарк Вектор",
      legalName: 'АО "Технопарк Вектор"',
      inn: "1655000002",
      industry: "IT / производство",
      city: "Казань",
      description: "Резидент технопарка, разработка промышленной автоматики.",
      accountManagerId: "usr_account",
      status: "ACTIVE",
    },
  });

  await db.client.create({
    data: {
      id: "cl_lead",
      organizationId: ORG_ID,
      name: "Камская Логистика",
      inn: "1655000003",
      industry: "Логистика",
      city: "Набережные Челны",
      accountManagerId: "usr_account",
      status: "LEAD", // договора нет — проверка BR-1
    },
  });

  // 4 пользователя всех клиентских ролей у первого клиента
  const clientUsers = [
    {
      id: "usr_cl_admin",
      email: "hrd@starfish.ru",
      fullName: "Екатерина Волкова",
      role: "CLIENT_ADMIN" as const,
      position: "HR-директор",
    },
    {
      id: "usr_cl_hiring1",
      email: "sales.head@starfish.ru",
      fullName: "Роман Тимофеев",
      role: "CLIENT_HIRING" as const,
      position: "Коммерческий директор",
    },
    {
      id: "usr_cl_hiring2",
      email: "ops.head@starfish.ru",
      fullName: "Наталья Белова",
      role: "CLIENT_HIRING" as const,
      position: "Директор по операциям",
    },
    {
      id: "usr_cl_viewer",
      email: "ceo@starfish.ru",
      fullName: "Артур Сафин",
      role: "CLIENT_VIEWER" as const,
      position: "Генеральный директор",
    },
  ];

  for (const u of clientUsers) {
    await db.user.create({
      data: {
        ...u,
        passwordHash,
        organizationId: ORG_ID,
        clientId: "cl_starfish",
        notifyPrefs: { email: true, telegram: false, digest: "instant" },
      },
    });
  }

  // Второй клиент — нужен, чтобы проверять изоляцию (BR-28):
  // этот админ не должен видеть ничего из данных «Старфиш».
  await db.user.create({
    data: {
      id: "usr_cl2_admin",
      email: "hr@vector-tp.ru",
      fullName: "Ольга Нурмухаметова",
      role: "CLIENT_ADMIN",
      position: "Руководитель HR",
      passwordHash,
      organizationId: ORG_ID,
      clientId: "cl_technopark",
    },
  });

  // ---------- ДОГОВОРЫ ----------
  await db.agreement.create({
    data: {
      id: "agr_starfish",
      organizationId: ORG_ID,
      clientId: "cl_starfish",
      title: "Договор №12 от 01.06.2026",
      pricingModel: "PERCENT_MONTHLY",
      monthsCount: 2, // 2 оклада кандидата
      guaranteeDays: 90,
      paymentTerms: "50% предоплата при старте, 50% в течение 5 дней после выхода",
      prepaymentPercent: 50,
      startsAt: daysFromNow(-66),
      status: "ACTIVE",
      acceptedByUserId: "usr_cl_admin",
      acceptedAt: daysFromNow(-66),
    },
  });

  await db.agreement.create({
    data: {
      id: "agr_technopark",
      organizationId: ORG_ID,
      clientId: "cl_technopark",
      title: "Договор №15 от 15.07.2026",
      pricingModel: "SUBSCRIPTION",
      subscriptionAmount: 180000,
      subscriptionSlots: 3,
      guaranteeDays: 60,
      paymentTerms: "Абонентская плата до 5 числа месяца",
      startsAt: daysFromNow(-22),
      status: "ACTIVE",
      acceptedByUserId: "usr_cl2_admin",
      acceptedAt: daysFromNow(-22),
    },
  });

  // ---------- ВАКАНСИИ ----------
  console.log("Вакансии и этапы воронки...");

  const vacancies = [
    {
      id: "vac_1",
      number: 1,
      clientId: "cl_starfish",
      agreementId: "agr_starfish",
      title: "Руководитель отдела продаж",
      status: "ACTIVE" as const,
      hiringManagerId: "usr_cl_hiring1",
      department: "Коммерческий отдел",
      leadRecruiterId: "usr_rec1",
      recruiterIds: ["usr_rec1", "usr_rec2"],
      salaryFrom: 180000,
      salaryTo: 250000,
      headcount: 1,
      urgency: "HIGH" as const,
      activatedAt: daysFromNow(-28),
      submittedAt: daysFromNow(-31),
      estimatedFirstCandidatesAt: daysFromNow(-21),
      responsibilities:
        "Управление отделом из 8 менеджеров, выполнение плана продаж, развитие сети точек.",
      requirements:
        "Опыт руководства отделом продаж от 3 лет в рознице или FMCG. Опыт работы с сетевыми клиентами.",
      stopFactors: "Опыт только в B2C-услугах, частая смена работы (меньше года на месте).",
      targetCompanies: "Бахетле, Эдельвейс, Магнит, Пятёрочка — региональные структуры",
      agencyNotes:
        "ВНУТРЕННЕЕ: клиент на первой встрече называл вилку до 220, потом поднял. Роман Тимофеев решает быстро, Екатерина тормозит согласования.",
      city: "Казань",
      workFormat: "OFFICE" as const,
      employmentType: "FULL_TIME" as const,
    },
    {
      id: "vac_2",
      number: 2,
      clientId: "cl_starfish",
      agreementId: "agr_starfish",
      title: "Товаровед",
      status: "ACTIVE" as const,
      hiringManagerId: "usr_cl_hiring2",
      department: "Операционный отдел",
      leadRecruiterId: "usr_rec2",
      recruiterIds: ["usr_rec2"],
      salaryFrom: 70000,
      salaryTo: 90000,
      headcount: 2,
      urgency: "NORMAL" as const,
      activatedAt: daysFromNow(-12),
      submittedAt: daysFromNow(-14),
      estimatedFirstCandidatesAt: daysFromNow(-5),
      city: "Казань",
      workFormat: "OFFICE" as const,
      employmentType: "FULL_TIME" as const,
    },
    {
      id: "vac_3",
      number: 3,
      clientId: "cl_technopark",
      agreementId: "agr_technopark",
      title: "Инженер-электронщик",
      status: "ACTIVE" as const,
      department: "КБ",
      leadRecruiterId: "usr_rec3",
      recruiterIds: ["usr_rec3"],
      salaryFrom: 140000,
      salaryTo: 190000,
      headcount: 1,
      urgency: "CRITICAL" as const,
      activatedAt: daysFromNow(-40), // >30 дней без найма — вакансия в риске
      submittedAt: daysFromNow(-43),
      city: "Казань",
      workFormat: "HYBRID" as const,
      employmentType: "FULL_TIME" as const,
    },
    {
      id: "vac_4",
      number: 4,
      clientId: "cl_technopark",
      agreementId: "agr_technopark",
      title: "Технический писатель",
      status: "SUBMITTED" as const, // заявка ждёт приёмки агентством
      leadRecruiterId: null,
      recruiterIds: [],
      salaryFrom: 90000,
      salaryTo: 120000,
      headcount: 1,
      urgency: "NORMAL" as const,
      submittedAt: daysFromNow(-2),
      city: "Казань",
      workFormat: "REMOTE" as const,
      employmentType: "FULL_TIME" as const,
    },
    {
      id: "vac_5",
      number: 5,
      clientId: "cl_starfish",
      agreementId: "agr_starfish",
      title: "Маркетолог",
      status: "DRAFT" as const, // черновик клиента, ещё не отправлен
      leadRecruiterId: null,
      recruiterIds: [],
      headcount: 1,
      urgency: "LOW" as const,
      city: "Казань",
    },
    {
      id: "vac_6",
      number: 6,
      clientId: "cl_starfish",
      agreementId: "agr_starfish",
      title: "Заведующий складом",
      status: "CLOSED_SUCCESS" as const,
      hiringManagerId: "usr_cl_hiring2",
      leadRecruiterId: "usr_rec1",
      recruiterIds: ["usr_rec1"],
      salaryFrom: 95000,
      salaryTo: 115000,
      headcount: 1,
      urgency: "NORMAL" as const,
      submittedAt: daysFromNow(-75),
      activatedAt: daysFromNow(-72),
      closedAt: daysFromNow(-30),
      closeReason: "Кандидат вышел на работу",
      city: "Казань",
      workFormat: "OFFICE" as const,
      employmentType: "FULL_TIME" as const,
    },
  ];

  for (const v of vacancies) {
    await db.vacancy.create({
      data: {
        ...v,
        organizationId: ORG_ID,
        createdById: "usr_cl_admin",
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((s) => ({
            code: s.code,
            name: s.name,
            order: s.order,
            visibleToClient: s.visibleToClient,
            isTerminal: s.isTerminal,
            slaHours: s.slaHours,
          })),
        },
      },
    });
  }

  // Карта этапов основной вакансии
  const vac1Stages = await db.pipelineStage.findMany({
    where: { vacancyId: "vac_1" },
  });
  const stageId = (code: string) => {
    const s = vac1Stages.find((x) => x.code === code);
    if (!s) throw new Error(`Этап ${code} не найден`);
    return s.id;
  };

  // ---------- КАНДИДАТЫ ----------
  console.log("Кандидаты и воронка...");

  type SeedCandidate = {
    name: string;
    position: string;
    company: string;
    salary: number;
    stage: string;
    /** сколько дней назад кандидат попал на текущий этап */
    daysOnStage: number;
    presented?: boolean;
    outcome?: "IN_PROGRESS" | "REJECTED" | "HIRED";
    rejectionReason?: string;
    rejectedBy?: "CLIENT" | "CANDIDATE" | "AGENCY";
  };

  const candidates: SeedCandidate[] = [
    // --- LONGLIST (7) — клиент этих НЕ видит ---
    { name: "Айрат Хабибуллин", position: "Руководитель направления", company: "Эдельвейс", salary: 200000, stage: "LONGLIST", daysOnStage: 2 },
    { name: "Ольга Дементьева", position: "Старший менеджер по продажам", company: "Магнит", salary: 175000, stage: "LONGLIST", daysOnStage: 3 },
    { name: "Сергей Мочалов", position: "Территориальный менеджер", company: "Пятёрочка", salary: 210000, stage: "LONGLIST", daysOnStage: 1 },
    { name: "Динара Ахметзянова", position: "Руководитель отдела", company: "Бахетле", salary: 190000, stage: "LONGLIST", daysOnStage: 5 },
    { name: "Владимир Ершов", position: "Начальник отдела сбыта", company: "Ак Барс Торг", salary: 185000, stage: "LONGLIST", daysOnStage: 4 },
    { name: "Ксения Лаврова", position: "Руководитель группы продаж", company: "Лента", salary: 205000, stage: "LONGLIST", daysOnStage: 6 },
    { name: "Тимур Валеев", position: "Коммерческий директор", company: "Челны-Хлеб", salary: 240000, stage: "LONGLIST", daysOnStage: 1 },

    // --- SCREENING (5) — тоже скрыты от клиента ---
    { name: "Марат Зиганшин", position: "Руководитель отдела продаж", company: "Мегастрой", salary: 195000, stage: "SCREENING", daysOnStage: 3 },
    { name: "Елена Сорокина", position: "Заместитель коммерческого директора", company: "Тандем", salary: 220000, stage: "SCREENING", daysOnStage: 2 },
    { name: "Рустем Гайнуллин", position: "Руководитель продаж", company: "Эссен", salary: 180000, stage: "SCREENING", daysOnStage: 4 },
    { name: "Анна Веретенникова", position: "Head of Sales", company: "Домашний интерьер", salary: 230000, stage: "SCREENING", daysOnStage: 1 },
    { name: "Ильдар Шакиров", position: "Начальник коммерческого отдела", company: "Агросила", salary: 200000, stage: "SCREENING", daysOnStage: 5 },

    // --- PRESENTED (5) — клиент видит. Первые 3 ждут решения >3 дней (BR-9) ---
    { name: "Надежда Полякова", position: "Руководитель отдела продаж", company: "Бахетле", salary: 210000, stage: "PRESENTED", daysOnStage: 7, presented: true },
    { name: "Артём Кузнецов", position: "Коммерческий директор", company: "Просто молоко", salary: 235000, stage: "PRESENTED", daysOnStage: 5, presented: true },
    { name: "Гульнара Сафиуллина", position: "Руководитель направления продаж", company: "Ашан", salary: 198000, stage: "PRESENTED", daysOnStage: 4, presented: true },
    { name: "Павел Родионов", position: "Старший руководитель группы", company: "Перекрёсток", salary: 215000, stage: "PRESENTED", daysOnStage: 1, presented: true },
    { name: "Юлия Мартынова", position: "Руководитель отдела", company: "Спар", salary: 190000, stage: "PRESENTED", daysOnStage: 2, presented: true },

    // --- CLIENT_INTERVIEW (3) ---
    { name: "Ренат Мусин", position: "Руководитель отдела продаж", company: "Эдельвейс", salary: 225000, stage: "CLIENT_INTERVIEW", daysOnStage: 3, presented: true },
    { name: "Светлана Гурьева", position: "Коммерческий директор", company: "Вкусвилл", salary: 240000, stage: "CLIENT_INTERVIEW", daysOnStage: 2, presented: true },
    { name: "Азат Нуриев", position: "Начальник отдела продаж", company: "Челны-Бройлер", salary: 205000, stage: "CLIENT_INTERVIEW", daysOnStage: 6, presented: true },

    // --- FINAL (1) ---
    { name: "Мария Чернова", position: "Руководитель отдела продаж", company: "Магнит", salary: 220000, stage: "FINAL", daysOnStage: 2, presented: true },

    // --- OFFER (1) ---
    { name: "Денис Кораблёв", position: "Коммерческий директор", company: "Ижтрейдинг", salary: 245000, stage: "OFFER", daysOnStage: 1, presented: true },

    // --- HIRED (1) — с активным гарантийным периодом (BR-10) ---
    { name: "Алексей Тарасов", position: "Руководитель отдела продаж", company: "Ак Барс Торг", salary: 230000, stage: "HIRED", daysOnStage: 10, presented: true, outcome: "HIRED" },

    // --- ОТКЛОНЁННЫЕ (2) — разные причины (BR-11) ---
    { name: "Виктория Смирнова", position: "Руководитель продаж", company: "Метро", salary: 265000, stage: "PRESENTED", daysOnStage: 9, presented: true, outcome: "REJECTED", rejectionReason: "SALARY_TOO_HIGH", rejectedBy: "CLIENT" },
    { name: "Эдуард Фомин", position: "Менеджер по продажам", company: "Атлант", salary: 185000, stage: "CLIENT_INTERVIEW", daysOnStage: 11, presented: true, outcome: "REJECTED", rejectionReason: "FAILED_INTERVIEW", rejectedBy: "CLIENT" },
  ];

  const applicationIds: Record<string, string> = {};

  for (const [i, c] of candidates.entries()) {
    const candidateId = `cand_${i + 1}`;
    const applicationId = `app_${i + 1}`;
    applicationIds[c.name] = applicationId;

    const presentedAt = c.presented ? daysFromNow(-(c.daysOnStage + 1)) : null;

    await db.candidate.create({
      data: {
        id: candidateId,
        organizationId: ORG_ID,
        fullName: c.name,
        phone: `+7900${String(1000000 + i).slice(-7)}`,
        email: `candidate${i + 1}@example.com`,
        city: "Казань",
        currentPosition: c.position,
        currentCompany: c.company,
        totalExperienceYears: 5 + (i % 8),
        skills: ["Управление командой", "B2B-продажи", "CRM", "Переговоры"],
        salaryExpectation: c.salary,
        source: i % 3 === 0 ? "HH" : i % 3 === 1 ? "DIRECT_SEARCH" : "REFERRAL",
        summary: `Внутреннее саммари рекрутера по кандидату ${c.name}. Клиенту не показывается.`,
        // Представленные кандидаты обязаны иметь согласие на ПДн (BR-33)
        consentStatus: c.presented ? "GIVEN" : "PENDING",
        consentGivenAt: c.presented ? daysFromNow(-(c.daysOnStage + 3)) : null,
        consentExpiresAt: c.presented ? daysFromNow(365) : null,
        createdById: "usr_rec1",
      },
    });

    await db.application.create({
      data: {
        id: applicationId,
        organizationId: ORG_ID,
        vacancyId: "vac_1",
        candidateId,
        stageId: stageId(c.stage),
        stageEnteredAt: daysFromNow(-c.daysOnStage),
        outcome: (c.outcome ?? "IN_PROGRESS") as "IN_PROGRESS" | "REJECTED" | "HIRED",
        rejectionReason: c.rejectionReason as never,
        rejectedBy: c.rejectedBy as never,
        rejectionComment:
          c.rejectionReason === "SALARY_TOO_HIGH"
            ? "Ожидания выше вилки на 15%, не готовы двигаться."
            : c.rejectionReason === "FAILED_INTERVIEW"
              ? "Не показал системного подхода к управлению планом продаж."
              : null,
        presentationSummary: c.presented
          ? `${c.name} — ${c.position} в компании «${c.company}». Профильный опыт в рознице, управлял командой сопоставимого размера. Мотивирован на переход, готов выйти в течение двух недель. Зарплатные ожидания ${c.salary.toLocaleString("ru-RU")} ₽.`
          : null,
        presentedAt,
        presentedById: c.presented ? "usr_rec1" : null,
        // Нанятый кандидат: дата выхода + активная гарантия 90 дней (BR-10)
        hiredAt: c.outcome === "HIRED" ? daysFromNow(-10) : null,
        guaranteeUntil: c.outcome === "HIRED" ? daysFromNow(80) : null,
        offerSalary: c.outcome === "HIRED" ? c.salary : c.stage === "OFFER" ? c.salary : null,
        offerPosition: c.outcome === "HIRED" || c.stage === "OFFER" ? "Руководитель отдела продаж" : null,
        ownerId: "usr_rec1",
      },
    });

    // История переходов: без неё аналитика воронки строится вслепую,
    // а именно она показывает путь кандидата, а не срез на сегодня
    await createStageHistory({
      applicationId,
      finalStage: c.stage,
      daysOnStage: c.daysOnStage,
      outcome: c.outcome ?? "IN_PROGRESS",
      stageId,
    });
  }

  // ---------- КОММЕНТАРИИ ----------
  console.log("Комментарии...");

  await db.comment.create({
    data: {
      organizationId: ORG_ID,
      applicationId: applicationIds["Надежда Полякова"],
      body: "Сильный кандидат, но хочет обсудить бонусную схему на первой встрече. Готова выйти через 2 недели.",
      visibility: "SHARED",
      authorId: "usr_rec1",
      createdAt: daysFromNow(-7, 14),
    },
  });

  await db.comment.create({
    data: {
      organizationId: ORG_ID,
      applicationId: applicationIds["Надежда Полякова"],
      body: "ВНУТРЕННЕЕ: у неё параллельно оффер от Ленты. Если клиент будет тянуть — потеряем. Надо пушить Романа.",
      visibility: "INTERNAL",
      authorId: "usr_rec1",
      createdAt: daysFromNow(-6, 10),
    },
  });

  await db.comment.create({
    data: {
      organizationId: ORG_ID,
      applicationId: applicationIds["Ренат Мусин"],
      body: "Посмотрели резюме, интересен. Давайте назначим встречу на следующей неделе.",
      visibility: "SHARED",
      authorId: "usr_cl_hiring1",
      createdAt: daysFromNow(-4, 16),
    },
  });

  await db.comment.create({
    data: {
      organizationId: ORG_ID,
      vacancyId: "vac_1",
      body: "Уточните, пожалуйста: подчинение напрямую коммерческому директору или через регионального руководителя?",
      visibility: "SHARED",
      authorId: "usr_rec1",
      createdAt: daysFromNow(-30, 11),
    },
  });

  // ---------- ИНТЕРВЬЮ ----------
  console.log("Интервью...");

  // 2 подтверждённых в будущем
  await db.interview.create({
    data: {
      id: "int_1",
      organizationId: ORG_ID,
      applicationId: applicationIds["Ренат Мусин"],
      vacancyId: "vac_1",
      type: "CLIENT",
      status: "CONFIRMED",
      format: "ONLINE",
      meetingUrl: "https://telemost.yandex.ru/j/00000000000000",
      durationMinutes: 60,
      participantUserIds: ["usr_cl_hiring1", "usr_rec1"],
      scheduledAt: daysFromNow(2, 11),
      createdById: "usr_rec1",
      slots: {
        create: [
          { startsAt: daysFromNow(2, 11), endsAt: daysFromNow(2, 12), isSelected: true },
          { startsAt: daysFromNow(3, 15), endsAt: daysFromNow(3, 16), isSelected: false },
        ],
      },
    },
  });

  await db.interview.create({
    data: {
      id: "int_2",
      organizationId: ORG_ID,
      applicationId: applicationIds["Светлана Гурьева"],
      vacancyId: "vac_1",
      type: "CLIENT",
      status: "CONFIRMED",
      format: "OFFICE",
      address: "Казань, ул. Петербургская, 52, офис 401",
      durationMinutes: 90,
      participantUserIds: ["usr_cl_hiring1", "usr_cl_admin"],
      scheduledAt: daysFromNow(4, 14),
      createdById: "usr_rec1",
      slots: {
        create: [{ startsAt: daysFromNow(4, 14), endsAt: daysFromNow(4, 15), isSelected: true }],
      },
    },
  });

  // 1 ожидает выбора слота кандидатом
  await db.interview.create({
    data: {
      id: "int_3",
      organizationId: ORG_ID,
      applicationId: applicationIds["Азат Нуриев"],
      vacancyId: "vac_1",
      type: "CLIENT",
      status: "SLOTS_PROPOSED",
      format: "ONLINE",
      durationMinutes: 60,
      participantUserIds: ["usr_cl_hiring1"],
      candidateToken: "seed-token-slots-azat",
      tokenExpiresAt: daysFromNow(7),
      createdById: "usr_rec1",
      slots: {
        create: [
          { startsAt: daysFromNow(3, 10), endsAt: daysFromNow(3, 11) },
          { startsAt: daysFromNow(3, 16), endsAt: daysFromNow(3, 17) },
          { startsAt: daysFromNow(5, 12), endsAt: daysFromNow(5, 13) },
        ],
      },
    },
  });

  // 2 завершённых с обратной связью
  await db.interview.create({
    data: {
      id: "int_4",
      organizationId: ORG_ID,
      applicationId: applicationIds["Мария Чернова"],
      vacancyId: "vac_1",
      type: "CLIENT",
      status: "COMPLETED",
      format: "ONLINE",
      durationMinutes: 60,
      participantUserIds: ["usr_cl_hiring1"],
      scheduledAt: daysFromNow(-3, 11),
      feedbackRating: 5,
      feedbackNote:
        "Очень сильная. Чётко разложила, как выстраивала план продаж на прошлом месте. Готовы двигать на финал.",
      feedbackById: "usr_cl_hiring1",
      feedbackAt: daysFromNow(-3, 13),
      createdById: "usr_rec1",
      slots: {
        create: [{ startsAt: daysFromNow(-3, 11), endsAt: daysFromNow(-3, 12), isSelected: true }],
      },
    },
  });

  await db.interview.create({
    data: {
      id: "int_5",
      organizationId: ORG_ID,
      applicationId: applicationIds["Эдуард Фомин"],
      vacancyId: "vac_1",
      type: "CLIENT",
      status: "COMPLETED",
      format: "ONLINE",
      durationMinutes: 45,
      participantUserIds: ["usr_cl_hiring1"],
      scheduledAt: daysFromNow(-11, 15),
      feedbackRating: 2,
      feedbackNote: "Опыт больше про личные продажи, чем про управление. Не наш вариант.",
      feedbackById: "usr_cl_hiring1",
      feedbackAt: daysFromNow(-11, 17),
      createdById: "usr_rec1",
      slots: {
        create: [{ startsAt: daysFromNow(-11, 15), endsAt: daysFromNow(-11, 16), isSelected: true }],
      },
    },
  });

  // ---------- СЧЕТА ----------
  console.log("Счета...");

  await db.invoice.create({
    data: {
      organizationId: ORG_ID,
      clientId: "cl_starfish",
      agreementId: "agr_starfish",
      number: "СЧ-2026-041",
      status: "PAID",
      amount: 210000,
      description: "Подбор: Заведующий складом (вакансия №6). 2 оклада.",
      vacancyIds: ["vac_6"],
      issuedAt: daysFromNow(-29),
      dueAt: daysFromNow(-24),
      paidAt: daysFromNow(-26),
      createdById: "usr_account",
    },
  });

  await db.invoice.create({
    data: {
      organizationId: ORG_ID,
      clientId: "cl_technopark",
      agreementId: "agr_technopark",
      number: "СЧ-2026-052",
      status: "ISSUED",
      amount: 180000,
      description: "Абонентское обслуживание, август 2026.",
      issuedAt: daysFromNow(-3),
      dueAt: daysFromNow(4),
      createdById: "usr_account",
    },
  });

  await db.invoice.create({
    data: {
      organizationId: ORG_ID,
      clientId: "cl_starfish",
      agreementId: "agr_starfish",
      number: "СЧ-2026-047",
      status: "OVERDUE",
      amount: 105000,
      description: "Предоплата 50%: Руководитель отдела продаж (вакансия №1).",
      vacancyIds: ["vac_1"],
      issuedAt: daysFromNow(-25),
      dueAt: daysFromNow(-11),
      createdById: "usr_account",
    },
  });

  // ---------- ИТОГИ ----------
  const counts = {
    организаций: await db.organization.count(),
    пользователей: await db.user.count(),
    клиентов: await db.client.count(),
    договоров: await db.agreement.count(),
    вакансий: await db.vacancy.count(),
    этапов: await db.pipelineStage.count(),
    кандидатов: await db.candidate.count(),
    заявок: await db.application.count(),
    комментариев: await db.comment.count(),
    интервью: await db.interview.count(),
    счетов: await db.invoice.count(),
  };

  console.log("\nГотово:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log(`\nВход (пароль у всех — ${DEV_PASSWORD}):`);
  console.log("  Агентство");
  console.log("    owner@fattakhov.hr    Владелец");
  console.log("    head@fattakhov.hr     Руководитель подбора");
  console.log("    rec1@fattakhov.hr     Рекрутер");
  console.log("    account@fattakhov.hr  Аккаунт-менеджер");
  console.log("  Клиент «Старфиш»");
  console.log("    hrd@starfish.ru       Администратор");
  console.log("    sales.head@starfish.ru Нанимающий менеджер");
  console.log("    ceo@starfish.ru       Наблюдатель");
  console.log("  Клиент «Технопарк» (для проверки изоляции)");
  console.log("    hr@vector-tp.ru       Администратор");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
