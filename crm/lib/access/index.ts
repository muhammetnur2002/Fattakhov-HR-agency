/**
 * СЛОЙ ДОСТУПА — единственное место, где живёт логика прав.
 *
 * Правило проекта (ТЗ 14.3 п.1): ни одной проверки роли в JSX и ни одной
 * в компонентах. Всё, что решает «кому что видно и кто что может» — здесь.
 * Причина не в эстетике: порог видимости (BR-3) отделяет внутреннюю кухню
 * агентства от кабинета клиента. Проверка, размазанная по компонентам,
 * однажды потеряется при рефакторинге, и клиент увидит лонг-лист.
 *
 * Таблица PERMISSIONS ниже — прямой перенос матрицы прав из ТЗ 3.2.
 * Сверять построчно при любом изменении.
 */

import type { UserRole } from "@/lib/generated/prisma/enums";

/** Роли на стороне агентства. */
export const AGENCY_ROLES = [
  "OWNER",
  "HEAD",
  "RECRUITER",
  "ACCOUNT",
] as const satisfies readonly UserRole[];

/** Роли на стороне клиента. */
export const CLIENT_ROLES = [
  "CLIENT_ADMIN",
  "CLIENT_HIRING",
  "CLIENT_VIEWER",
] as const satisfies readonly UserRole[];

/**
 * Роли, которые выдаются приглашением в команду агентства. Владельца
 * не приглашают: он появляется один раз, при первичной настройке.
 */
export const STAFF_ROLES = [
  "HEAD",
  "RECRUITER",
  "ACCOUNT",
] as const satisfies readonly UserRole[];

export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Доступы сверх роли.
 *
 * Роль задаёт основу — матрицу ТЗ 3.2 ниже. Владелец добавляет конкретному
 * сотруднику то, что нужно именно ему, и сам называет его должность.
 * Должность — свободный текст и на права не влияет: права дают только
 * эти коды.
 */
export const STAFF_GRANTS = [
  "staff.manage",
  "students.moderation",
  "students.study",
  "students.pilot",
] as const;

export type StaffGrant = (typeof STAFF_GRANTS)[number];

/** Разделы студенческой платформы. */
const STUDENT_GRANTS: readonly StaffGrant[] = [
  "students.moderation",
  "students.study",
  "students.pilot",
];

/** Минимум данных о пользователе, достаточный для решения о доступе. */
export type Actor = {
  id: string;
  organizationId: string;
  role: UserRole;
  /** Заполнен только у ролей CLIENT_*. */
  clientId: string | null;
  /** Доступы сверх роли (STAFF_GRANTS). У клиентских ролей не действуют. */
  grants?: readonly string[];
};

/** Объект, над которым выполняется действие. Все поля опциональны. */
export type Subject = {
  /** Клиент, которому принадлежит объект (вакансия, счёт, договор). */
  clientId?: string | null;
  /** Заказчик со стороны клиента — для ограничения CLIENT_HIRING. */
  hiringManagerId?: string | null;
  /** Ведущий рекрутер вакансии. */
  leadRecruiterId?: string | null;
  /** Все рекрутеры вакансии. */
  recruiterIds?: string[];
};

export function isAgency(actor: Actor): boolean {
  return (AGENCY_ROLES as readonly UserRole[]).includes(actor.role);
}

export function isClient(actor: Actor): boolean {
  return (CLIENT_ROLES as readonly UserRole[]).includes(actor.role);
}

/**
 * Действия, права на которые проверяются.
 * Именование: <сущность>.<действие>. Просмотр и изменение — разные действия,
 * потому что в матрице 3.2 роли часто имеют одно без другого.
 */
