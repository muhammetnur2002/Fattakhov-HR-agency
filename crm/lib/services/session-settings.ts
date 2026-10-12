import { assertCanDo, type Actor } from "@/lib/access";
import {
  parseSessionMinutes,
  readSessionLimits,
  type SessionLimits,
} from "@/lib/auth/session-policy";
import { prismaRaw as db } from "@/lib/db/prisma";

export class SessionSettingsError extends Error {}

/** Пределы сессии организации (минуты; null — умолчание). */
export async function getSessionLimits(organizationId: string): Promise<SessionLimits> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  return readSessionLimits(organization?.settings);
}

/** Пустое значение — «по умолчанию»; всё остальное обязано быть в границах. */
function parseChoice(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "" || value === "default") return null;
  const minutes = parseSessionMinutes(value);
  if (minutes === null) {
    throw new SessionSettingsError(`${label}: срок от 20 минут до 30 суток`);
  }
  return minutes;
}

/**
 * Предел сессии — решение владельца: чем короче, тем меньше окно у украденной
 * cookie (lib/auth/session-policy.ts), но тем чаще вход. Действует на ВСЕ
 * сессии сразу, в том числе уже выданные: возраст считается от входа.
 */
export async function setSessionLimits(
  actor: Actor,
  input: { agency: unknown; client: unknown },
): Promise<SessionLimits> {
  assertCanDo(actor, "org.settings");

  const agency = parseChoice(input.agency, "Сотрудники агентства");
  const client = parseChoice(input.client, "Клиенты");

  const current = await db.organization.findUnique({
    where: { id: actor.organizationId },
    select: { settings: true },
  });
  const settings: Record<string, unknown> =
    typeof current?.settings === "object" && current.settings !== null
      ? { ...(current.settings as Record<string, unknown>) }
      : {};

  if (agency === null) delete settings.sessionMinutesAgency;
  else settings.sessionMinutesAgency = agency;
  if (client === null) delete settings.sessionMinutesClient;
  else settings.sessionMinutesClient = client;

  await db.organization.update({
    where: { id: actor.organizationId },
    data: { settings: settings as never },
  });
  return { agency, client };
}
