import {
  canDo,
  isAgency,
  visibleApplicationsFilter,
  visibleCommentsFilter,
  visibleVacanciesFilter,
  type Actor,
} from "@/lib/access";
import { link } from "@/lib/notifications/links";
import { prisma } from "@/lib/db/prisma";
import type { CommentVisibility } from "@/lib/generated/prisma/enums";
import { truncateBody } from "@/lib/notifications/events";
import { notify } from "@/lib/notifications/notify";
import { threadRecipients } from "@/lib/notifications/recipients";

export class CommentError extends Error {}

export type CommentAuthor = {
  id: string;
  fullName: string;
  role: string;
  position: string | null;
};

/**
 * Комментарии по кандидату.
 *
 * Единственная выборка треда для обоих кабинетов: разницу делает
 * visibleCommentsFilter (BR-3), а не отдельные запросы. Клиенту
 * комментарии с visibility: INTERNAL не отдаются никогда — это самый
 * вероятный способ случайно показать ему внутреннюю кухню.
 */
export async function listApplicationComments(
  actor: Actor,
  applicationId: string,
) {
  // Проверяем доступ к самой заявке: без этого по чужому id можно было бы
  // вытащить переписку, даже не открывая карточку
  const application = await prisma.application.findFirst({
    where: { id: applicationId, ...visibleApplicationsFilter(actor) },
    select: { id: true },
  });
  if (!application) return null;

  const comments = await prisma.comment.findMany({
    where: { applicationId, ...visibleCommentsFilter(actor) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      visibility: true,
      parentId: true,
      mentionedUserIds: true,
      authorId: true,
      editedAt: true,
      createdAt: true,
      readBy: { where: { userId: actor.id }, select: { userId: true } },
    },
  });

  return attachAuthors(comments);
}

/** Обсуждение по вакансии в целом — вопросы по брифу, а не по кандидату. */
export async function listVacancyComments(actor: Actor, vacancyId: string) {
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, ...visibleVacanciesFilter(actor) },
    select: { id: true },
  });
  if (!vacancy) return null;

  const comments = await prisma.comment.findMany({
    where: { vacancyId, ...visibleCommentsFilter(actor) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      visibility: true,
      parentId: true,
      mentionedUserIds: true,
      authorId: true,
      editedAt: true,
      createdAt: true,
      readBy: { where: { userId: actor.id }, select: { userId: true } },
    },
  });

  return attachAuthors(comments);
}

export type ConversationSummary = {
  type: "application" | "vacancy";
  id: string;
  title: string;
  subtitle: string;
  lastMessage: { body: string; authorName: string; createdAt: Date };
  unreadCount: number;
};

/**
 * Счётчик для пункта «Сообщения» в меню — лёгкий запрос без карточек
 * переписок и имён авторов, которые listConversations собирает для
 * самого списка и здесь не нужны.
 */
export async function countUnreadConversations(actor: Actor): Promise<number> {
  return prisma.comment.count({
    where: {
      ...visibleCommentsFilter(actor),
      authorId: { not: actor.id },
      readBy: { none: { userId: actor.id } },
      OR: [
        { applicationId: { not: null }, application: visibleApplicationsFilter(actor) },
        { vacancyId: { not: null }, vacancy: visibleVacanciesFilter(actor) },
      ],
    },
  });
}

/**
 * «Сообщения» — единый список переписок вместо того, чтобы проверять
 * обсуждение на каждой карточке кандидата и вакансии по отдельности.
 *
 * Открывает то же самое, что уже показывает вкладка «Обсуждение» на
 * странице кандидата/вакансии — здесь только сводка, кто последний
 * писал и сколько непрочитано, доступ считает та же visibleCommentsFilter,
 * что и у самого треда.
 */