export type Action =
  // клиенты и договоры
  | "client.view"
  | "client.viewUsers"
  | "client.manage"
  | "agreement.view"
  | "agreement.manage"
  | "agreement.accept"
  // вакансии
  | "vacancy.create"
  | "vacancy.accept"
  | "vacancy.assignRecruiter"
  | "vacancy.hold"
  | "vacancy.close"
  | "vacancy.editBrief"
  | "vacancy.reactivate"
  // кандидаты и воронка
  | "application.create"
  | "application.moveStage"
  | "application.present"
  | "application.viewInternal"
  | "application.decide"
  | "application.decideOnBehalf"
  // коммуникация
  | "comment.writeShared"
  | "comment.writeInternal"
  | "comment.deleteAny"
  // интервью
  | "interview.proposeSlots"
  | "interview.confirm"
  // финансы
  | "invoice.view"
  | "invoice.manage"
  // аналитика
  | "analytics.client"
  | "analytics.agency"
  // администрирование
  | "org.settings"
  | "org.manageClientUsers"
  | "pdn.auditLog"
  // команда агентства и студенческая платформа
  | "staff.manage"
  | "students.enter"
  | "students.enterAsClient";

/** Правило: либо просто «можно/нельзя», либо предикат с контекстом. */
type Rule = boolean | ((actor: Actor, subject: Subject) => boolean);

/** Объект принадлежит компании этого клиентского пользователя. */
function ownClient(actor: Actor, subject: Subject): boolean {
  // Отсутствие clientId в subject означает «проверять нечего» на уровне
  // списка; конкретный объект всегда обязан его передать.
  if (subject.clientId === undefined) return true;
  return !!actor.clientId && subject.clientId === actor.clientId;
}

/**
 * CLIENT_HIRING работает только с вакансиями, где он указан заказчиком
 * (сноска ² к матрице) — но «не указан» и «указан кто-то другой» это
 * разные вещи, и матрица про первое молчит.
 *
 * Поле в форме брифа необязательное: заводя вакансию, ни администратор
 * клиента, ни сам нанимающий менеджер не обязаны сразу выбирать
 * заказчика. `null` здесь означает не «ничья», а «пока общая» — и до
 * того, как кто-то её себе заберёт, её обязаны видеть все нанимающие
 * менеджеры компании, а не только тот, кто угадает заглянуть в общий
 * список у администратора. Строгое равенство здесь означало обратное:
 * вакансия без заказчика переставала существовать для всех нанимающих
 * менеджеров сразу, включая того, кто её только что сам завёл и не
 * заметил пустого выпадающего списка.
 */
function ownHiring(actor: Actor, subject: Subject): boolean {
  if (!ownClient(actor, subject)) return false;
  if (subject.hiringManagerId === undefined) return true;
  return (
    subject.hiringManagerId === actor.id || subject.hiringManagerId === null
  );
}

/**
 * Доступ, выданный сотруднику агентства. Клиентской роли — никогда, что бы
 * ни лежало в поле: доступы про внутреннюю работу агентства.
 */
function granted(grant: StaffGrant): Rule {
  return (actor) => isAgency(actor) && (actor.grants ?? []).includes(grant);
}

/** Выдан хоть один раздел студенческой платформы. */
function anyStudentsGrant(actor: Actor): boolean {
  return (
    isAgency(actor) &&
    STUDENT_GRANTS.some((grant) => (actor.grants ?? []).includes(grant))
  );
}

/**
 * МАТРИЦА ПРАВ — ТЗ 3.2.
 * Отсутствие роли в записи означает «запрещено».
 */
