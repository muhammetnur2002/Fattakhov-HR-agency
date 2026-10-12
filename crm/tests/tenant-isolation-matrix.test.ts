/**
 * Сквозная проверка изоляции клиентов: чужой клиент по прямому идентификатору.
 *
 * Атакующий (администратор «Технопарка») знает или подбирает идентификаторы
 * объектов «Звёздочки» и пробует каждый способ, которым кабинет читает или
 * меняет объект по id: вакансия, заявка, кандидат, клиент, комментарии,
 * собеседования, личные сообщения, договор, счёт, приглашение. Ожидание
 * одно: ничего не возвращается и ничего не меняется (BR-28).
 *
 * Защита от вхолостую пройденного теста:
 *  - тот же вызов от владельца объекта («Звёздочка») обязан вернуть данные;
 *  - перед и после каждой атаки снимается слепок строк жертвы, и он обязан
 *    совпасть: «отказали, но успели записать» тоже провал.
 *
 * Данные берутся из seed (npm run db:seed): тест ничего в них не создаёт,
 * кроме приглашения, которое удаляет за собой.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/access";
import { inviteTokenColumns } from "@/lib/auth/invite-token";
import { prismaRaw as db } from "@/lib/db/prisma";
import { confirmAgreement, terminateAgreement } from "@/lib/services/agreements";
import {
  getApplication,
  moveStage,
  rejectApplication,
  setClientDecision,
  undoClientRejection,
} from "@/lib/services/applications";
import { getCandidate } from "@/lib/services/candidates";
import { getClient, revokeClientInvitation, updateClient } from "@/lib/services/clients";
import {
  createComment,
  deleteComment,
  editComment,
  listApplicationComments,
  listVacancyComments,
} from "@/lib/services/comments";
import {
  listApplicationInterviews,
  submitFeedback,
  transitionInterview,
} from "@/lib/services/interviews";
import { listInvoices, transitionInvoice } from "@/lib/services/invoices";
import {
  getCorrespondent,
  listDirectMessages,
  sendDirectMessage,
} from "@/lib/services/messages";
import { getVacancy } from "@/lib/services/vacancies";

const ORG = "org_fattakhov";
const VICTIM_CLIENT = "cl_starfish";

/** Владелец объектов: клиент «Звёздочка». Нужен для контрольных вызовов. */
const owner: Actor = { id: "usr_cl_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: VICTIM_CLIENT };
/** Сотрудник агентства: ему карточка кандидата положена (клиентской роли нет). */
const agencyStaff: Actor = { id: "usr_rec1", organizationId: ORG, role: "RECRUITER", clientId: null };
/** Чужой клиент: «Технопарк». */
const attacker: Actor = { id: "usr_cl2_admin", organizationId: ORG, role: "CLIENT_ADMIN", clientId: "cl_technopark" };

type Victim = {
  vacancyId: string;
  applicationId: string;
  candidateId: string;
  commentId: string;
  interviewId: string;
  agreementId: string;
  invoiceId: string;
  invitationId: string;
  otherStageId: string;
};

let v: Victim;

beforeAll(async () => {
  const vacancy = await db.vacancy.findFirstOrThrow({ where: { clientId: VICTIM_CLIENT }, select: { id: true } });
  // Заявка, видимая клиенту: иначе контрольный вызов владельца вернул бы пусто
  const application = await db.application.findFirstOrThrow({
    where: { vacancy: { clientId: VICTIM_CLIENT }, OR: [{ presentedAt: { not: null } }, { stage: { visibleToClient: true } }] },
    select: { id: true, candidateId: true, vacancyId: true, stageId: true },
  });
  const comment = await db.comment.findFirst({
    where: { OR: [{ vacancy: { clientId: VICTIM_CLIENT } }, { application: { vacancy: { clientId: VICTIM_CLIENT } } }] },
    select: { id: true },
  });
  const interview = await db.interview.findFirst({
    where: { application: { vacancy: { clientId: VICTIM_CLIENT } } },
    select: { id: true },
  });
  const agreement = await db.agreement.findFirst({ where: { clientId: VICTIM_CLIENT }, select: { id: true } });
  const invoice = await db.invoice.findFirst({ where: { clientId: VICTIM_CLIENT }, select: { id: true } });
  const otherStage = await db.pipelineStage.findFirst({
    where: { vacancyId: application.vacancyId, id: { not: application.stageId } },
    select: { id: true },
  });

  // Ни одна из этих находок не должна пропасть из seed молча, иначе проверка пройдёт вхолостую
  expect(comment, "в seed нет комментария у «Звёздочки»").toBeTruthy();
  expect(interview, "в seed нет собеседования у «Звёздочки»").toBeTruthy();
  expect(agreement, "в seed нет договора у «Звёздочки»").toBeTruthy();
  expect(invoice, "в seed нет счёта у «Звёздочки»").toBeTruthy();
  expect(otherStage, "у вакансии одна стадия").toBeTruthy();

  // Приглашение в команду клиента: токен только в виде хеша, как у настоящих
  const invitation = await db.invitation.create({
    data: {
      organizationId: ORG,
      clientId: VICTIM_CLIENT,
      email: "test-isolation-invite@example.com",
      role: "CLIENT_HIRING",
      expiresAt: new Date(Date.now() + 86_400_000),
      ...inviteTokenColumns("isolation-test-token-0123456789"),
    },
    select: { id: true },
  });

  v = {
    vacancyId: vacancy.id,
    applicationId: application.id,
    candidateId: application.candidateId,
    commentId: comment!.id,
    interviewId: interview!.id,
    agreementId: agreement!.id,
    invoiceId: invoice!.id,
    invitationId: invitation.id,
    otherStageId: otherStage!.id,
  };
});

afterAll(async () => {
  await db.invitation.deleteMany({ where: { email: "test-isolation-invite@example.com" } });
  await db.$disconnect();
});

/** Слепок всего, что атакующий не должен был задеть. Даты и числа попадают в строку как есть. */
async function snapshot(): Promise<Record<string, string>> {
  const [vacancy, application, client, comments, interview, agreement, invoice, invitation, messages, candidate] =
    await Promise.all([
      db.vacancy.findUnique({ where: { id: v.vacancyId } }),
      db.application.findUnique({ where: { id: v.applicationId } }),
      db.client.findUnique({ where: { id: VICTIM_CLIENT } }),
      db.comment.findMany({ orderBy: { id: "asc" } }),
      db.interview.findUnique({ where: { id: v.interviewId } }),
      db.agreement.findUnique({ where: { id: v.agreementId } }),
      db.invoice.findUnique({ where: { id: v.invoiceId } }),
      db.invitation.findUnique({ where: { id: v.invitationId } }),
      db.directMessage.findMany({ orderBy: { id: "asc" } }),
      db.candidate.findUnique({ where: { id: v.candidateId } }),
    ]);
  const parts = { vacancy, application, client, comments, interview, agreement, invoice, invitation, messages, candidate };
  return Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, JSON.stringify(value)]));
}