export async function listConversations(
  actor: Actor,
): Promise<ConversationSummary[]> {
  const [latestByApplication, latestByVacancy] = await Promise.all([
    prisma.comment.findMany({
      where: {
        applicationId: { not: null },
        ...visibleCommentsFilter(actor),
        application: visibleApplicationsFilter(actor),
      },
      orderBy: { createdAt: "desc" },
      distinct: ["applicationId"],
      select: { applicationId: true, body: true, authorId: true, createdAt: true },
    }),
    prisma.comment.findMany({
      where: {
        vacancyId: { not: null },
        ...visibleCommentsFilter(actor),
        vacancy: visibleVacanciesFilter(actor),
      },
      orderBy: { createdAt: "desc" },
      distinct: ["vacancyId"],
      select: { vacancyId: true, body: true, authorId: true, createdAt: true },
    }),
  ]);

  const applicationIds = latestByApplication.map((c) => c.applicationId!);
  const vacancyIds = latestByVacancy.map((c) => c.vacancyId!);

  const [applications, vacancies, authors, unread] = await Promise.all([
    prisma.application.findMany({
      where: { id: { in: applicationIds } },
      select: {
        id: true,
        candidate: { select: { fullName: true } },
        vacancy: {
          select: { number: true, title: true, client: { select: { name: true } } },
        },
      },
    }),
    prisma.vacancy.findMany({
      where: { id: { in: vacancyIds } },
      select: { id: true, number: true, title: true, client: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: {
        id: { in: [...latestByApplication, ...latestByVacancy].map((c) => c.authorId) },
      },
      select: { id: true, fullName: true },
    }),
    unreadCounts(actor, applicationIds, vacancyIds),
  ]);

  const applicationById = new Map(applications.map((a) => [a.id, a]));
  const vacancyById = new Map(vacancies.map((v) => [v.id, v]));
  const authorById = new Map(authors.map((u) => [u.id, u.fullName]));

  const fromApplications: ConversationSummary[] = latestByApplication
    .map((c) => {
      const application = applicationById.get(c.applicationId!);
      if (!application) return null;
      return {
        type: "application" as const,
        id: application.id,
        title: application.candidate.fullName,
        subtitle: `№${application.vacancy.number} ${application.vacancy.title} · ${application.vacancy.client.name}`,
        lastMessage: {
          body: c.body,
          authorName: authorById.get(c.authorId) ?? "Коллега",
          createdAt: c.createdAt,
        },
        unreadCount: unread.get(application.id) ?? 0,
      };
    })
    .filter((c) => c !== null);

  const fromVacancies: ConversationSummary[] = latestByVacancy
    .map((c) => {
      const vacancy = vacancyById.get(c.vacancyId!);
      if (!vacancy) return null;
      return {
        type: "vacancy" as const,
        id: vacancy.id,
        title: `№${vacancy.number} ${vacancy.title}`,
        subtitle: vacancy.client.name,
        lastMessage: {
          body: c.body,
          authorName: authorById.get(c.authorId) ?? "Коллега",
          createdAt: c.createdAt,
        },
        unreadCount: unread.get(vacancy.id) ?? 0,
      };
    })
    .filter((c) => c !== null);

  return [...fromApplications, ...fromVacancies].sort(
    (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime(),
  );
}

/** Непрочитанное по каждой переписке — applicationId и vacancyId делят одну карту, id не пересекаются между моделями. */
async function unreadCounts(
  actor: Actor,
  applicationIds: string[],
  vacancyIds: string[],
): Promise<Map<string, number>> {
  if (applicationIds.length === 0 && vacancyIds.length === 0) return new Map();

  const comments = await prisma.comment.findMany({
    where: {
      OR: [
        { applicationId: { in: applicationIds } },
        { vacancyId: { in: vacancyIds } },
      ],
      ...visibleCommentsFilter(actor),
      authorId: { not: actor.id },
      readBy: { none: { userId: actor.id } },
    },
    select: { applicationId: true, vacancyId: true },
  });

  const counts = new Map<string, number>();
  for (const c of comments) {
    const key = (c.applicationId ?? c.vacancyId)!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

type RawComment = {
  id: string;
  body: string;
  visibility: CommentVisibility;
  parentId: string | null;
  mentionedUserIds: string[];
  authorId: string;
  editedAt: Date | null;
  createdAt: Date;
  readBy: { userId: string }[];
};

/** Подмешивает авторов одним запросом вместо джойна на каждый комментарий. */
async function attachAuthors(comments: RawComment[]) {
  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, fullName: true, role: true, position: true },
  });
  const byId = new Map(authors.map((a) => [a.id, a]));

  return comments.map((c) => ({
    ...c,
    isRead: c.readBy.length > 0,
    author: byId.get(c.authorId) ?? null,
  }));
}

/**
 * Кого можно упомянуть.
 *
 * Клиент видит только своих коллег и команду агентства по этой вакансии;
 * сотрудников других клиентов — нет.
 */
export async function listMentionableUsers(
  actor: Actor,
  params: { clientId: string; vacancyId?: string },
) {
  const agencySide = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      clientId: null,
      isActive: true,
    },
    select: { id: true, fullName: true, role: true, position: true },
    orderBy: { fullName: "asc" },
  });

  const clientSide = await prisma.user.findMany({
    where: {
      organizationId: actor.organizationId,
      clientId: params.clientId,
      isActive: true,
    },
    select: { id: true, fullName: true, role: true, position: true },
    orderBy: { fullName: "asc" },
  });

  return [...agencySide, ...clientSide];
}

