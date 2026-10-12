import { assertCanDo, canDo, type Actor } from "@/lib/access";
import { prisma } from "@/lib/db/prisma";
import { createComment } from "@/lib/services/comments";
import { isSourcingLead } from "@/lib/sourcing";

/**
 * Комментарии команды под кандидатом.
 *
 * Сотрудник агентства пишет под карточкой кандидата, и по умолчанию его
 * комментарий видят только сотрудники. Галочка «Показать работодателю»
 * открывает комментарий компании, но только в рамках конкретной вакансии:
 * работодатель видит кандидата лишь как отклик на свою вакансию (BR-3), так
 * что «показать всем работодателям сразу» было бы показом чужим клиентам.
 *
 * Три случая, и они разведены намеренно:
 *  - без вакансии: заметка по кандидату в целом, всегда внутренняя;
 *  - с вакансией, без галочки: внутренний комментарий в треде отклика;
 *  - с вакансией и галочкой: общий комментарий в треде отклика, его видит
 *    и компания-заказчик этой вакансии (ровно так же, как на странице отклика).
 *
 * Сорсинг-лиду (найден без согласия, lib/services/sourcing.ts) заметки не
 * сохраняются: юрист запретил хранить о нём что-либо кроме имени, контактов
 * и ссылки на профиль.
 */

export class CandidateNoteError extends Error {}

export type FeedItem = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "SHARED";
  createdAt: Date;
  author: { id: string; fullName: string; role: string } | null;
  /** null: заметка по кандидату в целом; иначе отклик и вакансия, где написано. */
  application: { id: string; vacancyId: string; vacancyLabel: string } | null;
};

export async function listCandidateFeed(actor: Actor, candidateId: string): Promise<FeedItem[]> {
  assertCanDo(actor, "application.viewInternal");

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!candidate) return [];

  const comments = await prisma.comment.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: [{ candidateId }, { application: { candidateId } }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      body: true,
      visibility: true,
      createdAt: true,
      authorId: true,
      application: {
        select: { id: true, vacancyId: true, vacancy: { select: { number: true, title: true } } },
      },
    },
  });

  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, fullName: true, role: true },
  });
  const byId = new Map(authors.map((a) => [a.id, a]));

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    visibility: c.visibility,
    createdAt: c.createdAt,
    author: byId.get(c.authorId) ?? null,
    application: c.application
      ? {
          id: c.application.id,
          vacancyId: c.application.vacancyId,
          vacancyLabel: `№${c.application.vacancy.number} ${c.application.vacancy.title}`,
        }
      : null,
  }));
}

export async function createCandidateComment(
  actor: Actor,
  params: {
    candidateId: string;
    body: string;
    /** Отклик (вакансия), к которому относится комментарий; без него заметка по кандидату в целом. */
    applicationId?: string;
    /** Показать работодателю; допустимо только вместе с откликом. */
    shareWithEmployer?: boolean;
  },
): Promise<{ id: string }> {
  assertCanDo(actor, "application.viewInternal");

  const body = params.body.trim();
  if (!body) throw new CandidateNoteError("Пустой комментарий");
  if (body.length > 4000) throw new CandidateNoteError("Комментарий длиннее 4000 знаков");

  const candidate = await prisma.candidate.findFirst({
    where: { id: params.candidateId, organizationId: actor.organizationId },
    select: { id: true, sourcedAt: true, consentStatus: true },
  });
  if (!candidate) throw new CandidateNoteError("Кандидат не найден");

  if (!params.applicationId) {
    if (params.shareWithEmployer) {
      throw new CandidateNoteError("Чтобы показать комментарий работодателю, выберите вакансию");
    }
    if (isSourcingLead(candidate)) {
      throw new CandidateNoteError(
        "Пока кандидат не дал согласие, заметки о нём не сохраняются: можно хранить только имя, контакты и ссылку на профиль.",
      );
    }
    if (!canDo(actor, "comment.writeInternal")) {
      throw new CandidateNoteError("Недостаточно прав для внутренних комментариев");
    }
    const note = await prisma.comment.create({
      data: {
        organizationId: actor.organizationId,
        candidateId: candidate.id,
        body,
        visibility: "INTERNAL",
        authorId: actor.id,
      },
      select: { id: true },
    });
    return note;
  }

  // Отклик должен принадлежать этому кандидату: иначе комментарий лёг бы в чужой тред
  const application = await prisma.application.findFirst({
    where: { id: params.applicationId, candidateId: candidate.id, organizationId: actor.organizationId },
    select: { id: true, vacancy: { select: { clientId: true } } },
  });
  if (!application) throw new CandidateNoteError("Эта вакансия не относится к кандидату");

  const visibility = params.shareWithEmployer ? "SHARED" : "INTERNAL";
  const action = visibility === "INTERNAL" ? "comment.writeInternal" : "comment.writeShared";
  if (!canDo(actor, action, { clientId: application.vacancy.clientId })) {
    throw new CandidateNoteError("Недостаточно прав для этого комментария");
  }

  const created = await createComment(actor, {
    applicationId: application.id,
    body,
    visibility,
  });
  return { id: created.id };
}
