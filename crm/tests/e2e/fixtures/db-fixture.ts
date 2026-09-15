/**
 * Мост к Prisma для e2e-тестов.
 *
 * Playwright Test компилирует спеки в CJS и не умеет собственный ESM-
 * клиент Prisma (import.meta внутри lib/generated/prisma/client.ts —
 * валидный ESM, но не CJS): прямой `import { prisma }` в *.spec.ts
 * падает с "Cannot use 'import.meta' outside a module". Vitest этой
 * проблемы не видит вовсе — у него нативно ESM-евый Vite-транспайлер.
 *
 * Обход — тот же, что у остальных разовых скриптов проекта (npm run
 * smoke, npm run setup:real): отдельный процесс под tsx, который ESM
 * понимает нативно. Спек вызывает этот файл через node:child_process
 * (см. tests/e2e/fixtures/db-client.ts) вместо прямого импорта.
 *
 * Работает с базой из DATABASE_URL — той же, что использует запущенный
 * `npm run dev` (USE_TEST_DB здесь не выставляется, см. lib/db/prisma.ts).
 */
import "dotenv/config";

import { prisma } from "../../../lib/db/prisma";

type Input =
  | {
      op: "createCandidate";
      organizationId: string;
      createdById: string;
      fullName: string;
    }
  | {
      op: "createApplicationFixture";
      organizationId: string;
      vacancyId: string;
      stageCode: string;
      createdById: string;
      ownerId: string;
      fullName: string;
      consentStatus: "GIVEN";
      consentExpiresAtIso: string;
    }
  | {
      op: "createPresentedApplicationFixture";
      organizationId: string;
      vacancyId: string;
      createdById: string;
      ownerId: string;
      fullName: string;
    }
  | {
      op: "createInterviewFixture";
      organizationId: string;
      vacancyId: string;
      stageCode: string;
      createdById: string;
      ownerId: string;
      fullName: string;
    }
  | {
      op: "createComment";
      organizationId: string;
      applicationId: string;
      authorId: string;
      body: string;
    }
  | { op: "getApplicationStage"; applicationId: string }
  | { op: "getInterviewStatus"; interviewId: string }
  | { op: "cleanupCandidate"; candidateId: string };

async function run(input: Input) {
  switch (input.op) {
    case "createCandidate": {
      const candidate = await prisma.candidate.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.createdById,
          fullName: input.fullName,
        },
        select: { id: true },
      });
      return { candidateId: candidate.id };
    }

    case "createApplicationFixture": {
      const stage = await prisma.pipelineStage.findFirstOrThrow({
        where: { vacancyId: input.vacancyId, code: input.stageCode },
        select: { id: true },
      });

      const candidate = await prisma.candidate.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.createdById,
          fullName: input.fullName,
          consentStatus: input.consentStatus,
          consentExpiresAt: new Date(input.consentExpiresAtIso),
        },
        select: { id: true },
      });

      // Привязано к кандидату, как это делает uploadResumeAction — presentToClient
      // и страница заявки ищут резюме по candidateId ИЛИ applicationId, содержимое
      // файла им не нужно
      await prisma.attachment.create({
        data: {
          organizationId: input.organizationId,
          kind: "RESUME",
          fileName: "e2e-resume.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          storageKey: `e2e-test/${candidate.id}/resume.pdf`,
          visibility: "INTERNAL",
          candidateId: candidate.id,
          uploadedById: input.createdById,
        },
      });

      const application = await prisma.application.create({
        data: {
          organizationId: input.organizationId,
          vacancyId: input.vacancyId,
          candidateId: candidate.id,
          stageId: stage.id,
          ownerId: input.ownerId,
        },
        select: { id: true },
      });

      return { candidateId: candidate.id, applicationId: application.id };
    }

    case "createPresentedApplicationFixture": {
      // Решение клиента (setClientDecision) требует только presentedAt —
      // резюме и согласие проверяет отдельно presentToClient, здесь эти
      // поля выставляются напрямую, минуя саму процедуру представления
      const stage = await prisma.pipelineStage.findFirstOrThrow({
        where: { vacancyId: input.vacancyId, code: "PRESENTED" },
        select: { id: true },
      });

      const candidate = await prisma.candidate.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.createdById,
          fullName: input.fullName,
        },
        select: { id: true },
      });

      const application = await prisma.application.create({
        data: {
          organizationId: input.organizationId,
          vacancyId: input.vacancyId,
          candidateId: candidate.id,
          stageId: stage.id,
          ownerId: input.ownerId,
          presentationSummary: "E2E: почему подходит — фикстура теста.",
          presentedAt: new Date(),
          presentedById: input.createdById,
        },
        select: { id: true },
      });

      return { candidateId: candidate.id, applicationId: application.id };
    }

    case "createInterviewFixture": {
      // Тот же момент, что и после setClientDecision(INTERVIEW) в
      // lib/services/applications.ts — встреча заведена, слоты ещё
      // не предложены. Решение клиента здесь не воспроизводим: этот
      // код путь уже проверен в client-decision.spec.ts
      const stage = await prisma.pipelineStage.findFirstOrThrow({
        where: { vacancyId: input.vacancyId, code: input.stageCode },
        select: { id: true },
      });

      const candidate = await prisma.candidate.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.createdById,
          fullName: input.fullName,
        },
        select: { id: true },
      });

      const application = await prisma.application.create({
        data: {
          organizationId: input.organizationId,
          vacancyId: input.vacancyId,
          candidateId: candidate.id,
          stageId: stage.id,
          ownerId: input.ownerId,
        },
        select: { id: true },
      });

      const interview = await prisma.interview.create({
        data: {
          organizationId: input.organizationId,
          applicationId: application.id,
          vacancyId: input.vacancyId,
          type: "CLIENT",
          status: "SLOTS_REQUESTED",
          createdById: input.createdById,
        },
        select: { id: true },
      });

      return {
        candidateId: candidate.id,
        applicationId: application.id,
        interviewId: interview.id,
      };
    }

    case "getApplicationStage": {
      const application = await prisma.application.findUniqueOrThrow({
        where: { id: input.applicationId },
        select: {
          presentedAt: true,
          outcome: true,
          clientDecision: true,
          stage: { select: { code: true } },
        },
      });
      return {
        stageCode: application.stage.code,
        presentedAt: application.presentedAt,
        outcome: application.outcome,
        clientDecision: application.clientDecision,
      };
    }

    case "createComment": {
      const comment = await prisma.comment.create({
        data: {
          organizationId: input.organizationId,
          applicationId: input.applicationId,
          authorId: input.authorId,
          body: input.body,
          visibility: "SHARED",
        },
        select: { id: true },
      });
      return { commentId: comment.id };
    }

    case "getInterviewStatus": {
      const interview = await prisma.interview.findUniqueOrThrow({
        where: { id: input.interviewId },
        select: { status: true, scheduledAt: true },
      });
      return { status: interview.status, scheduledAt: interview.scheduledAt };
    }

    case "cleanupCandidate": {
      await prisma.attachment.deleteMany({ where: { candidateId: input.candidateId } });
      await prisma.application.deleteMany({ where: { candidateId: input.candidateId } });
      await prisma.candidate.delete({ where: { id: input.candidateId } });
      return {};
    }
  }
}

const raw = process.argv[2];
if (!raw) {
  console.error("Использование: tsx db-fixture.ts '<JSON по типу Input>'");
  process.exit(1);
}

run(JSON.parse(raw) as Input)
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
    return prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