const PERMISSIONS: Record<Action, Partial<Record<UserRole, Rule>>> = {
  // --- Клиенты и договоры ---
  "client.view": {
    OWNER: true,
    HEAD: true,
    ACCOUNT: true,
    RECRUITER: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownClient,
    CLIENT_VIEWER: ownClient,
  },
  /*
    Список людей на стороне клиента с их ролями и последним входом —
    рабочий инструмент того, кто ведёт отношения с компанией, а не
    того, кто ведёт воронку. Рекрутёр координируется с заказчиком
    через вакансию и обсуждения, и отдельный доступ к учётным записям
    клиента ему для этого не нужен.
  */
  "client.viewUsers": {
    OWNER: true,
    HEAD: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
  },
  "client.manage": { OWNER: true, ACCOUNT: true },

  "agreement.view": {
    OWNER: true,
    HEAD: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
  },
  "agreement.manage": { OWNER: true, ACCOUNT: true },
  /*
    Условия сотрудничества выбирает подписант — администратор компании.
    Со стороны агентства их не «принимают»: агентство их предлагает
    и подтверждает, а это agreement.manage.
  */
  "agreement.accept": { CLIENT_ADMIN: ownClient },

  // --- Вакансии ---
  "vacancy.create": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownClient,
  },
  "vacancy.accept": { OWNER: true, HEAD: true, ACCOUNT: true },
  "vacancy.assignRecruiter": { OWNER: true, HEAD: true },

  // Сноска ¹: рекрутер может приостановить, но не закрыть.
  "vacancy.hold": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
  },
  "vacancy.close": {
    OWNER: true,
    HEAD: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
  },

  // BR-21: клиент не правит бриф активной вакансии напрямую — только через
  // «запросить изменение». Проверка статуса живёт в сервисе вакансий.
  "vacancy.editBrief": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
  },
  /*
    Вернуть закрытую вакансию в работу — решение не про подбор,
    а про обязательства: закрытие уже посчитано в отчётах и, возможно,
    в счёте. Поэтому только руководство агентства, и никогда клиент.
  */
  "vacancy.reactivate": { OWNER: true, HEAD: true },

  // --- Кандидаты и воронка ---
  "application.create": { OWNER: true, HEAD: true, RECRUITER: true },
  "application.moveStage": { OWNER: true, HEAD: true, RECRUITER: true },
  "application.present": { OWNER: true, HEAD: true, RECRUITER: true },

  // Внутренние этапы, agencyNotes, Candidate.summary — только агентство.
  "application.viewInternal": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
  },

  // Сноска ³: решение принимает только клиент.
  "application.decide": {
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
  },
  // BR-14: агентство может внести решение со слов клиента — с пометкой.
  "application.decideOnBehalf": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
  },

  // --- Коммуникация ---
  "comment.writeShared": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
  },
  "comment.writeInternal": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
  },
  /*
    Свой комментарий удаляет автор — это не право, а авторство,
    и проверяется сравнением id. Здесь только про чужие: убрать
    чужую реплику из переписки может владелец организации.
  */
  "comment.deleteAny": { OWNER: true },

  // --- Интервью ---
  "interview.proposeSlots": { OWNER: true, HEAD: true, RECRUITER: true },
  "interview.confirm": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
  },

  // --- Финансы ---
  "invoice.view": {
    OWNER: true,
    HEAD: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
  },
  "invoice.manage": { OWNER: true, ACCOUNT: true },

  // --- Аналитика ---
  "analytics.client": {
    OWNER: true,
    HEAD: true,
    RECRUITER: true,
    ACCOUNT: true,
    CLIENT_ADMIN: ownClient,
    CLIENT_HIRING: ownHiring,
    CLIENT_VIEWER: ownClient,
  },
  /*
    Сноска ⁴ ТЗ отделяла финансовую аналитику от остальной: HEAD видит
    загрузку и скорость, но не деньги. Право под это было объявлено,
    но не проверялось нигде ни разу, а раздел «Финансы» всё это время
    показывал руководителю подбора дебиторку — то есть правило
    существовало только на бумаге.

    Владелец агентства решил иначе: руководитель подбора деньги видит.
    Право удалено, а не роздано: неиспользуемая строка в матрице
    опаснее отсутствующей — она читается как работающее ограничение.
  */
  "analytics.agency": { OWNER: true, HEAD: true },

  // --- Администрирование ---
  "org.settings": { OWNER: true },
  // Сноска ⁵: CLIENT_ADMIN управляет только пользователями своей компании.
  "org.manageClientUsers": { OWNER: true, CLIENT_ADMIN: ownClient },
  "pdn.auditLog": { OWNER: true },

  // --- Команда агентства ---
  /*
    Приглашать сотрудников, менять им роль, должность и доступы —
    владелец и тот, кому он это доверил. Кого именно можно трогать
    и что можно раздать, решают canManageStaffMember и canAssignStaff.
  */
  "staff.manage": {
    OWNER: true,
    HEAD: granted("staff.manage"),
    RECRUITER: granted("staff.manage"),
    ACCOUNT: granted("staff.manage"),
  },

  // --- Студенческая платформа ---
  // Вход из CRM без второго пароля: владельцу всегда, сотруднику —
  // если владелец выдал хоть один раздел
  "students.enter": {
    OWNER: true,
    HEAD: anyStudentsGrant,
    RECRUITER: anyStudentsGrant,
    ACCOUNT: anyStudentsGrant,
  },

  /*
    Вход клиента на студенческую платформу — уже проверенный агентством
    заказчик публикует вакансию сам, тем же паролем, что и в CRM. Только
    администратор и нанимающий менеджер: смотрящему (CLIENT_VIEWER)
    публиковать нечего.
  */
  "students.enterAsClient": {
    CLIENT_ADMIN: true,
    CLIENT_HIRING: true,
  },
};

