/**
 * Тесты слоя прав против матрицы ТЗ 3.2.
 *
 * Это не формальность: слой доступа — единственное, что отделяет внутреннюю
 * кухню агентства от кабинета клиента. Каждая строка матрицы должна иметь
 * здесь отражение, иначе тихая регрессия в canDo вскроется уже на проде.
 */
import { describe, expect, it } from "vitest";
import {
  canDo,
  isAgency,
  isClient,
  visibleApplicationsFilter,
  visibleCommentsFilter,
  visibleVacanciesFilter,
  type Action,
  type Actor,
} from "@/lib/access";
import type { UserRole } from "@/lib/generated/prisma/enums";

const ORG = "org_1";
const CLIENT_A = "client_a";
const CLIENT_B = "client_b";

function actor(role: UserRole, overrides: Partial<Actor> = {}): Actor {
  const isClientRole = role.startsWith("CLIENT_");
  return {
    id: `usr_${role.toLowerCase()}`,
    organizationId: ORG,
    role,
    clientId: isClientRole ? CLIENT_A : null,
    ...overrides,
  };
}

/** Все роли — чтобы «разрешено всем прочим» никогда не проскочило молча. */
const ALL_ROLES: UserRole[] = [
  "OWNER",
  "HEAD",
  "RECRUITER",
  "ACCOUNT",
  "CLIENT_ADMIN",
  "CLIENT_HIRING",
  "CLIENT_VIEWER",
];

/**
 * Проверяет действие против полного списка ролей: перечисленные — разрешено,
 * все остальные — запрещено. Subject по умолчанию принадлежит своему клиенту.
 */
function expectAllowedOnly(
  action: Action,
  allowed: UserRole[],
  subject = { clientId: CLIENT_A, hiringManagerId: "usr_client_hiring" },
) {
  for (const role of ALL_ROLES) {
    const expected = allowed.includes(role);
    expect(
      canDo(actor(role), action, subject),
      `${action} для ${role} должно быть ${expected ? "разрешено" : "запрещено"}`,
    ).toBe(expected);
  }
}

describe("классификация ролей", () => {
  it("делит агентство и клиента без пересечений", () => {
    const agency = ALL_ROLES.filter((r) => isAgency(actor(r)));
    const client = ALL_ROLES.filter((r) => isClient(actor(r)));
    expect(agency).toEqual(["OWNER", "HEAD", "RECRUITER", "ACCOUNT"]);
    expect(client).toEqual(["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"]);
    expect(agency.length + client.length).toBe(ALL_ROLES.length);
  });
});

