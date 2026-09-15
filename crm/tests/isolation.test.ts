/**
 * Изоляция клиентов и порог видимости — на реальной БД.
 *
 * Юнит-тесты в access.test.ts проверяют форму фильтра. Здесь проверяется,
 * что эта форма даёт правильный результат в Postgres на данных seed:
 * ошибка в имени связи или в структуре OR не поймается на объектах, но
 * поймается тут.
 *
 * Тесты только читают. Запускать после `npm run db:seed`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  visibleApplicationsFilter,
  visibleCommentsFilter,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { prismaRaw as db } from "@/lib/db/prisma";
import { listVacancies } from "@/lib/services/vacancies";

const ORG = "org_fattakhov";

const recruiter: Actor = {
  id: "usr_rec1",
  organizationId: ORG,
  role: "RECRUITER",
  clientId: null,
};

const starfishAdmin: Actor = {
  id: "usr_cl_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_starfish",
};

const starfishHiring: Actor = {
  id: "usr_cl_hiring1",
  organizationId: ORG,
  role: "CLIENT_HIRING",
  clientId: "cl_starfish",
};

const otherClientAdmin: Actor = {
  id: "usr_cl2_admin",
  organizationId: ORG,
  role: "CLIENT_ADMIN",
  clientId: "cl_technopark",
};

/** Ожидаемые числа считаем из самих данных, чтобы тест не рассыпался при правке seed. */
let totalApplications = 0;
let expectedVisibleToClient = 0;