/** Может ли actor выполнить action над subject. */
export function canDo(
  actor: Actor,
  action: Action,
  subject: Subject = {},
): boolean {
  const rule = PERMISSIONS[action][actor.role];
  if (rule === undefined) return false;
  return typeof rule === "function" ? rule(actor, subject) : rule;
}

/**
 * Ошибка доступа. Наверху её надо превращать в 404, а не 403 (BR-28):
 * не раскрываем клиенту существование чужого объекта.
 */
export class AccessDeniedError extends Error {
  constructor(action: Action) {
    super(`Доступ запрещён: ${action}`);
    this.name = "AccessDeniedError";
  }
}

export function assertCanDo(
  actor: Actor,
  action: Action,
  subject: Subject = {},
): void {
  if (!canDo(actor, action, subject)) throw new AccessDeniedError(action);
}

// ============ КОМАНДА АГЕНТСТВА ============

/** Действующие доступы: у владельца — все, у клиентских ролей — никаких. */
export function effectiveGrants(actor: Actor): StaffGrant[] {
  if (actor.role === "OWNER") return [...STAFF_GRANTS];
  if (!isAgency(actor)) return [];
  return STAFF_GRANTS.filter((grant) => (actor.grants ?? []).includes(grant));
}

/**
 * Старшинство ролей — только для управления командой, не для воронки:
 * кто кого может назначать и отключать.
 */
const STAFF_RANK: Partial<Record<UserRole, number>> = {
  OWNER: 3,
  HEAD: 2,
  ACCOUNT: 1,
  RECRUITER: 1,
};

/**
 * Может ли actor управлять сотрудником с такой ролью.
 *
 * Владелец — любым, кроме владельца. Доверенный сотрудник — своей ролью
 * и младшими: рекрутер, которому доверили команду, не отключит руководителя
 * подбора. Себя не меняет никто — иначе доверенное право стало бы способом
 * выдать себе недостающее, а владелец мог бы нечаянно отключить сам себя.
 */
export function canManageStaffMember(
  actor: Actor,
  target: { id?: string; role: UserRole },
): boolean {
  if (!canDo(actor, "staff.manage")) return false;
  if (target.id !== undefined && target.id === actor.id) return false;
  if (!(STAFF_ROLES as readonly UserRole[]).includes(target.role)) return false;
  if (actor.role === "OWNER") return true;
  return (
    target.role === actor.role ||
    (STAFF_RANK[target.role] ?? 0) < (STAFF_RANK[actor.role] ?? 0)
  );
}

/**
 * Можно ли назначить сотруднику эту роль и эти доступы. Раздать можно
 * только то, что есть у самого: иначе через доверенного сотрудника
 * получалось бы больше, чем выдал владелец.
 */
export function canAssignStaff(
  actor: Actor,
  target: { id?: string; role: UserRole },
  grants: readonly string[],
): boolean {
  if (!canManageStaffMember(actor, target)) return false;
  const own: readonly string[] = effectiveGrants(actor);
  return grants.every((grant) => own.includes(grant));
}

// ============ ФИЛЬТРЫ ВИДИМОСТИ ============
// Возвращают фрагмент `where` для Prisma. Подмешиваются в КАЖДУЮ выборку
// соответствующей сущности — прямых запросов в обход этих хелперов быть
// не должно.

/**
 * BR-3 (порог видимости) — ключевое правило продукта.
 *
 * Клиент видит Application тогда и только тогда, когда его текущий этап
 * помечен visibleToClient, ИЛИ кандидат когда-либо был представлен
 * (presentedAt != null). Второе условие нужно, чтобы отклонённый после
 * представления кандидат не исчезал из истории клиента.
 */