export async function createComment(
  actor: Actor,
  params: {
    applicationId?: string;
    vacancyId?: string;
    body: string;
    visibility: CommentVisibility;
    parentId?: string;
    mentionedUserIds?: string[];
  },
) {
  const body = params.body.trim();
  if (!body) throw new CommentError("Пустой комментарий");
  if (!params.applicationId && !params.vacancyId) {
    throw new CommentError("Комментарий не привязан ни к кандидату, ни к вакансии");
  }

  // Внутренний комментарий может написать только агентство. Проверка
  // здесь, а не только в интерфейсе: иначе форму можно подделать
  if (params.visibility === "INTERNAL" && !canDo(actor, "comment.writeInternal")) {
    throw new CommentError("Внутренние комментарии доступны только агентству");
  }
  // Право на общий комментарий у клиента зависит от его компании,
  // и полную проверку с subject делает вызывающий. Здесь — отсечка
  // по роли как таковой: наблюдатель не пишет вообще нигде. Спрашиваем
  // об этом матрицу, а не имя роли: появится ещё одна читающая роль —
  // и она попадёт сюда сама
  if (
    params.visibility === "SHARED" &&
    !isAgency(actor) &&
    !canDo(actor, "comment.writeShared", { clientId: actor.clientId })
  ) {
    throw new CommentError("Наблюдатель не может писать комментарии");
  }

  // Ответ должен лежать в том же треде, иначе можно подвесить реплику
  // к чужому кандидату
  if (params.parentId) {
    const parent = await prisma.comment.findFirst({
      where: {
        id: params.parentId,
        organizationId: actor.organizationId,
        ...(params.applicationId
          ? { applicationId: params.applicationId }
          : { vacancyId: params.vacancyId }),
      },
      select: { id: true, visibility: true },
    });
    if (!parent) throw new CommentError("Ветка обсуждения не найдена");

    // Ответ на внутренний комментарий не может быть общим: иначе
    // контекст уедет клиенту без исходного сообщения
    if (parent.visibility === "INTERNAL" && params.visibility === "SHARED") {
      throw new CommentError(
        "Ответ во внутренней ветке не может быть виден клиенту",
      );
    }
  }

  const comment = await prisma.comment.create({
    data: {
      organizationId: actor.organizationId,
      applicationId: params.applicationId,
      vacancyId: params.vacancyId,
      body,
      visibility: params.visibility,
      parentId: params.parentId,
      mentionedUserIds: params.mentionedUserIds ?? [],
      authorId: actor.id,
    },
    select: { id: true },
  });

  await notifyAboutComment(actor, { ...params, body }, comment.id);

  return comment;
}

