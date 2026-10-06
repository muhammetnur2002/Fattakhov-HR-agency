/**
 * Раздел «Студенты» в CRM: право students.search, разбор адреса, служебные вызовы
 * на платформу и показ контактов с записью в журнал доступа к ПДн.
 *
 * Платформу подменяет fetch: сеть тесту не нужна. Журнал — настоящая таблица
 * PersonalDataAccessLog во временной базе.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canAssignStaff, canDo, effectiveGrants, STAFF_GRANTS, type Actor } from "@/lib/access";
import type { UserRole } from "@/lib/generated/prisma/enums";

const state = vi.hoisted(() => ({
  actor: null as unknown as Actor,
  rateAllowed: true,
  failLog: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => {
  const { canDo: can } = await import("@/lib/access");
  return {
    requireAgencyActor: async () => state.actor,
    authorize: (actor: Actor, action: Parameters<typeof can>[1]) => {
      if (!can(actor, action)) throw new Error("NOT_FOUND");
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
}));
vi.mock("@/lib/security/guard", () => ({
  guardRate: async () => ({ allowed: state.rateAllowed, retryAfter: 90 }),
  rateLimitMessage: () => "Слишком много попыток. Попробуйте через 2 минут.",
}));
vi.mock("@/lib/services/student-profile-audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/student-profile-audit")>(
    "@/lib/services/student-profile-audit",
  );
  return {
    ...actual,
    recordStudentProfileAccess: async (...args: Parameters<typeof actual.recordStudentProfileAccess>) => {
      if (state.failLog) throw new Error("база недоступна");
      return actual.recordStudentProfileAccess(...args);
    },
  };
});

import { revealStudentContactsAction } from "@/app/(agency)/a/reviews/students/actions";
import { prismaRaw as db } from "@/lib/db/prisma";
import { listAccessLog, ACCESS_ACTION_LABELS } from "@/lib/services/pdn-retention";
import { recordStudentProfileAccess } from "@/lib/services/student-profile-audit";
import {
  countActiveFilters,
  parseStudentSearchParams,
  studentSearchQuery,
} from "@/lib/students-search-params";
import {
  fetchInstitutionNames,
  fetchPlatformStudent,
  searchPlatformStudents,
  StudentsRateLimitedError,
  StudentsServiceError,
} from "@/lib/students-service";

function actor(role: UserRole, grants: string[] = [], id = `usr_${role.toLowerCase()}`): Actor {
  return {
    id,
    organizationId: "org_fattakhov",
    role,
    clientId: role.startsWith("CLIENT_") ? "client_a" : null,
    grants,
  };
}

const SECRET = "s".repeat(40);
const profile = {
  id: "stu_1",
  fullName: "Шарипова Алия",
  contacts: { email: "aliya@example.ru", phone: "+7 900 111-22-33" },
};

type Call = { url: string; headers: Record<string, string> };
const calls: Call[] = [];
let respond: (url: string) => Response | Promise<Response> = () => new Response("{}");

beforeEach(() => {
  calls.length = 0;
  respond = () => new Response("{}");
  process.env.STUDENTS_URL = "https://students.test";
  process.env.CRM_SERVICE_SECRET = SECRET;
  state.rateAllowed = true;
  state.failLog = false;
  state.actor = actor("RECRUITER", ["students.search"], "usr_rec1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      return respond(url);
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.personalDataAccessLog.deleteMany({ where: { candidateId: { startsWith: "student-profile:" } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("право students.search", () => {
  it("владельцу есть всегда, сотруднику — только выданное, клиенту — никогда", () => {
    expect(STAFF_GRANTS).toContain("students.search");
    expect(effectiveGrants(actor("OWNER"))).toContain("students.search");
    expect(effectiveGrants(actor("RECRUITER"))).not.toContain("students.search");
    expect(effectiveGrants(actor("RECRUITER", ["students.search"]))).toEqual(["students.search"]);
    expect(effectiveGrants(actor("CLIENT_ADMIN", ["students.search"]))).toEqual([]);
  });

  it("с одним только поиском сотрудник заходит в раздел студенческой платформы", () => {
    expect(canDo(actor("HEAD", ["students.search"]), "students.enter")).toBe(true);
    expect(canDo(actor("HEAD"), "students.enter")).toBe(false);
    expect(canDo(actor("CLIENT_VIEWER", ["students.search"]), "students.enter")).toBe(false);
  });

  it("доверенный сотрудник раздаёт поиск, только если он есть у него самого", () => {
    const manager = actor("HEAD", ["staff.manage"]);
    expect(canAssignStaff(manager, { role: "RECRUITER" }, ["students.search"])).toBe(false);
    const manager2 = actor("HEAD", ["staff.manage", "students.search"]);
    expect(canAssignStaff(manager2, { role: "RECRUITER" }, ["students.search"])).toBe(true);
    expect(canAssignStaff(actor("OWNER"), { role: "ACCOUNT" }, ["students.search"])).toBe(true);
  });
});

describe("адрес страницы", () => {
  it("берёт только известное и проверенное, лишнее отбрасывает", () => {
    const parsed = parseStudentSearchParams({
      q: "  Шарипова ",
      studyYear: "9",
      ageFrom: "30",
      ageTo: "20",
      gender: "robot",
      study: "verified",
      status: "placed",
      onlineWithin: "60",
      sort: "hack",
      page: "-3",
      evil: "x",
    });
    expect(parsed.q).toBe("Шарипова");
    expect(parsed.studyYear).toBeUndefined();
    // Границы возраста меняются местами, а не отвергаются
    expect([parsed.ageFrom, parsed.ageTo]).toEqual(["20", "30"]);
    expect(parsed.gender).toBeUndefined();
    expect(parsed.study).toBe("verified");
    expect(parsed.status).toBe("placed");
    expect(parsed.onlineWithin).toBe("60");
    expect(parsed.sort).toBeUndefined();
    expect(parsed.page).toBeUndefined();
    expect(countActiveFilters(parsed)).toBe(6);
  });

  it("строка запроса не содержит значений по умолчанию и пустых полей", () => {
    expect(studentSearchQuery({ sort: "new", page: 1 }).toString()).toBe("");
    expect(studentSearchQuery({ q: "а", sort: "seen", page: 3 }).toString()).toBe("q=%D0%B0&sort=seen&page=3");
  });

  it("управляющие символы и слишком длинный текст не проходят на платформу", () => {
    const parsed = parseStudentSearchParams({ q: "а\u0000б\n" + "в".repeat(500), skills: "x".repeat(900) });
    expect(parsed.q).toMatch(/^а б /);
    expect(parsed.q!.length).toBeLessThanOrEqual(100);
    expect(parsed.skills!.length).toBeLessThanOrEqual(300);
  });
});

describe("служебные вызовы на платформу", () => {
  it("список: секрет и сотрудник в заголовках, запрос собран из проверенных параметров", async () => {
    respond = () => Response.json({ items: [], total: 0, page: 1, pageSize: 20, hint: null });
    const query = studentSearchQuery(parseStudentSearchParams({ q: "иванов", city: "Казань", page: "2" }));
    const result = await searchPlatformStudents(query, "usr_rec1");
    expect(result.total).toBe(0);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://students.test/api/service/staff/students");
    expect(url.searchParams.get("q")).toBe("иванов");
    expect(url.searchParams.get("page")).toBe("2");
    expect(calls[0].headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(calls[0].headers["x-crm-actor"]).toBe("usr_rec1");
  });

  it("профиль без контактов не просит contacts=1, с контактами — просит", async () => {
    respond = () => Response.json({ ...profile, contacts: null });
    await fetchPlatformStudent("stu_1", { actorId: "usr_rec1" });
    expect(calls[0].url).toBe("https://students.test/api/service/staff/students/stu_1");
    await fetchPlatformStudent("stu_1", { actorId: "usr_rec1", contacts: true });
    expect(calls[1].url).toBe("https://students.test/api/service/staff/students/stu_1?contacts=1");
  });

  it("чужой путь в идентификаторе не проходит: служебный секрет остаётся на своих маршрутах", async () => {
    await expect(fetchPlatformStudent("../../crm-links", { actorId: "usr_rec1" })).rejects.toBeInstanceOf(StudentsServiceError);
    expect(calls).toHaveLength(0);
  });

  it("404 — студента нет (null), 429 — «подождите», 5xx и сеть — «платформа не ответила»", async () => {
    respond = () => new Response("{}", { status: 404 });
    expect(await fetchPlatformStudent("stu_1", { actorId: "a" })).toBeNull();

    respond = () => new Response("{}", { status: 429 });
    await expect(searchPlatformStudents(new URLSearchParams(), "a")).rejects.toBeInstanceOf(StudentsRateLimitedError);

    respond = () => new Response("{}", { status: 503 });
    await expect(searchPlatformStudents(new URLSearchParams(), "a")).rejects.toBeInstanceOf(StudentsServiceError);

    respond = () => {
      throw new TypeError("fetch failed");
    };
    const error = await searchPlatformStudents(new URLSearchParams(), "a").catch((e) => e);
    expect(error).toBeInstanceOf(StudentsServiceError);
    expect(error.message).toMatch(/не отвечает/);
  });

  it("платформа не настроена — понятная ошибка, а не падение страницы", async () => {
    delete process.env.CRM_SERVICE_SECRET;
    await expect(searchPlatformStudents(new URLSearchParams(), "a")).rejects.toBeInstanceOf(StudentsServiceError);
  });

  it("справочник вузов: имена и сокращения; недоступен — пусто, без ошибки", async () => {
    respond = () =>
      Response.json({ institutions: [{ name: "Казанский университет", shortName: "КФУ" }, { name: "КНИТУ", shortName: null }] });
    expect(await fetchInstitutionNames()).toEqual(["КНИТУ", "КФУ", "Казанский университет"].sort((a, b) => a.localeCompare(b, "ru")));
    respond = () => new Response("oops", { status: 500 });
    expect(await fetchInstitutionNames()).toEqual([]);
    respond = () => {
      throw new Error("down");
    };
    expect(await fetchInstitutionNames()).toEqual([]);
  });
});

describe("показ контактов", () => {
  const logRows = () =>
    db.personalDataAccessLog.findMany({ where: { candidateId: { startsWith: "student-profile:" } } });

  it("с доступом: контакты в ответе, запрос с contacts=1, запись в журнале без ФИО", async () => {
    respond = () => Response.json(profile);
    const result = await revealStudentContactsAction("stu_1");
    expect(result.contacts).toEqual(profile.contacts);
    expect(calls[0].url).toContain("/api/service/staff/students/stu_1?contacts=1");
    expect(calls[0].headers["x-crm-actor"]).toBe("usr_rec1");

    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: "org_fattakhov",
      actorId: "usr_rec1",
      candidateId: "student-profile:stu_1",
      action: "student_profile_contacts_view",
      ip: "203.0.113.5",
    });
    expect(JSON.stringify(rows[0])).not.toContain("Шарипова");
  });

  it("каждый показ — отдельная запись", async () => {
    respond = () => Response.json(profile);
    await revealStudentContactsAction("stu_1");
    await revealStudentContactsAction("stu_1");
    expect(await logRows()).toHaveLength(2);
  });

  it("без доступа к поиску: отказ, на платформу не ходим, в журнале пусто", async () => {
    state.actor = actor("RECRUITER", ["students.study"], "usr_rec1");
    const result = await revealStudentContactsAction("stu_1");
    expect(result.error).toBe("Недостаточно прав");
    expect(calls).toHaveLength(0);
    expect(await logRows()).toHaveLength(0);
  });

  it("владелец показывает без выданного права", async () => {
    state.actor = actor("OWNER", [], "usr_owner");
    respond = () => Response.json(profile);
    expect((await revealStudentContactsAction("stu_1")).contacts).toBeTruthy();
  });

  it("клиентской роли отказ (404), а не данные", async () => {
    state.actor = actor("CLIENT_ADMIN", ["students.search"], "usr_cl");
    await expect(revealStudentContactsAction("stu_1")).rejects.toThrow("NOT_FOUND");
    expect(calls).toHaveLength(0);
  });

  it("платформа недоступна — ошибка человеку, в журнал ничего: показа не было", async () => {
    respond = () => new Response("{}", { status: 502 });
    const result = await revealStudentContactsAction("stu_1");
    expect(result.error).toBeTruthy();
    expect(result.contacts).toBeUndefined();
    expect(await logRows()).toHaveLength(0);
  });

  it("не записалось в журнал — контакты не отдаём", async () => {
    respond = () => Response.json(profile);
    state.failLog = true;
    const result = await revealStudentContactsAction("stu_1");
    expect(result.contacts).toBeUndefined();
    expect(result.error).toMatch(/журнал/);
  });

  it("лимит: при превышении на платформу не ходим", async () => {
    state.rateAllowed = false;
    const result = await revealStudentContactsAction("stu_1");
    expect(result.error).toMatch(/Слишком много/);
    expect(calls).toHaveLength(0);
  });

  it("студента нет и мусорный идентификатор — отказ без записи", async () => {
    respond = () => new Response("{}", { status: 404 });
    expect((await revealStudentContactsAction("stu_none")).error).toBe("Студент не найден");
    expect((await revealStudentContactsAction("../x")).error).toBe("Студент не найден");
    expect(await logRows()).toHaveLength(0);
  });
});

describe("журнал доступа", () => {
  it("просмотр анкеты не чаще раза в 10 минут на сотрудника и студента", async () => {
    const rec = actor("RECRUITER", ["students.search"], "usr_rec1");
    const options = { dedupeMs: 10 * 60_000 };
    await recordStudentProfileAccess(rec, "stu_9", "student_profile_view", undefined, options);
    await recordStudentProfileAccess(rec, "stu_9", "student_profile_view", undefined, options);
    await recordStudentProfileAccess(actor("OWNER", [], "usr_owner"), "stu_9", "student_profile_view", undefined, options);
    await recordStudentProfileAccess(rec, "stu_10", "student_profile_view", undefined, options);
    const rows = await db.personalDataAccessLog.findMany({ where: { candidateId: { startsWith: "student-profile:" } } });
    expect(rows).toHaveLength(3);
  });

  it("владелец видит записи с человеческими подписями и без ФИО студента", async () => {
    await recordStudentProfileAccess(actor("OWNER", [], "usr_owner"), "stu_abcdef123456", "student_profile_contacts_view");
    const entries = await listAccessLog(actor("OWNER", [], "usr_owner"), { limit: 20 });
    const entry = entries.find((e) => e.action === "student_profile_contacts_view")!;
    expect(entry.candidateName).toBe("Студент платформы (…123456)");
    expect(ACCESS_ACTION_LABELS.student_profile_contacts_view).toMatch(/контакты/i);
    expect(ACCESS_ACTION_LABELS.student_profile_view).toBeTruthy();
  });
});