export function visibleApplicationsFilter(actor: Actor): object {
  if (isAgency(actor)) {
    return { organizationId: actor.organizationId };
  }

  return {
    organizationId: actor.organizationId,
    vacancy: {
      clientId: actor.clientId,
      // null — общая вакансия, ждёт, пока кто-то заберёт (см. ownHiring)
      ...(actor.role === "CLIENT_HIRING"
        ? { OR: [{ hiringManagerId: actor.id }, { hiringManagerId: null }] }
        : {}),
    },
    OR: [{ stage: { visibleToClient: true } }, { presentedAt: { not: null } }],
  };
}

/**
 * Клиент видит только свои вакансии; CLIENT_HIRING — где он заказчик,
 * плюс общие, у которых заказчик ещё не назначен (см. ownHiring).
 */
export function visibleVacanciesFilter(actor: Actor): object {
  if (isAgency(actor)) {
    return { organizationId: actor.organizationId };
  }

  return {
    organizationId: actor.organizationId,
    clientId: actor.clientId,
    ...(actor.role === "CLIENT_HIRING"
      ? { OR: [{ hiringManagerId: actor.id }, { hiringManagerId: null }] }
      : {}),
  };
}

/** Клиенту не отдаём комментарии с visibility: INTERNAL. */
export function visibleCommentsFilter(actor: Actor): object {
  if (isAgency(actor)) {
    return { organizationId: actor.organizationId };
  }

  return {
    organizationId: actor.organizationId,
    visibility: "SHARED" as const,
  };
}

/**
 * Этапы воронки, доступные актору.
 *
 * Клиент не должен видеть даже названия внутренних этапов: пустая
 * колонка «Лонг-лист» в его канбане — это уже утечка того, как устроена
 * работа агентства. Фильтр живёт здесь, а не в компоненте доски (BR-3).
 */
export function filterVisibleStages<T extends { visibleToClient: boolean }>(
  actor: Actor,
  stages: T[],
): T[] {
  if (isAgency(actor)) return stages;
  return stages.filter((s) => s.visibleToClient);
}

/**
 * Обнуляет внутренние поля для клиентских ролей.
 *
 * Отрисовать поле в разметке — не то же самое, что не отдать его.
 * Данные страницы уходят в браузер целиком, и внутренняя заметка,
 * не показанная на экране, всё равно лежит в ответе сервера
 * и читается в инструментах разработчика.
 *
 * Поэтому чистка делается здесь, в слое доступа, а не полагается
 * на то, что компонент «просто не выводит» лишнее.
 */
export function stripInternal<T extends object>(
  actor: Actor,
  entity: T,
  fields: (keyof T)[],
): T {
  if (isAgency(actor)) return entity;

  const cleaned = { ...entity };
  for (const field of fields) {
    cleaned[field] = null as T[keyof T];
  }
  return cleaned;
}

/**
 * Типы вложений, которые клиент не получает никогда.
 *
 * Исходный файл резюме - это произвольный документ, составленный
 * кандидатом, и в нём бывает всё: домашний адрес, дата рождения,
 * семейное положение, фотография, иногда сведения о здоровье.
 * Клиенту для рассмотрения кандидата ничего этого не нужно, он
 * работает с профилем из структурированных полей карточки.
 *
 * Запрет жёсткий и не зависит от пометки видимости. Отметка -
 * это решение человека, а человек ошибается: достаточно один раз
 * поставить резюме «общим», и избыточные данные уедут клиенту
 * навсегда. Здесь же ошибиться нельзя по построению.
 *
 * Требование P0-5 юридического пакета и мера против угрозы T16
 * модели угроз.
 */
export const ATTACHMENT_KINDS_HIDDEN_FROM_CLIENT = ["RESUME"] as const;

/**
 * Вложения, доступные актору.
 *
 * Клиенту - только помеченные общими, и никогда исходное резюме.
 */
export function visibleAttachmentsFilter(actor: Actor): object {
  if (isAgency(actor)) {
    return { organizationId: actor.organizationId };
  }

  return {
    organizationId: actor.organizationId,
    visibility: "SHARED" as const,
    kind: { notIn: [...ATTACHMENT_KINDS_HIDDEN_FROM_CLIENT] },
  };
}