beforeAll(async () => {
  const apps = await db.application.findMany({
    select: {
      presentedAt: true,
      stage: { select: { visibleToClient: true } },
    },
  });

  totalApplications = apps.length;
  expectedVisibleToClient = apps.filter(
    (a) => a.stage.visibleToClient || a.presentedAt !== null,
  ).length;

  // Если это условие не выполняется, тест ниже проходит вхолостую
  expect(
    expectedVisibleToClient,
    "в seed нет скрытых от клиента кандидатов — проверять нечего",
  ).toBeLessThan(totalApplications);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("порог видимости на реальных данных (BR-3)", () => {
  it("агентство видит всю воронку", async () => {
    const count = await db.application.count({
      where: visibleApplicationsFilter(recruiter),
    });
    expect(count).toBe(totalApplications);
  });

  it("клиент не видит кандидатов со скрытых этапов", async () => {
    const count = await db.application.count({
      where: visibleApplicationsFilter(starfishAdmin),
    });
    expect(count).toBe(expectedVisibleToClient);
    expect(count).toBeLessThan(totalApplications);
  });

  it("ни одна видимая клиенту заявка не сидит на скрытом этапе без представления", async () => {
    const visible = await db.application.findMany({
      where: visibleApplicationsFilter(starfishAdmin),
      select: {
        presentedAt: true,
        stage: { select: { code: true, visibleToClient: true } },
      },
    });

    const leaked = visible.filter(
      (a) => !a.stage.visibleToClient && a.presentedAt === null,
    );

    expect(
      leaked,
      `клиенту утекли кандидаты с этапов: ${leaked.map((l) => l.stage.code).join(", ")}`,
    ).toHaveLength(0);
  });

  it("отклонённый после представления остаётся виден клиенту", async () => {
    // Кандидат, вернувшийся на скрытый этап или отклонённый, но однажды
    // представленный — не должен исчезать из истории клиента.
    const presentedOnHiddenStage = await db.application.count({
      where: {
        ...visibleApplicationsFilter(starfishAdmin),
        presentedAt: { not: null },
      },
    });

    expect(presentedOnHiddenStage).toBeGreaterThan(0);
  });
});

describe("изоляция клиентов (BR-28)", () => {
  it("чужой клиент не видит ни одной заявки", async () => {
    const count = await db.application.count({
      where: visibleApplicationsFilter(otherClientAdmin),
    });
    expect(count).toBe(0);
  });

  it("клиент видит свои вакансии и ни одной чужой", async () => {
    const vacancies = await db.vacancy.findMany({
      where: visibleVacanciesFilter(otherClientAdmin),
      select: { clientId: true },
    });

    // У «Технопарка» есть собственные вакансии — важно, что видны только они
    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies.every((v) => v.clientId === "cl_technopark")).toBe(true);
  });

  it("все видимые клиенту вакансии принадлежат только ему", async () => {
    const vacancies = await db.vacancy.findMany({
      where: visibleVacanciesFilter(starfishAdmin),
      select: { clientId: true },
    });

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies.every((v) => v.clientId === "cl_starfish")).toBe(true);
  });

  it("нанимающий менеджер видит не больше администратора своей компании", async () => {
    const [admin, hiring] = await Promise.all([
      db.vacancy.count({ where: visibleVacanciesFilter(starfishAdmin) }),
      db.vacancy.count({ where: visibleVacanciesFilter(starfishHiring) }),
    ]);

    expect(hiring).toBeLessThanOrEqual(admin);
  });

  it("нанимающий менеджер видит свои вакансии и общие, но не чужие", async () => {
    const vacancies = await db.vacancy.findMany({
      where: visibleVacanciesFilter(starfishHiring),
      select: { hiringManagerId: true },
    });

    // «Чужой» здесь — с явно указанным другим заказчиком. Незанятый
    // заказчик (null) не должен прятать вакансию: до того, как кто-то
    // её заберёт, она общая для всех нанимающих менеджеров компании
    expect(
      vacancies.every(
        (v) =>
          v.hiringManagerId === starfishHiring.id ||
          v.hiringManagerId === null,
      ),
    ).toBe(true);

    // В сиде у «Старфиш» есть вакансия без заказчика — проверяем, что
    // она реально попала в выборку, а не просто что выборка её не
    // исключает: тест выше прошёл бы и при полностью сломанном OR,
    // если бы такой вакансии в данных не нашлось вовсе
    expect(vacancies.some((v) => v.hiringManagerId === null)).toBe(true);
  });

  /*
    Проверка идёт через сервис, а не через фильтр.

    Все тесты выше спрашивают visibleVacanciesFilter напрямую — и все
    они проходили в тот день, когда поиск по вакансиям отдавал
    нанимающему менеджеру чужие. Фильтр был верен; ломал его
    вызывающий, кладя собственный OR поиска рядом с OR видимости.
    Такое ловится только на том пути, которым ходит человек.
  */
  it("поиск не показывает нанимающему менеджеру чужие вакансии", async () => {
    const clientId = starfishHiring.clientId!;

    // Буква, которая есть почти в любом названии: нужен запрос, под
    // который подпадают и свои вакансии, и чужие — иначе проверка
    // пройдёт на пустом списке и ничего не докажет
    const query = "о";

    const matching = await db.vacancy.findMany({
      where: {
        clientId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { department: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, hiringManagerId: true },
    });

    const свои = matching.filter(
      (v) =>
        v.hiringManagerId === starfishHiring.id || v.hiringManagerId === null,
    );
    const чужие = matching.filter(
      (v) =>
        v.hiringManagerId !== null && v.hiringManagerId !== starfishHiring.id,
    );

    // Данные обязаны содержать и то, и другое, иначе тест бессодержателен
    expect(свои.length).toBeGreaterThan(0);
    expect(чужие.length).toBeGreaterThan(0);

    const { items } = await listVacancies(starfishHiring, { query, take: 50 });
    const выдано = new Set(items.map((v) => v.id));

    // Ровно свои и ничего сверх: и не шире, и не уже
    expect([...выдано].sort()).toEqual(свои.map((v) => v.id).sort());
    for (const v of чужие) expect(выдано.has(v.id)).toBe(false);
  });

  it("администратору клиента поиск отдаёт вакансии всей компании", async () => {
    // Обратная сторона той же правки: сузить видимость сверх нужного
    // так же плохо, как расширить. У администратора ограничения
    // по заказчику нет, и поиск не должен его выдумывать
    const clientId = starfishAdmin.clientId!;
    const query = "о";

    const matching = await db.vacancy.findMany({
      where: {
        clientId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { department: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    expect(matching.length).toBeGreaterThan(0);

    const { items } = await listVacancies(starfishAdmin, { query, take: 50 });

    expect(items.map((v) => v.id).sort()).toEqual(
      matching.map((v) => v.id).sort(),
    );
  });
});

describe("чужой объект по прямой ссылке (BR-28)", () => {
  // Долг Этапа 1: тогда маршрутов с объектами ещё не было, проверять было нечего.
  const STARFISH_VACANCY = "vac_1"; // ACTIVE, заказчик usr_cl_hiring1
  const TECHNOPARK_VACANCY = "vac_3";

  it("клиент не достаёт вакансию другого клиента", async () => {
    const found = await db.vacancy.findFirst({
      where: {
        id: STARFISH_VACANCY,
        ...visibleVacanciesFilter(otherClientAdmin),
      },
    });

    // null → страница вызывает notFound(), то есть 404, а не 403:
    // 403 подтвердил бы, что объект существует
    expect(found).toBeNull();
  });

  it("и в обратную сторону тоже", async () => {
    const found = await db.vacancy.findFirst({
      where: {
        id: TECHNOPARK_VACANCY,
        ...visibleVacanciesFilter(starfishAdmin),
      },
    });
    expect(found).toBeNull();
  });

  it("свою вакансию клиент открывает нормально", async () => {
    const found = await db.vacancy.findFirst({
      where: {
        id: STARFISH_VACANCY,
        ...visibleVacanciesFilter(starfishAdmin),
      },
    });
    expect(found?.id).toBe(STARFISH_VACANCY);
  });

  it("нанимающий менеджер не открывает чужую вакансию своей же компании", async () => {
    // vac_2 ведёт другой заказчик — usr_cl_hiring2
    const found = await db.vacancy.findFirst({
      where: { id: "vac_2", ...visibleVacanciesFilter(starfishHiring) },
    });
    expect(found).toBeNull();

    // а свою — открывает
    const own = await db.vacancy.findFirst({
      where: { id: STARFISH_VACANCY, ...visibleVacanciesFilter(starfishHiring) },
    });
    expect(own?.id).toBe(STARFISH_VACANCY);
  });

  it("агентство видит вакансии всех клиентов", async () => {
    for (const id of [STARFISH_VACANCY, TECHNOPARK_VACANCY]) {
      const found = await db.vacancy.findFirst({
        where: { id, ...visibleVacanciesFilter(recruiter) },
      });
      expect(found?.id, id).toBe(id);
    }
  });
});

describe("внутренние комментарии", () => {
  it("клиенту не отдаются комментарии с видимостью INTERNAL", async () => {
    const comments = await db.comment.findMany({
      where: visibleCommentsFilter(starfishAdmin),
      select: { visibility: true },
    });

    expect(comments.length).toBeGreaterThan(0);
    expect(comments.every((c) => c.visibility === "SHARED")).toBe(true);
  });

  it("агентство видит и внутренние, и общие", async () => {
    const [forAgency, forClient] = await Promise.all([
      db.comment.count({ where: visibleCommentsFilter(recruiter) }),
      db.comment.count({ where: visibleCommentsFilter(starfishAdmin) }),
    ]);

    expect(forAgency).toBeGreaterThan(forClient);
  });
});
