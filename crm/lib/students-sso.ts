import { createHmac, randomBytes } from "node:crypto";

import type { StaffGrant } from "@/lib/access";

/**
 * Вход из CRM в панель студенческой платформы без второго пароля.
 *
 * CRM выпускает короткий подписанный билет: кто входит и какие разделы
 * ему выданы. Студенческая платформа проверяет подпись общим секретом,
 * гасит билет (второй раз по нему не войти) и открывает сессию на рабочий
 * день. Отдельных HR-учёток там заводить не нужно, а отключённый в CRM
 * сотрудник нового билета не получит.
 *
 * Формат — base64url(JSON).base64url(HMAC-SHA256). Проверяющая сторона —
 * lib/security/staff-ticket.ts в студенческой платформе; менять формат
 * можно только в обоих местах разом.
 */

/** Билет живёт минуту: его хватает на переход, но не на пересылку. */
export const STUDENTS_TICKET_TTL_SECONDS = 60;

export type StudentsPermission = "moderation" | "students" | "pilot";

const PERMISSION_BY_GRANT: Partial<Record<StaffGrant, StudentsPermission>> = {
  "students.moderation": "moderation",
  "students.study": "students",
  "students.pilot": "pilot",
};

/** Разделы студенческой платформы из доступов сотрудника CRM. */
export function studentsPermissions(grants: readonly StaffGrant[]): StudentsPermission[] {
  const out: StudentsPermission[] = [];
  for (const grant of grants) {
    const permission = PERMISSION_BY_GRANT[grant];
    if (permission && !out.includes(permission)) out.push(permission);
  }
  return out;
}

/** Секрет из окружения; null — вход не настроен. */
export function studentsSsoSecret(): string | null {
  const raw = process.env.STUDENTS_SSO_SECRET?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

/** Билет сотрудника — открывает панель HR с выданными разделами. */
export type StaffTicket = {
  v: 1;
  iss: "fattakhov-crm";
  aud: "fattakhov-students";
  kind: "staff";
  sub: string;
  email: string;
  name: string;
  position: string | null;
  permissions: StudentsPermission[];
  iat: number;
  exp: number;
  /** Разовый номер: студенческая платформа не пустит по нему второй раз. */
  jti: string;
};

/**
 * Билет клиента CRM — открывает кабинет компании, привязанной к этому
 * клиенту (Employer.crmClientId), без модерации: агентство уже проверило
 * клиента договором, как и у вакансий, которые оно заводит из CRM само.
 */
export type ClientTicket = {
  v: 1;
  iss: "fattakhov-crm";
  aud: "fattakhov-students";
  kind: "client";
  sub: string;
  crmClientId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  iat: number;
  exp: number;
  jti: string;
};

export type StudentsTicket = StaffTicket | ClientTicket;

function sign(payload: StudentsTicket, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function issueStudentsTicket(
  input: {
    userId: string;
    email: string;
    name: string;
    position: string | null;
    permissions: StudentsPermission[];
  },
  secret: string,
  now: number = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  return sign(
    {
      v: 1,
      iss: "fattakhov-crm",
      aud: "fattakhov-students",
      kind: "staff",
      sub: input.userId,
      email: input.email,
      name: input.name,
      position: input.position,
      permissions: input.permissions,
      iat,
      exp: iat + STUDENTS_TICKET_TTL_SECONDS,
      jti: randomBytes(16).toString("base64url"),
    },
    secret,
  );
}

/** Билет клиента — вход в кабинет компании на студенческой платформе. */
export function issueClientTicket(
  input: {
    userId: string;
    crmClientId: string;
    companyName: string;
    contactName: string;
    contactEmail: string;
  },
  secret: string,
  now: number = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  return sign(
    {
      v: 1,
      iss: "fattakhov-crm",
      aud: "fattakhov-students",
      kind: "client",
      sub: input.userId,
      crmClientId: input.crmClientId,
      companyName: input.companyName,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      iat,
      exp: iat + STUDENTS_TICKET_TTL_SECONDS,
      jti: randomBytes(16).toString("base64url"),
    },
    secret,
  );
}