/** Какие таблицы жертвы изменились между двумя слепками. */
function changedTables(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}

/** Чтение: «ничего» — это null, пустой список или отказ. Любые данные — провал. */
function expectNothing(result: unknown) {
  if (result === null || result === undefined) return;
  if (Array.isArray(result)) {
    expect(result, "чужой клиент получил записи").toHaveLength(0);
    return;
  }
  throw new Error(`чужой клиент получил данные: ${JSON.stringify(result).slice(0, 200)}`);
}

/** Выполнить попытку: отказ (исключение) допустим, данные нет. */
async function attemptRead(call: () => Promise<unknown>) {
  try {
    expectNothing(await call());
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("чужой клиент получил")) throw error;
    // любой другой отказ (AccessDenied, «не найдено», NOT_FOUND) — то, что нужно
  }
}

/** Запись: обязана быть отказана и ничего не изменить. */
async function attemptWrite(call: () => Promise<unknown>) {
  const before = await snapshot();
  let result: unknown;
  let refused = false;
  try {
    result = await call();
  } catch {
    refused = true;
  }
  const after = await snapshot();
  const changed = changedTables(before, after);
  expect(changed, `чужая запись изменила данные жертвы (вернула: ${refused ? "исключение" : JSON.stringify(result)?.slice(0, 120)})`).toEqual([]);
  // Отказ без исключения (null/false) тоже отказ, а вернувшийся объект — нет
  if (!refused && result !== null && result !== undefined && result !== false) {
    throw new Error(`чужая запись «прошла»: ${JSON.stringify(result).slice(0, 200)}`);
  }
}