/**
 * Уведомление о комментарии.
 *
 * Внутренний комментарий уходит только агентству: иначе заметка о клиенте
 * прилетит клиенту же в виде уведомления, и порог видимости (BR-3)
 * обойдётся не через интерфейс, а через почту.
 */
async function notifyAboutComment(
  actor: Actor,
  params: {
    applicationId?: string;
    vacancyId?: string;
    body: string;
    visibility: CommentVisibility;
  },
  commentId: string,
): Promise<void> {
  const vacancyId = params.vacancyId
    ? params.vacancyId
    : (
        await prisma.application.findFirst({
          where: { id: params.applicationId },
          select: { vacancyId: true },
        })
      )?.vacancyId;

  if (!vacancyId) return;

  const author = await prisma.user.findFirst({
    where: { id: actor.id },
    select: { fullName: true },
  });

  const recipients = await threadRecipients({
    vacancyId,
    internal: params.visibility === "INTERNAL",
    exceptUserId: actor.id,
  });

  // Тред живёт и на карточке кандидата, и на карточке вакансии,
  // а пишут в него обе стороны — адрес выбирается под получателя
  const target = params.applicationId
    ? link.application(params.applicationId)
    : link.vacancy(vacancyId);

  await notify({
    organizationId: actor.organizationId,
    userIds: recipients,
    event: "NEW_COMMENT",
    title: `${author?.fullName ?? "Коллега"} написал в обсуждении`,
    body: truncateBody(params.body, 200),
    linkUrl: target,
    // Переписка в одном треде схлопывается: десять реплик подряд —
    // не десять сообщений в Telegram
    groupKey: params.applicationId ?? vacancyId,
    payload: { commentId },
  });
}

/** Автор может править свой комментарий. Чужие — нет, даже владелец. */
export async function editComment(
  actor: Actor,
  commentId: string,
  body: string,
) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, organizationId: actor.organizationId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw new CommentError("Комментарий не найден");
  if (comment.authorId !== actor.id) {
    throw new CommentError("Править можно только свои комментарии");
  }

  return prisma.comment.update({
    where: { id: commentId },
    data: { body: body.trim(), editedAt: new Date() },
    select: { id: true },
  });
}

export async function deleteComment(actor: Actor, commentId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, organizationId: actor.organizationId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw new CommentError("Комментарий не найден");

  // Автор удаляет своё по факту авторства, чужое — по праву
  const canDelete =
    comment.authorId === actor.id || canDo(actor, "comment.deleteAny");
  if (!canDelete) throw new CommentError("Удалить может автор или владелец");

  // Мягкое удаление (BR-26): переписка это история, физически её не трём
  await prisma.comment.delete({ where: { id: commentId } });
}

/** Отметка прочтения — для счётчиков непрочитанного. */
export async function markCommentsRead(actor: Actor, commentIds: string[]) {
  if (commentIds.length === 0) return;

  await prisma.commentRead.createMany({
    data: commentIds.map((commentId) => ({ commentId, userId: actor.id })),
    skipDuplicates: true,
  });
}

/** Сколько непрочитанных по заявке — для бейджа на карточке в канбане. */
export async function countUnread(
  actor: Actor,
  applicationIds: string[],
): Promise<Map<string, number>> {
  if (applicationIds.length === 0) return new Map();

  const comments = await prisma.comment.findMany({
    where: {
      applicationId: { in: applicationIds },
      ...visibleCommentsFilter(actor),
      authorId: { not: actor.id },
      readBy: { none: { userId: actor.id } },
    },
    select: { applicationId: true },
  });

  const counts = new Map<string, number>();
  for (const c of comments) {
    if (!c.applicationId) continue;
    counts.set(c.applicationId, (counts.get(c.applicationId) ?? 0) + 1);
  }
  return counts;
}
