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