describe("матрица прав ТЗ 3.2", () => {
  it("клиенты: создание и редактирование — только OWNER и ACCOUNT", () => {
    expectAllowedOnly("client.manage", ["OWNER", "ACCOUNT"]);
  });

  it("договор: правит агентство, клиент только смотрит", () => {
    expectAllowedOnly("agreement.manage", ["OWNER", "ACCOUNT"]);
    expectAllowedOnly("agreement.view", [
      "OWNER",
      "HEAD",
      "ACCOUNT",
      "CLIENT_ADMIN",
    ]);
  });

  it("учётные записи клиента не показываем рекрутёру", () => {
    expectAllowedOnly("client.viewUsers", [
      "OWNER",
      "HEAD",
      "ACCOUNT",
      "CLIENT_ADMIN",
    ]);
    expect(canDo(actor("RECRUITER"), "client.view", {})).toBe(true);
  });

  it("заявка на подбор: может почти кто угодно, кроме наблюдателя", () => {
    expectAllowedOnly("vacancy.create", [
      "OWNER",
      "HEAD",
      "RECRUITER",
      "ACCOUNT",
      "CLIENT_ADMIN",
      "CLIENT_HIRING",
    ]);
  });

  it("приёмка заявки — только агентство, и без рекрутера", () => {
    expectAllowedOnly("vacancy.accept", ["OWNER", "HEAD", "ACCOUNT"]);
  });

  it("назначение рекрутера — только OWNER и HEAD", () => {
    expectAllowedOnly("vacancy.assignRecruiter", ["OWNER", "HEAD"]);
  });

  it("сноска 1: рекрутер приостанавливает, но не закрывает", () => {
    expect(canDo(actor("RECRUITER"), "vacancy.hold", {})).toBe(true);
    expect(canDo(actor("RECRUITER"), "vacancy.close", {})).toBe(false);
  });

  it("сноска 3: решение по кандидату принимает только клиент", () => {
    expectAllowedOnly("application.decide", ["CLIENT_ADMIN", "CLIENT_HIRING"]);
  });

  it("BR-14: агентство вносит решение со слов клиента, клиент — нет", () => {
    expectAllowedOnly("application.decideOnBehalf", [
      "OWNER",
      "HEAD",
      "RECRUITER",
      "ACCOUNT",
    ]);
  });

  it("внутренние комментарии недоступны любой клиентской роли", () => {
    expectAllowedOnly("comment.writeInternal", [
      "OWNER",
      "HEAD",
      "RECRUITER",
      "ACCOUNT",
    ]);
  });

  it("наблюдатель не пишет даже общие комментарии", () => {
    expect(canDo(actor("CLIENT_VIEWER"), "comment.writeShared", {})).toBe(false);
  });

  it("внутренние этапы воронки скрыты от всех клиентских ролей", () => {
    expectAllowedOnly("application.viewInternal", [
      "OWNER",
      "HEAD",
      "RECRUITER",
      "ACCOUNT",
    ]);
  });

  it("добавлять кандидатов в воронку может только подбор", () => {
    expectAllowedOnly("application.create", ["OWNER", "HEAD", "RECRUITER"]);
  });

  it("слоты предлагает агентство, подтверждает и клиент", () => {
    expectAllowedOnly("interview.proposeSlots", ["OWNER", "HEAD", "RECRUITER"]);
    expectAllowedOnly("interview.confirm", [
      "OWNER",
      "HEAD",
      "RECRUITER",
      "CLIENT_ADMIN",
      "CLIENT_HIRING",
    ]);
  });

  it("счета: правят OWNER и ACCOUNT, смотрит ещё HEAD и админ клиента", () => {
    expectAllowedOnly("invoice.manage", ["OWNER", "ACCOUNT"]);
    expectAllowedOnly("invoice.view", [
      "OWNER",
      "HEAD",
      "ACCOUNT",
      "CLIENT_ADMIN",
    ]);
  });

  it("руководитель подбора видит и аналитику агентства, и счета", () => {
    expect(canDo(actor("HEAD"), "analytics.agency", {})).toBe(true);
    expect(canDo(actor("HEAD"), "invoice.view", {})).toBe(true);
    // Выставляет и правит счета всё же не он
    expect(canDo(actor("HEAD"), "invoice.manage", {})).toBe(false);
  });

  it("аналитика агентства закрыта от рекрутера и от всех клиентских ролей", () => {
    expectAllowedOnly("analytics.agency", ["OWNER", "HEAD"]);
  });

  it("настройки организации и журнал ПДн — только владелец", () => {
    expectAllowedOnly("org.settings", ["OWNER"]);
    expectAllowedOnly("pdn.auditLog", ["OWNER"]);
  });

  it("условия сотрудничества принимает подписант — админ клиента", () => {
    // Агентство их предлагает и подтверждает (agreement.manage),
    // но не «принимает» за клиента
    expectAllowedOnly("agreement.accept", ["CLIENT_ADMIN"]);
  });

  it("вернуть закрытую вакансию в работу может только руководство", () => {
    expectAllowedOnly("vacancy.reactivate", ["OWNER", "HEAD"]);
  });

  it("чужой комментарий удаляет только владелец", () => {
    expectAllowedOnly("comment.deleteAny", ["OWNER"]);
  });

  it("сноска 5: админ клиента управляет пользователями своей компании", () => {
    expect(
      canDo(actor("CLIENT_ADMIN"), "org.manageClientUsers", {
        clientId: CLIENT_A,
      }),
    ).toBe(true);
    expect(
      canDo(actor("CLIENT_ADMIN"), "org.manageClientUsers", {
        clientId: CLIENT_B,
      }),
    ).toBe(false);
  });
});

describe("изоляция клиентов (BR-28)", () => {
  const clientRoles: UserRole[] = [
    "CLIENT_ADMIN",
    "CLIENT_HIRING",
    "CLIENT_VIEWER",
  ];

  it("ни одна клиентская роль не достаёт до чужой компании", () => {
    const actions: Action[] = [
      "client.view",
      "vacancy.create",
      "vacancy.close",
      "comment.writeShared",
      "analytics.client",
      "interview.confirm",
      "application.decide",
      "invoice.view",
      "agreement.view",
    ];

    for (const role of clientRoles) {
      for (const action of actions) {
        expect(
          canDo(actor(role), action, {
            clientId: CLIENT_B,
            hiringManagerId: `usr_${role.toLowerCase()}`,
          }),
          `${role} не должен иметь ${action} у чужого клиента`,
        ).toBe(false);
      }
    }
  });

  it("сноска 2: CLIENT_HIRING ограничен своими вакансиями", () => {
    const hiring = actor("CLIENT_HIRING", { id: "usr_hiring_1" });

    expect(
      canDo(hiring, "vacancy.close", {
        clientId: CLIENT_A,
        hiringManagerId: "usr_hiring_1",
      }),
    ).toBe(true);

    expect(
      canDo(hiring, "vacancy.close", {
        clientId: CLIENT_A,
        hiringManagerId: "usr_hiring_2",
      }),
    ).toBe(false);

    // Поле в брифе необязательное: пока никто не назначен заказчиком,
    // вакансия общая и доступна любому нанимающему менеджеру компании —
    // а не «ничья» для всех сразу (см. ownHiring в lib/access)
    expect(
      canDo(hiring, "vacancy.close", {
        clientId: CLIENT_A,
        hiringManagerId: null,
      }),
    ).toBe(true);
  });

  it("CLIENT_ADMIN не ограничен конкретным заказчиком внутри своей компании", () => {
    expect(
      canDo(actor("CLIENT_ADMIN"), "vacancy.close", {
        clientId: CLIENT_A,
        hiringManagerId: "usr_someone_else",
      }),
    ).toBe(true);
  });
});

