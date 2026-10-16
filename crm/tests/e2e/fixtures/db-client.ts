import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TSX_CLI = require.resolve("tsx/cli");
const FIXTURE_SCRIPT = path.join(__dirname, "db-fixture.ts");

/** Прогоняет одну операцию db-fixture.ts в отдельном процессе — зачем, см. его комментарий. */
async function call<T>(input: object): Promise<T> {
  const { stdout } = await execFileAsync(process.execPath, [
    TSX_CLI,
    FIXTURE_SCRIPT,
    JSON.stringify(input),
  ]);
  return JSON.parse(stdout) as T;
}

export function createCandidate(params: {
  organizationId: string;
  createdById: string;
  fullName: string;
}): Promise<{ candidateId: string }> {
  return call({ op: "createCandidate", ...params });
}

export function createApplicationFixture(params: {
  organizationId: string;
  vacancyId: string;
  stageCode: string;
  createdById: string;
  ownerId: string;
  fullName: string;
  consentStatus: "GIVEN";
  consentExpiresAtIso: string;
}): Promise<{ candidateId: string; applicationId: string }> {
  return call({ op: "createApplicationFixture", ...params });
}

export function createPresentedApplicationFixture(params: {
  organizationId: string;
  vacancyId: string;
  createdById: string;
  ownerId: string;
  fullName: string;
}): Promise<{ candidateId: string; applicationId: string }> {
  return call({ op: "createPresentedApplicationFixture", ...params });
}

export function getApplicationStage(params: { applicationId: string }): Promise<{
  stageCode: string;
  presentedAt: string | null;
  outcome: string;
  clientDecision: string | null;
}> {
  return call({ op: "getApplicationStage", ...params });
}

export function createInterviewFixture(params: {
  organizationId: string;
  vacancyId: string;
  stageCode: string;
  createdById: string;
  ownerId: string;
  fullName: string;
}): Promise<{ candidateId: string; applicationId: string; interviewId: string }> {
  return call({ op: "createInterviewFixture", ...params });
}

export function getInterviewStatus(params: { interviewId: string }): Promise<{
  status: string;
  scheduledAt: string | null;
}> {
  return call({ op: "getInterviewStatus", ...params });
}

export function createComment(params: {
  organizationId: string;
  applicationId: string;
  authorId: string;
  body: string;
}): Promise<{ commentId: string }> {
  return call({ op: "createComment", ...params });
}

export function cleanupCandidate(params: { candidateId: string }): Promise<object> {
  return call({ op: "cleanupCandidate", ...params });
}

export function cleanupDraftVacancies(params: { titlePrefix: string }): Promise<{ removed: number }> {
  return call({ op: "cleanupDraftVacancies", ...params }) as Promise<{ removed: number }>;
}

export function createLeads(params: {
  leads: {
    name: string;
    contact: string;
    company?: string;
    website?: string;
    vacancies?: string;
    note?: string;
    status: "NEW" | "IN_PROGRESS" | "SPAM" | "CONVERTED" | "REJECTED";
  }[];
}): Promise<{ ids: string[] }> {
  return call({ op: "createLeads", ...params });
}

export function cleanupLeads(params: { namePrefix: string }): Promise<{ removed: number }> {
  return call({ op: "cleanupLeads", ...params }) as Promise<{ removed: number }>;
}

/** Самостоятельно зарегистрированная компания с администратором (пароль demo1234); анкета не пройдена, пока `briefCompleted` ложь. */
export function createSelfRegisteredClient(params: {
  email: string;
  briefCompleted: boolean;
}): Promise<{ clientId: string; userId: string }> {
  return call({ op: "createSelfRegisteredClient", ...params });
}

export function deleteSelfRegisteredClient(params: { email: string }): Promise<{ removed: number }> {
  return call({ op: "deleteSelfRegisteredClient", ...params }) as Promise<{ removed: number }>;
}

/**
 * Неотвеченное приглашение (экран «Отозвать»): по умолчанию администратор клиента; `clientId: null` и
 * `role: "RECRUITER"` — сотрудник агентства. `withLink` — со ссылкой, которую экран может показать.
 */
export function createInvitation(params: {
  organizationId: string;
  clientId: string | null;
  email: string;
  createdById: string;
  role?: "CLIENT_ADMIN" | "RECRUITER";
  withLink?: boolean;
}): Promise<{ invitationId: string }> {
  return call({ op: "createInvitation", ...params });
}

export function invitationExists(params: { invitationId: string }): Promise<{ exists: boolean }> {
  return call({ op: "invitationExists", ...params });
}

export function deleteInvitation(params: { invitationId: string }): Promise<{ removed: number }> {
  return call({ op: "deleteInvitation", ...params }) as Promise<{ removed: number }>;
}

/** Страница ВКонтакте у пользователя (экран «Отвязать»); `null` — отвязана. */
export function setVkUser(params: { userId: string; vkUserId: string | null }): Promise<object> {
  return call({ op: "setVkUser", ...params });
}

export function getVkUser(params: { userId: string }): Promise<{ vkUserId: string | null }> {
  return call({ op: "getVkUser", ...params });
}
