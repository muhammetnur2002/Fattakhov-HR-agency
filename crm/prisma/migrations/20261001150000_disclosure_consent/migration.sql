-- Подтверждение передачи данных конкретному работодателю (§4.2 согласия
-- кандидата, раздел 6 Политики): одна запись — пара «кандидат + вакансия»,
-- со снимком реквизитов работодателя и следом волеизъявления (§8.3).
-- Новая таблица, существующие не меняются: накат безопасен на живой базе.

-- CreateEnum
CREATE TYPE "DisclosureContactMode" AS ENUM ('DIRECT', 'VIA_AGENCY');

-- CreateTable
CREATE TABLE "DisclosureConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "employerName" TEXT NOT NULL,
    "employerInn" TEXT,
    "vacancyTitle" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "version" TEXT,
    "contactMode" "DisclosureContactMode",
    "givenAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "token" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisclosureConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisclosureConsent_token_key" ON "DisclosureConsent"("token");

-- CreateIndex
CREATE INDEX "DisclosureConsent_candidateId_vacancyId_idx" ON "DisclosureConsent"("candidateId", "vacancyId");

-- CreateIndex
CREATE INDEX "DisclosureConsent_organizationId_status_idx" ON "DisclosureConsent"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