describe("фильтры видимости", () => {
  it("BR-3: клиент видит только видимые этапы или ранее представленных", () => {
    const filter = visibleApplicationsFilter(actor("CLIENT_ADMIN")) as {
      organizationId: string;
      vacancy: { clientId: string };
      OR: unknown[];
    };

    expect(filter.organizationId).toBe(ORG);
    expect(filter.vacancy.clientId).toBe(CLIENT_A);
    expect(filter.OR).toEqual([
      { stage: { visibleToClient: true } },
      { presentedAt: { not: null } },
    ]);
  });

  it("BR-3: агентство видит всю воронку без ограничения по этапу", () => {
    const filter = visibleApplicationsFilter(actor("RECRUITER")) as {
      organizationId: string;
      OR?: unknown;
      vacancy?: unknown;
    };

    expect(filter.organizationId).toBe(ORG);
    expect(filter.OR).toBeUndefined();
    expect(filter.vacancy).toBeUndefined();
  });

  it("CLIENT_HIRING дополнительно сужается до своих вакансий и общих", () => {
    const filter = visibleApplicationsFilter(
      actor("CLIENT_HIRING", { id: "usr_hiring_1" }),
    ) as { vacancy: { OR?: { hiringManagerId?: string | null }[] } };

    // Свои — и вакансии без назначенного заказчика (см. ownHiring)
    expect(filter.vacancy.OR).toEqual([
      { hiringManagerId: "usr_hiring_1" },
      { hiringManagerId: null },
    ]);
  });

  it("CLIENT_ADMIN не сужается по заказчику", () => {
    const filter = visibleApplicationsFilter(actor("CLIENT_ADMIN")) as {
      vacancy: { hiringManagerId?: string; OR?: unknown };
    };

    expect(filter.vacancy.hiringManagerId).toBeUndefined();
    expect(filter.vacancy.OR).toBeUndefined();
  });

  it("комментарии: клиенту только SHARED, агентству всё", () => {
    const forClient = visibleCommentsFilter(actor("CLIENT_ADMIN")) as {
      visibility?: string;
    };
    const forAgency = visibleCommentsFilter(actor("RECRUITER")) as {
      visibility?: string;
    };

    expect(forClient.visibility).toBe("SHARED");
    expect(forAgency.visibility).toBeUndefined();
  });

  it("вакансии клиента всегда ограничены его clientId", () => {
    for (const role of ["CLIENT_ADMIN", "CLIENT_HIRING", "CLIENT_VIEWER"] as const) {
      const filter = visibleVacanciesFilter(actor(role)) as {
        clientId?: string;
      };
      expect(filter.clientId).toBe(CLIENT_A);
    }
  });

  it("список вакансий: CLIENT_HIRING видит свои и общие, CLIENT_ADMIN всё", () => {
    const forHiring = visibleVacanciesFilter(
      actor("CLIENT_HIRING", { id: "usr_hiring_1" }),
    ) as { OR?: { hiringManagerId?: string | null }[] };
    expect(forHiring.OR).toEqual([
      { hiringManagerId: "usr_hiring_1" },
      { hiringManagerId: null },
    ]);

    const forAdmin = visibleVacanciesFilter(actor("CLIENT_ADMIN")) as {
      OR?: unknown;
    };
    expect(forAdmin.OR).toBeUndefined();
  });

  it("все фильтры всегда ограничены организацией", () => {
    for (const role of ALL_ROLES) {
      for (const build of [
        visibleApplicationsFilter,
        visibleVacanciesFilter,
        visibleCommentsFilter,
      ]) {
        const filter = build(actor(role)) as { organizationId?: string };
        expect(filter.organizationId, `${role} / ${build.name}`).toBe(ORG);
      }
    }
  });
});
