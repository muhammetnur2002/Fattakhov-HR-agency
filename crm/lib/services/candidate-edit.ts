import { assertCanDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { assertFieldsAllowed } from "@/lib/services/sourcing";
import { normalizePhone, type CandidateProfileInput } from "@/lib/validation/candidate";

/**
 * Правка профиля кандидата сотрудником агентства.
 *
 * Прежний `updateCandidateProfile` по пустому полю ничего не делает (пустое
 * из формы превращается в «не менять»), так что стереть значение им нельзя.
 * Для формы правки это неверно: человек очистил поле, значит поле должно
 * очиститься. Здесь пустое стирает.
 *
 * Правила режима «сорсинг-лид» (lib/services/sourcing.ts) соблюдаются: пока у
 * кандидата нет согласия, добавить можно только имя, контакты и ссылку на
 * профиль; остальное сервис отклоняет с объяснением.
 */

export class CandidateEditError extends Error {}

export const PROFILE_FIELD_LABELS = {
  fullName: "Имя",
  phone: "Телефон",
  email: "Почта",
  telegram: "Telegram",
  city: "Город",
  currentPosition: "Должность",
  currentCompany: "Компания",
  totalExperienceYears: "Опыт",
  education: "Образование",
  salaryExpectation: "Зарплатные ожидания",
  summary: "Заметка рекрутёра",
  skills: "Навыки",
} as const;

type ProfileField = keyof typeof PROFILE_FIELD_LABELS;
const FIELDS = Object.keys(PROFILE_FIELD_LABELS) as ProfileField[];

function comparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

export function describeChangedProfileFields(changed: ProfileField[]): string[] {
  return changed.map((f) => PROFILE_FIELD_LABELS[f]);
}

export async function editCandidateProfile(
  actor: Actor,
  candidateId: string,
  input: CandidateProfileInput,
): Promise<{ changed: ProfileField[] }> {
  assertCanDo(actor, "application.viewInternal");

  const before = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: {
      sourcedAt: true,
      consentStatus: true,
      ...(Object.fromEntries(FIELDS.map((f) => [f, true])) as Record<ProfileField, true>),
    },
  });
  if (!before) throw new CandidateEditError("Кандидат не найден");

  const next = {
    fullName: input.fullName,
    phone: input.phone ? (normalizePhone(input.phone) ?? input.phone) : null,
    email: input.email ? input.email.toLowerCase() : null,
    telegram: input.telegram ?? null,
    city: input.city ?? null,
    currentPosition: input.currentPosition ?? null,
    currentCompany: input.currentCompany ?? null,
    totalExperienceYears: input.totalExperienceYears ?? null,
    education: input.education ?? null,
    salaryExpectation: input.salaryExpectation ?? null,
    summary: input.summary ?? null,
    skills: input.skills,
  };

  // Режим сорсинг-лида смотрит только на заполненное: пустое поле его не нарушает
  assertFieldsAllowed(before, next);

  // Телефон сравниваем в нормализованном виде: в базе он мог лечь как «+7900…»,
  // а форма сохраняет цифрами. Иначе каждое сохранение «меняло» бы телефон
  const stored = before as Record<string, unknown>;
  const storedPhone = typeof stored.phone === "string" ? stored.phone : null;
  const changed = FIELDS.filter((f) =>
    f === "phone"
      ? comparable(storedPhone ? (normalizePhone(storedPhone) ?? storedPhone) : null) !== comparable(next.phone)
      : comparable(stored[f]) !== comparable(next[f]),
  );
  if (changed.length === 0) return { changed };

  await prisma.candidate.update({ where: { id: candidateId }, data: next });
  await prisma.activityLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityType: "Candidate",
      entityId: candidateId,
      action: "profile_edited",
      // Только названия полей: значения в журнал не пишем, там контакты
      diff: { fields: changed },
    },
  });

  return { changed };
}