describe("контроль: владелец видит свои объекты (тест не вхолостую)", () => {
  it("вакансия, заявка, кандидат и клиент открываются", async () => {
    expect(await getVacancy(owner, v.vacancyId)).not.toBeNull();
    expect(await getApplication(owner, v.applicationId)).not.toBeNull();
    expect(await getCandidate(agencyStaff, v.candidateId)).not.toBeNull();
    expect(await getClient(owner, VICTIM_CLIENT)).not.toBeNull();
  });

  it("счета клиента владельцу отдаются", async () => {
    const own = await listInvoices(owner, { clientId: VICTIM_CLIENT });
    expect(JSON.stringify(own)).toContain(v.invoiceId);
  });
});

describe("чужой клиент читает по прямому идентификатору", () => {
  it("вакансия", () => attemptRead(() => getVacancy(attacker, v.vacancyId)));
  it("заявка", () => attemptRead(() => getApplication(attacker, v.applicationId)));
  it("кандидат", () => attemptRead(() => getCandidate(attacker, v.candidateId)));
  it("карточка клиента", () => attemptRead(() => getClient(attacker, VICTIM_CLIENT)));
  it("комментарии вакансии", () => attemptRead(() => listVacancyComments(attacker, v.vacancyId)));
  it("комментарии заявки", () => attemptRead(() => listApplicationComments(attacker, v.applicationId)));
  it("собеседования заявки", () => attemptRead(() => listApplicationInterviews(attacker, v.applicationId)));
  it("переписка с чужим сотрудником", () => attemptRead(() => listDirectMessages(attacker, owner.id)));
  it("карточка чужого собеседника", () => attemptRead(() => getCorrespondent(attacker, owner.id)));
  it("счета чужого клиента", async () => {
    const result = await listInvoices(attacker, { clientId: VICTIM_CLIENT }).catch(() => []);
    expect(JSON.stringify(result)).not.toContain(v.invoiceId);
  });
});

describe("чужой клиент пишет по прямому идентификатору", () => {
  it("комментарий к чужой вакансии", () =>
    attemptWrite(() => createComment(attacker, { vacancyId: v.vacancyId, body: "взлом", visibility: "SHARED" })));
  it("комментарий к чужой заявке", () =>
    attemptWrite(() => createComment(attacker, { applicationId: v.applicationId, body: "взлом", visibility: "SHARED" })));
  it("правка и удаление чужого комментария", async () => {
    await attemptWrite(() => editComment(attacker, v.commentId, "подделано"));
    await attemptWrite(() => deleteComment(attacker, v.commentId));
  });
  it("решение по чужой заявке", async () => {
    await attemptWrite(() => setClientDecision(attacker, v.applicationId, "REJECT", { rejection: { reasonCode: "OTHER", comment: "взлом" } as never }));
    await attemptWrite(() => setClientDecision(attacker, v.applicationId, "OFFER"));
  });
  it("отказ кандидату и его отмена", async () => {
    await attemptWrite(() => rejectApplication(attacker, v.applicationId, { reasonCode: "OTHER", comment: "взлом" } as never));
    await attemptWrite(() => undoClientRejection(attacker, v.applicationId));
  });
  it("перенос чужой заявки по стадиям", () => attemptWrite(() => moveStage(attacker, v.applicationId, v.otherStageId)));
  it("чужое собеседование: переход и оценка", async () => {
    await attemptWrite(() => transitionInterview(attacker, v.interviewId, "CANCELLED"));
    await attemptWrite(() => submitFeedback(attacker, v.interviewId, { rating: 5, note: "взлом" }));
  });
  it("сообщение чужому сотруднику", () => attemptWrite(() => sendDirectMessage(attacker, owner.id, "взлом")));
  it("правка чужой компании", () => attemptWrite(() => updateClient(attacker, VICTIM_CLIENT, { name: "Взломано" } as never)));
  it("отзыв чужого приглашения", () => attemptWrite(() => revokeClientInvitation(attacker, v.invitationId)));
  it("чужой договор: подтверждение и расторжение", async () => {
    await attemptWrite(() => confirmAgreement(attacker, v.agreementId));
    await attemptWrite(() => terminateAgreement(attacker, v.agreementId));
  });
  it("чужой счёт: смена статуса", () => attemptWrite(() => transitionInvoice(attacker, v.invoiceId, "PAID")));
});
