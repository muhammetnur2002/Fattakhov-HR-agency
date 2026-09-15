-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'HEAD', 'RECRUITER', 'ACCOUNT', 'CLIENT_ADMIN', 'CLIENT_HIRING', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('LEAD', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('PERCENT_ANNUAL', 'PERCENT_MONTHLY', 'FIXED_PER_HIRE', 'SUBSCRIPTION', 'HOURLY');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CLARIFYING', 'ESTIMATED', 'ACTIVE', 'ON_HOLD', 'CLOSED_SUCCESS', 'CLOSED_CANCELLED', 'CLOSED_FAILED');

-- CreateEnum
CREATE TYPE "WorkFormat" AS ENUM ('OFFICE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'PROJECT', 'GPH', 'SELF_EMPLOYED');

-- CreateEnum
CREATE TYPE "VacancyUrgency" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('HH', 'AVITO', 'TELEGRAM', 'LINKEDIN', 'REFERRAL', 'OWN_BASE', 'DIRECT_SEARCH', 'INBOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GIVEN', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApplicationOutcome" AS ENUM ('IN_PROGRESS', 'HIRED', 'REJECTED', 'WITHDRAWN', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ClientDecision" AS ENUM ('INTERVIEW', 'HOLD', 'REJECT', 'OFFER');

-- CreateEnum
CREATE TYPE "RejectionSide" AS ENUM ('CLIENT', 'CANDIDATE', 'AGENCY');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('EXPERIENCE_MISMATCH', 'SKILLS_MISMATCH', 'SALARY_TOO_HIGH', 'CULTURE_FIT', 'OVERQUALIFIED', 'LOCATION', 'FAILED_INTERVIEW', 'FAILED_TEST_TASK', 'POSITION_CLOSED', 'ACCEPTED_OTHER_OFFER', 'SALARY_TOO_LOW', 'NOT_INTERESTED', 'COUNTEROFFER', 'CONDITIONS_MISMATCH', 'NO_CONTACT', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL', 'SHARED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SLOTS_REQUESTED', 'SLOTS_PROPOSED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InterviewFormat" AS ENUM ('ONLINE', 'OFFICE', 'PHONE');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('SCREENING', 'CLIENT', 'FINAL', 'TEST_TASK_REVIEW');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RESUME', 'COVER_LETTER', 'TEST_TASK', 'PORTFOLIO', 'CONTRACT', 'INVOICE', 'ACT', 'CONSENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "logoUrl" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL,
    "position" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "clientId" TEXT,
    "telegramChatId" TEXT,
    "notifyPrefs" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "clientId" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "inn" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "city" TEXT,
    "accountManagerId" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'LEAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pricingModel" "PricingModel" NOT NULL,
    "percentRate" DECIMAL(5,2),
    "monthsCount" INTEGER,
    "fixedAmount" DECIMAL(12,2),
    "subscriptionAmount" DECIMAL(12,2),
    "subscriptionSlots" INTEGER,
    "hourlyRate" DECIMAL(10,2),
    "guaranteeDays" INTEGER NOT NULL DEFAULT 90,
    "paymentTerms" TEXT,
    "prepaymentPercent" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "AgreementStatus" NOT NULL DEFAULT 'PENDING',
    "fileUrl" TEXT,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agreementId" TEXT,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "VacancyStatus" NOT NULL DEFAULT 'DRAFT',
    "department" TEXT,
    "hiringManagerId" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "reasonForHire" TEXT,
    "responsibilities" TEXT,
    "requirements" TEXT,
    "niceToHave" TEXT,
    "conditions" TEXT,
    "salaryFrom" DECIMAL(12,2),
    "salaryTo" DECIMAL(12,2),
    "salaryCurrency" TEXT NOT NULL DEFAULT 'RUB',
    "salaryGross" BOOLEAN NOT NULL DEFAULT true,
    "bonusScheme" TEXT,
    "city" TEXT,
    "workFormat" "WorkFormat",
    "employmentType" "EmploymentType",
    "workSchedule" TEXT,
    "stopFactors" TEXT,
    "targetCompanies" TEXT,
    "interviewStages" TEXT,
    "urgency" "VacancyUrgency" NOT NULL DEFAULT 'NORMAL',
    "desiredStartDate" TIMESTAMP(3),
    "leadRecruiterId" TEXT,
    "recruiterIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedFirstCandidatesAt" TIMESTAMP(3),
    "estimatedCloseAt" TIMESTAMP(3),
    "agencyNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "isReplacementFor" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "slaHours" INTEGER,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegram" TEXT,
    "city" TEXT,
    "birthYear" INTEGER,
    "currentPosition" TEXT,
    "currentCompany" TEXT,
    "totalExperienceYears" DECIMAL(4,1),
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" JSONB,
    "education" TEXT,
    "summary" TEXT,
    "salaryExpectation" DECIMAL(12,2),
    "salaryCurrency" TEXT NOT NULL DEFAULT 'RUB',
    "source" "CandidateSource" NOT NULL DEFAULT 'OTHER',
    "sourceDetails" TEXT,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentGivenAt" TIMESTAMP(3),
    "consentExpiresAt" TIMESTAMP(3),
    "consentDocUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "ApplicationOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "rejectionReason" "RejectionReason",
    "rejectionComment" TEXT,
    "rejectedBy" "RejectionSide",
    "presentationSummary" TEXT,
    "presentedAt" TIMESTAMP(3),
    "presentedById" TEXT,
    "clientDecision" "ClientDecision",
    "clientDecisionAt" TIMESTAMP(3),
    "clientDecisionById" TEXT,
    "submittedOnBehalfById" TEXT,
    "offerSalary" DECIMAL(12,2),
    "offerPosition" TEXT,
    "offerSentAt" TIMESTAMP(3),
    "offerStartDate" TIMESTAMP(3),
    "hiredAt" TIMESTAMP(3),
    "guaranteeUntil" TIMESTAMP(3),
    "guaranteeBrokenAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "fromOutcome" "ApplicationOutcome",
    "toOutcome" "ApplicationOutcome",
    "comment" TEXT,
    "hoursInPreviousStage" DECIMAL(10,2),
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT,
    "vacancyId" TEXT,
    "body" TEXT NOT NULL,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'SHARED',
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentRead" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRead_pkey" PRIMARY KEY ("commentId","userId")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SLOTS_REQUESTED',
    "format" "InterviewFormat" NOT NULL DEFAULT 'ONLINE',
    "meetingUrl" TEXT,
    "address" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "participantUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "candidateToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "feedbackRating" INTEGER,
    "feedbackNote" TEXT,
    "feedbackById" TEXT,
    "feedbackAt" TIMESTAMP(3),
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder1hSentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSlot" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'SHARED',
    "candidateId" TEXT,
    "applicationId" TEXT,
    "vacancyId" TEXT,
    "clientId" TEXT,
    "invoiceId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agreementId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(12,2) NOT NULL,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "description" TEXT,
    "vacancyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "actFileUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentEmailAt" TIMESTAMP(3),
    "sentTelegramAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalDataAccessLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalDataAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_email_idx" ON "Invitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Agreement_clientId_status_idx" ON "Agreement"("clientId", "status");

-- CreateIndex
CREATE INDEX "Vacancy_clientId_status_idx" ON "Vacancy"("clientId", "status");

-- CreateIndex
CREATE INDEX "Vacancy_leadRecruiterId_status_idx" ON "Vacancy"("leadRecruiterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_organizationId_number_key" ON "Vacancy"("organizationId", "number");

-- CreateIndex
CREATE INDEX "PipelineStage_vacancyId_order_idx" ON "PipelineStage"("vacancyId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_vacancyId_code_key" ON "PipelineStage"("vacancyId", "code");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_fullName_idx" ON "Candidate"("organizationId", "fullName");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_phone_idx" ON "Candidate"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Application_vacancyId_stageId_idx" ON "Application"("vacancyId", "stageId");

-- CreateIndex
CREATE INDEX "Application_ownerId_outcome_idx" ON "Application"("ownerId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "Application_vacancyId_candidateId_key" ON "Application"("vacancyId", "candidateId");

-- CreateIndex
CREATE INDEX "StageTransition_applicationId_createdAt_idx" ON "StageTransition"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_applicationId_createdAt_idx" ON "Comment"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_vacancyId_createdAt_idx" ON "Comment"("vacancyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_candidateToken_key" ON "Interview"("candidateToken");

-- CreateIndex
CREATE INDEX "Interview_vacancyId_scheduledAt_idx" ON "Interview"("vacancyId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Interview_organizationId_scheduledAt_idx" ON "Interview"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewSlot_interviewId_idx" ON "InterviewSlot"("interviewId");

-- CreateIndex
CREATE INDEX "Attachment_candidateId_idx" ON "Attachment"("candidateId");

-- CreateIndex
CREATE INDEX "Attachment_applicationId_idx" ON "Attachment"("applicationId");

-- CreateIndex
CREATE INDEX "Invoice_clientId_status_idx" ON "Invoice"("clientId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_createdAt_idx" ON "ActivityLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_organizationId_createdAt_idx" ON "ActivityLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalDataAccessLog_candidateId_createdAt_idx" ON "PersonalDataAccessLog"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalDataAccessLog_organizationId_createdAt_idx" ON "PersonalDataAccessLog"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
